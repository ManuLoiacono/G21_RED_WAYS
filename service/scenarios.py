"""As-of record selection, separate from verification data and movement effects."""

from dataclasses import dataclass, replace

from engine import DaylightWindow, Departure, SnapshotReference
from .prepared import FixtureClockMapping, PreparedRecord, PreparedScenario
from .validation import PlanningInputError, identity, utc


@dataclass(frozen=True)
class DecisionRecord:
    record: PreparedRecord
    effective_available_at_utc: str
    availability_basis: str


@dataclass(frozen=True)
class RecordExclusion:
    record_id: str
    code: str


@dataclass(frozen=True)
class SelectedScenario:
    snapshot: SnapshotReference
    departure: Departure
    daylight: DaylightWindow | None
    decision_records: tuple[DecisionRecord, ...]
    exclusions: tuple[RecordExclusion, ...]
    missing_required: tuple[str, ...]
    missing_optional_variables: tuple[str, ...]
    assumptions: tuple[str, ...]
    clock: FixtureClockMapping
    selection_rule: str = "Latest eligible issue time, then effective availability, then revision within each source/kind/series; no outcome scoring."


def select_scenario(scenario: PreparedScenario, as_of_utc: str, departure_utc: str, *, evaluation_location=None) -> SelectedScenario:
    from .solar import ADAPTER, METHOD
    real = scenario.clock.adapter_id == ADAPTER
    if real:
        from .real_environment import solar_record
        if evaluation_location is None:
            raise PlanningInputError("missing_solar_location", "environment.location", "Real solar evidence requires actual analytical evaluation coordinates.")
        derived = solar_record(scenario, departure_utc, evaluation_location)
        scenario = replace(scenario, evaluation_location_id=evaluation_location[2],
                           records=(*scenario.records, *((derived,) if derived else ())))
    cutoff = utc(as_of_utc, "scenario.as_of_utc")
    # Require explicit fixture mapping coverage for both the decision and departure.
    scenario.clock.departure(as_of_utc, path="scenario.as_of_utc")
    if utc(departure_utc, "mission.departure_utc") < cutoff:
        raise PlanningInputError("departure_before_cutoff", "mission.departure_utc", "A fresh mission cannot use later decision information for an earlier departure.")
    departure = scenario.clock.departure(departure_utc)
    cutoff_text = cutoff.isoformat().replace("+00:00", "Z")
    eligible, exclusions = {}, []
    assumptions = [scenario.clock.assumption]
    assumptions.append("Derived geometric daylight uses a spherical horizontal horizon, solar center at 0 degrees; no refraction, terrain shadow or scene registration." if real else "Synthetic record values/times do not claim archival NASA availability.")
    for record in scenario.records:
        if record.kind == "verification":
            exclusions.append(RecordExclusion(record.record_id, "verification_only"))
            continue
        available = record.available_at_utc
        basis = "declared_fixture_availability"
        if available is None:
            if scenario.availability_policy == "reconstruct_declared" and record.reconstructed_available_at_utc is not None:
                available = record.reconstructed_available_at_utc
                basis = "reconstructed_assumption"
            else:
                exclusions.append(RecordExclusion(record.record_id, "unknown_availability"))
                continue
        if utc(available, "record.available_at_utc") > cutoff:
            exclusions.append(RecordExclusion(record.record_id, "not_available_as_of"))
            continue
        if record.issued_at_utc is not None and utc(record.issued_at_utc, "record.issued_at_utc") > cutoff:
            exclusions.append(RecordExclusion(record.record_id, "not_issued_as_of"))
            continue
        if record.observation_end_utc is not None and utc(record.observation_end_utc, "record.observation_end_utc") > cutoff:
            exclusions.append(RecordExclusion(record.record_id, "observation_interval_incomplete"))
            continue
        # Availability, completed observation interval and issue time are all gates.
        gates = [utc(available, "record.available_at_utc")]
        gates.extend(utc(value, "record.time") for value in (record.issued_at_utc, record.observation_end_utc) if value is not None)
        effective = max(gates).isoformat().replace("+00:00", "Z")
        selected = DecisionRecord(record, effective, basis)
        key = (record.kind, record.source_id, record.series_id)
        rank = (utc(record.issued_at_utc or effective, "record.issue_or_availability"), utc(effective, "record.effective_available_at_utc"), record.revision)
        previous = eligible.get(key)
        if previous is None or rank > previous[0]:
            if previous is not None:
                exclusions.append(RecordExclusion(previous[1].record.record_id, "superseded_eligible_revision"))
            eligible[key] = (rank, selected)
        else:
            exclusions.append(RecordExclusion(record.record_id, "superseded_eligible_revision"))
    records = tuple(item[1] for _, item in sorted(eligible.items()))
    solar = [item.record for item in records if item.record.kind == "daylight"]
    if len(solar) > 1:
        raise PlanningInputError("ambiguous_daylight", "scenario.records", "Multiple eligible solar series require an explicit preparation choice.")
    daylight = None
    if solar:
        record = solar[0]
        if record.epoch_id != scenario.clock.timeline.epoch_id or record.source_location_id != scenario.evaluation_location_id:
            raise PlanningInputError("daylight_context_mismatch", "scenario.records", "Selected solar evidence has the wrong epoch or location.")
        daylight = DaylightWindow(scenario.clock.timeline, *record.value, scenario.evaluation_location_id,
                                  METHOD if real else "Prepared synthetic physical-second window; no inferred solar conversion.", record.record_id, record.evidence_kind)
    assumptions.extend(item.record.availability_assumption for item in records if item.availability_basis == "reconstructed_assumption")
    if any(item.availability_basis == "reconstructed_assumption" for item in records):
        assumptions.append("Retrospective reconstruction, not an exact reproduction of operational knowledge.")
    snapshot_id = identity({"package": scenario.content_id, "cutoff": cutoff_text,
                            "selected": [item.record.record_id for item in records], "policy": scenario.availability_policy,
                            "departure": departure_utc, "evaluation_location": scenario.evaluation_location_id})
    available_at = max((item.effective_available_at_utc for item in records), key=lambda value: utc(value, "record.time"), default=cutoff_text)
    snapshot = SnapshotReference(scenario.id, scenario.version, snapshot_id, cutoff_text, available_at,
                                 f"{scenario.availability_policy}; exact eligible records only; empty selection attested at cutoff.",
                                 scenario.evaluation_location_id, scenario.fixture)
    variables = {item.record.variable for item in records if item.record.value is not None}
    optional = tuple(item for item in ("pressure_pa", "daily_min_temp_c", "daily_max_temp_c") if item not in variables)
    return SelectedScenario(snapshot, departure, daylight, records, tuple(exclusions), () if daylight else ("daylight",), optional, tuple(assumptions), scenario.clock)
