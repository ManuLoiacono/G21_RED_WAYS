"""Record eligibility is determined before decisions, without outcome leakage."""

from dataclasses import replace
import unittest

from service.prepared import fixture_registry
from service.scenarios import select_scenario
from service.validation import PlanningInputError


class ScenarioChecks(unittest.TestCase):
    def setUp(self):
        self.registry = fixture_registry()
        self.parcel = self.registry.parcel("synthetic_metric_demo", "v1")
        self.scenario = self.registry.scenario("synthetic_replay", "v1", self.parcel)

    def select(self, scenario=None, cutoff="2025-10-25T12:00:00Z"):
        return select_scenario(scenario or self.scenario, cutoff, cutoff)

    def test_future_daily_and_later_revisions_never_enter_decisions(self):
        selected = self.select()
        ids = {item.record.record_id for item in selected.decision_records}
        self.assertEqual(ids, {"synthetic-daylight-r1", "synthetic-previous-daily", "synthetic-pressure-forecast-r1"})
        self.assertIn("daily_min_temp_c", selected.missing_optional_variables)
        self.assertIn("daily_max_temp_c", selected.missing_optional_variables)
        self.assertTrue(selected.snapshot.fixture)
        self.assertEqual(selected.snapshot.available_at_utc, "2025-10-25T11:05:00Z")

    def test_observation_end_is_a_separate_gate_from_publication(self):
        record = next(item for item in self.scenario.records if item.record_id == "synthetic-future-daily")
        early_publication = replace(record, available_at_utc="2025-10-25T11:00:00Z")
        selected = self.select(replace(self.scenario, records=(early_publication,)))
        self.assertEqual(selected.decision_records, ())
        self.assertEqual(selected.exclusions[0].code, "observation_interval_incomplete")

    def test_future_valid_forecast_is_eligible_but_late_issue_is_not(self):
        forecast = next(item for item in self.scenario.records if item.kind == "forecast" and item.revision == 1)
        self.assertEqual(len(self.select(replace(self.scenario, records=(forecast,))).decision_records), 1)
        future_issue = replace(forecast, issued_at_utc="2025-10-25T12:00:01Z")
        selected = self.select(replace(self.scenario, records=(future_issue,)))
        self.assertEqual(selected.exclusions[0].code, "not_issued_as_of")

    def test_latest_eligible_revision_selected_without_looking_at_accuracy(self):
        later = self.select(cutoff="2025-10-25T13:05:00Z")
        forecasts = [item.record for item in later.decision_records if item.record.kind == "forecast"]
        self.assertEqual([item.revision for item in forecasts], [2])
        reversed_records = self.select(replace(self.scenario, records=tuple(reversed(self.scenario.records))), cutoff="2025-10-25T13:05:00Z")
        self.assertEqual(later.decision_records, reversed_records.decision_records)
        self.assertNotEqual(later.snapshot.snapshot_id, self.select().snapshot.snapshot_id)

    def test_unknown_availability_exclusion_and_explicit_reconstruction(self):
        record = next(item for item in self.scenario.records if item.available_at_utc is None)
        strict = self.select(replace(self.scenario, records=(record,)))
        self.assertEqual(strict.exclusions[0].code, "unknown_availability")
        reconstructed = self.select(replace(self.scenario, records=(record,), availability_policy="reconstruct_declared"))
        self.assertEqual(reconstructed.decision_records[0].availability_basis, "reconstructed_assumption")
        self.assertIn(record.availability_assumption, reconstructed.assumptions)
        self.assertTrue(any("Retrospective" in value for value in reconstructed.assumptions))
        future = replace(record, reconstructed_available_at_utc="2025-10-25T13:00:00Z")
        self.assertFalse(self.select(replace(self.scenario, records=(future,), availability_policy="reconstruct_declared")).decision_records)

    def test_verification_never_eligible_even_when_already_known(self):
        record = next(item for item in self.scenario.records if item.kind == "verification")
        record = replace(record, available_at_utc="2025-10-25T10:00:00Z", observation_end_utc="2025-10-25T09:00:00Z")
        result = self.select(replace(self.scenario, records=(record,)))
        self.assertEqual(result.decision_records, ())
        self.assertEqual(result.exclusions[0].code, "verification_only")

    def test_missing_required_solar_is_preserved(self):
        scenario = self.registry.scenario("synthetic_missing_daylight", "v1", self.parcel)
        result = self.select(scenario)
        self.assertIsNone(result.daylight)
        self.assertEqual(result.missing_required, ("daylight",))
        self.assertEqual(result.snapshot.available_at_utc, result.snapshot.as_of_utc)
        unknown_solar = replace(self.scenario.records[0], available_at_utc=None)
        self.assertIsNone(self.select(replace(self.scenario, records=(unknown_solar,))).daylight)

    def test_event_revisions_follow_same_issue_availability_rules(self):
        forecast = next(item for item in self.scenario.records if item.kind == "forecast")
        first = replace(forecast, kind="event", series_id="synthetic-event-01", record_id="event-r1")
        late = replace(first, revision=2, record_id="event-r2", available_at_utc="2025-10-25T13:00:00Z")
        result = self.select(replace(self.scenario, records=(first, late)))
        self.assertEqual([item.record.record_id for item in result.decision_records], ["event-r1"])

    def test_earlier_departure_cannot_use_later_decision_information(self):
        with self.assertRaises(PlanningInputError) as caught:
            select_scenario(self.scenario, "2025-10-25T12:00:00Z", "2025-10-25T11:59:59Z")
        self.assertEqual(caught.exception.code, "departure_before_cutoff")


if __name__ == "__main__":
    unittest.main()
