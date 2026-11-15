"""Real Gale scenario construction and location-matched derived solar evidence."""

from dataclasses import replace
import math

from .environment_package import source_metadata
from .prepared import PreparedRecord, PreparedScenario
from .solar import EPOCH, EPOCH_ID, METHOD, MarsClockMapping, daylight_interval, iso, offset, sol_instant, sol_lmst
from .validation import canonical, identity, loads_strict


def replay_scenarios(parcel, package):
    from .historical_forecasts import load_forecasts, load_observations
    records = (*load_forecasts(package), *load_observations(package))
    first, last = package["replay_sols"]
    clock = MarsClockMapping(sol_instant(first), sol_instant(last + 1))
    metadata = {**source_metadata(package), "solar_method": METHOD, "source_package_id": package["content_id"],
                "method_reference": "https://www.giss.nasa.gov/tools/mars24/help/algorithm.html",
                "source_retrieved_at_utc": package["source_provenance"]["rems"]["fetched_at"]}
    base = next(p for p in parcel.pois if p.id == "base")
    lon, lat = (math.degrees(v / parcel.geographic_adapter["radius_m"]) for v in base.xy_m)
    demos = []
    for record in records:
        if record.kind != "forecast" or record.reconstructed_available_at_utc is None or record.quantiles.get("p50") is None:
            continue
        candidate = max(offset(record.reconstructed_available_at_utc), offset(record.valid_from_utc), offset(clock.valid_from_utc))
        if candidate >= min(offset(record.valid_to_utc), offset(clock.valid_to_utc)):
            continue
        _, (rise, setting) = daylight_interval(iso(candidate), lon, lat)
        candidate = max(candidate, rise)
        if candidate < min(setting, offset(record.valid_to_utc), offset(clock.valid_to_utc)):
            demos.append(candidate)
    demo = iso(math.ceil(min(demos))) if demos else sol_instant(first, 9, lon)
    metadata.update(default_instant_utc=demo, provider_version="exported-hindcast-provider-v1",
                    default_explanation="First chronological eligible target coverage with geometric daylight at the prepared base, rounded upward to a UTC second; no outcome scoring." if demos else "No eligible forecast coverage; first replay sol at 09:00 LMST.")
    scenario = PreparedScenario("gale_historical_replay", "v1", parcel.id, parcel.version, parcel.evaluation_location_id,
                                False, clock, "reconstruct_declared", records, ("daylight",),
                                identity({"sources": package["content_id"], "clock": clock.adapter_id, "solar": METHOD}), canonical(metadata))
    missing = replace(scenario, id="gale_historical_missing_daylight", content_id=identity({"parent": scenario.content_id, "missing": "daylight"}))
    return scenario, missing


def solar_record(scenario, departure_utc, location=None):
    metadata = loads_strict(scenario.metadata_json)
    lon, lat, location_id = location
    sol, values = daylight_interval(departure_utc, lon, lat)
    if scenario.id == "gale_historical_missing_daylight":
        return None
    return PreparedRecord(
        record_id=f"{METHOD}:{sol}:{identity([lon, lat])[:16]}", series_id="geometric-daylight", revision=1,
        kind="daylight", variable="daylight", value=values, units="physical_second", evidence_kind="derived",
        source_id=METHOD, source_location_id=location_id, spatial_scope=f"Spherical horizontal horizon at source lon={lon:.9f}, lat={lat:.9f}; solar center altitude 0 degrees; no refraction, solar disk, elevation dip or terrain shadow.",
        fetched_at_utc=None, available_at_utc=scenario.clock.valid_from_utc, epoch_id=EPOCH_ID,
        provenance={"method_reference": metadata["method_reference"], "retrieval_state": "Computed analytically during planning; no retrieved solar observation.",
                    "availability_basis": "Deterministic astronomical reconstruction assumed computable at replay cutoff."})
