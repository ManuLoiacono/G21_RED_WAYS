"""Decision boundaries over the actual exported inventory, without retraining."""

from copy import deepcopy
from dataclasses import asdict, replace
from pathlib import Path
import tempfile
import unittest

from service.environment_package import load_environment_package
from service.historical_forecasts import import_document, load_forecasts, load_observations
from service.real_environment import replay_scenarios
from service.scenarios import select_scenario
from service.solar import iso, offset, sol_instant
from service.tests import test_gale
from service.validation import PlanningInputError, canonical, loads_strict


class HistoricalForecastChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.package = load_environment_package()
        cls.forecasts = load_forecasts(cls.package)
        cls.doc = loads_strict((Path(__file__).parents[2] / "data/processed/ml/forecasts/sol_4699.json").read_text())

    def scenario(self, records=None):
        helper = test_gale.GalePackageChecks()
        helper.setUp()
        self.addCleanup(helper.doCleanups)
        from service.gale import load_gale
        scenario = replay_scenarios(load_gale(helper.path), self.package)[0]
        return replace(scenario, records=tuple(records)) if records is not None else scenario

    def select(self, scenario, cutoff, departure=None, end=None):
        return select_scenario(scenario, cutoff, departure or cutoff, mission_end_utc=end,
                               evaluation_location=(137.404, -4.825, "test-analytical-location"))

    def test_inventory_units_mapping_and_rad_classification(self):
        self.assertEqual(len(self.forecasts), 574)
        self.assertEqual({r.variable for r in self.forecasts}, {"pressure_pa", "daily_min_temp_c", "daily_max_temp_c", "dose_b_rtgcorr_ugy_day"})
        rad = next(r for r in self.forecasts if r.variable == "dose_b_rtgcorr_ugy_day")
        self.assertEqual(rad.units, "microgray/day")
        self.assertIn("silicon detector B", rad.applicability)
        self.assertEqual(rad.model_id, "B1_lgbm_v1")
        self.assertEqual(rad.quantiles, {"p10": 107.28, "p50": 110.48, "p90": 113.63})

    def test_verification_never_crosses_import_boundary(self):
        changed = deepcopy(self.doc)
        changed["skill_summary"] = {"future_win": 999999}
        for row in changed["forecasts"]:
            row["observed"] = -999999
            row["baseline_persistence"] = 999999
        original = import_document(self.doc, self.package, source_identity="same-source-attestation")
        new = import_document(changed, self.package, source_identity="same-source-attestation")
        self.assertEqual(original, new)
        payload = canonical([asdict(r) for r in original])
        self.assertNotIn('"observed":', payload)
        self.assertNotIn('"skill_summary":', payload)
        self.assertNotIn('"baseline_persistence":', payload)
        # Re-exporting only retrospective fields changes the archive hash, not the decision.
        attested = import_document(changed, self.package, source_identity="different-raw-export-hash")
        left = self.select(self.scenario(original), "2025-10-26T04:00:00Z")
        right = self.select(self.scenario(attested), "2025-10-26T04:00:00Z")
        self.assertEqual(left.snapshot.snapshot_id, right.snapshot.snapshot_id)

    def test_incomplete_sol_and_earth_daily_dependencies_do_not_appear_early(self):
        record = self.forecasts[0]
        self.assertEqual(record.training_cutoff_utc, "2025-10-25T00:00:00Z")
        self.assertEqual(record.issued_at_utc, "2025-10-26T00:00:00Z")
        self.assertGreater(offset(record.reconstructed_available_at_utc), offset(record.training_cutoff_utc))
        early = iso(offset(record.reconstructed_available_at_utc)-.001)
        scenario = self.scenario([record])
        self.assertFalse(any(r.record.kind == "forecast" for r in self.select(scenario, early).decision_records))
        eligible = self.select(scenario, record.reconstructed_available_at_utc)
        self.assertEqual([r.record for r in eligible.decision_records if r.record.kind == "forecast"], [record])
        self.assertTrue(any(".cdf" in item["source"] for item in record.input_intervals))

    def test_unknown_availability_excluded_and_future_revision_cannot_supersede(self):
        record = self.forecasts[0]
        later = replace(record, record_id="future-revision", revision=2, quantiles={"p10": 1, "p50": 2, "p90": 3}, issued_at_utc="2025-10-27T00:00:00Z", reconstructed_available_at_utc="2025-10-27T00:00:00Z")
        unknown = replace(record, record_id="unknown", series_id="unknown-series", reconstructed_available_at_utc=None)
        selected = self.select(self.scenario([record, later, unknown]), "2025-10-26T04:00:00Z")
        self.assertEqual([r.record.record_id for r in selected.decision_records if r.record.kind == "forecast"], [record.record_id])
        self.assertIn("unknown_availability", {e.code for e in selected.exclusions})
        self.assertIn("not_available_as_of", {e.code for e in selected.exclusions})

    def test_frozen_model_availability_is_an_independent_gate(self):
        record = replace(self.forecasts[0], model_available_at_utc="2025-10-26T05:00:00Z")
        selected = self.select(self.scenario([record]), "2025-10-26T04:00:00Z")
        self.assertIn("model_not_available_as_of", {e.code for e in selected.exclusions})

    def test_target_interval_and_distinct_horizons(self):
        scenario = self.scenario()
        departure = sol_instant(4710, 9, 137.404)
        selected = self.select(scenario, departure, end=iso(offset(departure)+3600))
        records = [r.record for r in selected.decision_records if r.record.kind == "forecast"]
        self.assertEqual(len(records), 13)
        self.assertEqual({r.target_sol for r in records}, {4710})
        self.assertEqual({r.lead_sols for r in records if r.variable == "pressure_pa"}, {1, 3, 5, 10})
        self.assertEqual({r.lead_sols for r in records if r.variable == "dose_b_rtgcorr_ugy_day"}, {3, 5, 10})
        # The daily RAD/SILSO dependency delays lead 1 beyond this morning.
        late = sol_instant(4710, 22, 137.404)
        later = self.select(scenario, late, end=iso(offset(late)+3600))
        self.assertEqual(len([r for r in later.decision_records if r.record.kind == "forecast"]), 14)
        end = max(offset(r.valid_to_utc) for r in records)
        cross = self.select(scenario, departure, end=iso(end+.001))
        self.assertEqual(len([r for r in cross.decision_records if r.record.kind == "forecast"]), 0)
        self.assertEqual(len(cross.missing_forecast_variables), 4)

    def test_nulls_and_malformed_duplicate_nonfinite_unordered_models(self):
        doc = deepcopy(self.doc)
        doc["forecasts"][0]["p10"] = None
        self.assertIsNone(import_document(doc, self.package, source_identity="test")[0].quantiles["p10"])
        cases = []
        for key, value in (("p50", float("inf")), ("p10", 1e6), ("model_id", "selected_after_exam"), ("target_sol", 4999)):
            bad = deepcopy(self.doc); bad["forecasts"][0][key] = value; cases.append(bad)
        duplicate = deepcopy(self.doc); duplicate["forecasts"].append(duplicate["forecasts"][0]); cases.append(duplicate)
        malformed = deepcopy(self.doc); del malformed["forecasts"][0]["provenance"]; cases.append(malformed)
        for bad in cases:
            with self.subTest(bad=bad["forecasts"][0].get("model_id")), self.assertRaises(PlanningInputError):
                import_document(bad, self.package, source_identity="test")

    def test_unknown_dependency_timing_excludes_forecasts_and_keeps_independent_weather(self):
        package = deepcopy(self.package)
        for row in package["daily_sources"]:
            if row["sol"] == 4699:
                row["rad_source_files"] = []
        records = import_document(self.doc, package, source_identity="test")
        self.assertIsNone(records[0].reconstructed_available_at_utc)
        self.assertTrue(any(r.variable == "pressure_pa" and r.reconstructed_available_at_utc for r in records))

    def test_daily_observations_gated_by_whole_interval_and_availability(self):
        observations = load_observations(self.package)
        record = next(r for r in observations if r.record_id == "historical:4699:pressure_pa")
        scenario = self.scenario([record])
        early = iso(offset(record.observation_end_utc)-.001)
        selected = self.select(scenario, early)
        self.assertFalse(any(r.record.kind == "observation" for r in selected.decision_records))
        self.assertEqual(len([r for r in self.select(scenario, record.reconstructed_available_at_utc).decision_records if r.record.kind == "observation"]), 1)

    def test_missing_inventory_and_changed_files_fail_explicitly(self):
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaises(PlanningInputError) as error:
                load_forecasts(self.package, Path(temp))
            self.assertEqual(error.exception.code, "forecast_inventory_mismatch")

    def test_forecast_reference_assumption_is_limited_to_the_prepared_parcel(self):
        record = self.forecasts[0]
        result = select_scenario(self.scenario([record]), "2025-10-26T04:00:00Z", "2025-10-26T04:00:00Z",
                                 evaluation_location=(0, 0, "unrelated-location"))
        self.assertIn("forecast_spatial_context_mismatch", {e.code for e in result.exclusions})
        self.assertFalse(any(r.record.kind == "forecast" for r in result.decision_records))
