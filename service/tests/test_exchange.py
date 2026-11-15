"""Strict draft mapping and examples computed through the actual engine."""

from copy import deepcopy
import json
import unittest
from unittest.mock import patch

from engine import CATALOG, RoutingSearch, evaluate_mission, export_mission_templates
from service.example import example, example_requests
from service.exchange import export_catalogs, plan_draft
from service.planning import PreparedPlanner
from service.prepared import fixture_registry, registry_from_fixture
from service.tests.test_prepared import raw_fixture
from service.validation import PlanningInputError, loads_strict


class ExchangeChecks(unittest.TestCase):
    def setUp(self):
        self.planner = PreparedPlanner(fixture_registry())
        self.request = example_requests()["baseline"]

    def reject(self, value, code, path=None):
        with self.assertRaises(PlanningInputError) as caught:
            plan_draft(self.planner, value)
        self.assertEqual(caught.exception.code, code)
        if path is not None:
            self.assertEqual(caught.exception.path, path)

    def test_unsupported_versions_are_explicit_including_actual_legacy_shape(self):
        for value in (0, 1, True, "v1"):
            self.reject({"schema_version": value, "profiles": []}, "unsupported_schema_version", "schema_version")
        missing = deepcopy(self.request)
        del missing["schema_version"]
        self.reject(missing, "missing_field", "schema_version")

    def test_unknown_fields_capabilities_and_criteria_are_not_ignored(self):
        value = deepcopy(self.request)
        value["routes"] = {"duration_s": 1}
        self.reject(value, "unknown_field", "request.routes")
        value = deepcopy(self.request)
        value["criterion"] = "lowest_relative_effort"
        self.reject(value, "unsupported_criterion", "criterion")
        value = deepcopy(self.request)
        value["team"]["humans"][0]["mission_overrides"] = {"battery": 100}
        self.reject(value, "invalid_override", "team.humans[0].mission_overrides.battery")

    def test_numbers_and_occurrences_are_validated_before_building(self):
        for number in (True, None, "600", float("nan"), float("inf")):
            value = deepcopy(self.request)
            value["mission"]["tasks"][0]["duration_s"] = number
            self.reject(value, "invalid_number", "mission.tasks[0].duration_s")
        value = deepcopy(self.request)
        value["mission"]["tasks"] *= 2
        self.reject(value, "duplicate_task", "mission.tasks[1].id")
        value = deepcopy(self.request)
        value["revision"] = False
        self.reject(value, "invalid_integer", "revision")
        self.assertIsNone(self.planner._graph)

    def test_location_and_template_validation_are_structured(self):
        value = deepcopy(self.request)
        value["destination"]["xy_m"] = [True, 0]
        self.reject(value, "invalid_number", "destination.xy_m[0]")
        value = deepcopy(self.request)
        value["destination"]["frame"] = "lonlat"
        self.reject(value, "unsupported_coordinate_adapter", "destination.frame")
        value = deepcopy(self.request)
        value["mission"]["template_version"] = "unavailable"
        self.reject(value, "template_version_mismatch", "mission.template_version")
        value = deepcopy(self.request)
        value["parcel"]["id"] = "real_gale"
        self.reject(value, "unknown_parcel", "parcel")

    def test_compact_baseline_echoes_provenance_team_versions_and_all_margins(self):
        before = deepcopy(self.request)
        response = plan_draft(self.planner, self.request)
        self.assertEqual(response["calculation_origin"], "engine")
        self.assertTrue(response["input_provenance"]["fixture"])
        self.assertEqual(response["input_provenance"]["movement_parameters_evidence"], "assumed")
        self.assertEqual(response["request_echo"], before)
        self.assertEqual(self.request, before)
        self.assertEqual(response["assessment"], "viable_model")
        location = response["locations"]["destination"]
        self.assertEqual(location["requested"]["xy_m"], [31, 1])
        self.assertEqual(location["cell"], [0, 1])
        self.assertEqual(location["effective_xy_m"], [30, 0])
        self.assertEqual(len(response["resolved_team"]), 2)
        metrics = response["alternatives"][0]["metrics"]
        self.assertEqual((metrics["elapsed_s"], metrics["reserved_total_s"]), (800, 2600))
        self.assertEqual(metrics["mission_margin_s"], 19000)
        self.assertEqual(metrics["temporal_budget_limiting_margin_s"], 15400)
        self.assertEqual(metrics["daylight_reserved_return_margin_s"], 2300)
        self.assertEqual(response["environment"]["clock_mapping"]["offset_at_epoch_s"], 100)
        encoded = json.dumps(response, allow_nan=False)
        for forbidden in ("edge_results", "predecessors", '"csr"', "synthetic-future-daily", "synthetic-pressure-forecast-r2", "synthetic-verification-outcome"):
            self.assertNotIn(forbidden, encoded)

    def test_exact_daylight_boundary_preserves_distinct_temporal_margin(self):
        response = plan_draft(self.planner, example_requests()["exact_daylight"])
        metrics = response["alternatives"][0]["metrics"]
        self.assertEqual(response["assessment"], "viable_model")
        self.assertEqual(metrics["daylight_reserved_return_margin_s"], 0)
        self.assertEqual(metrics["temporal_budget_limiting_margin_s"], 15400)
        self.assertEqual(metrics["reserved_deadline_offset_s"], 5000)
        self.assertNotIn("limiting_margin_s", metrics)

    def test_missing_evidence_and_participant_failure_are_calculated(self):
        missing = plan_draft(self.planner, example_requests()["missing_daylight"])
        self.assertEqual(missing["assessment"], "insufficient_evidence")
        self.assertEqual(missing["environment"]["missing_required"], ["daylight"])
        self.assertIsNone(missing["alternatives"][0]["metrics"]["daylight_reserved_return_margin_s"])
        failed = plan_draft(self.planner, example_requests()["participant_limit"])
        self.assertEqual(failed["assessment"], "incompatible")
        self.assertEqual(failed["alternatives"][0]["metrics"]["temporal_budget_limiting_margin_s"], -1)
        self.assertEqual(failed["request_echo"]["team"]["robots"][0]["mission_overrides"], {"max_sortie_s": 2599})

    def test_every_example_invokes_engine_and_input_edits_change_results(self):
        with patch("service.planning.evaluate_mission", wraps=evaluate_mission) as engine:
            output = example()
        self.assertEqual(engine.call_count, 5)
        self.assertEqual(len(output["cases"]), 5)
        cases = {case["id"]: case["response"] for case in output["cases"]}
        base = cases["baseline"]["alternatives"][0]["metrics"]
        edited = cases["task_edit"]["alternatives"][0]["metrics"]
        self.assertEqual(edited["elapsed_s"] - base["elapsed_s"], 1)
        self.assertTrue(cases["task_edit"]["movement_reuse"]["base_search"])
        self.assertTrue(all(case["response"]["calculation_origin"] == "engine" for case in output["cases"]))
        json.dumps(output, allow_nan=False)

    def test_backend_failure_propagates_without_any_planning_fallback(self):
        with patch("service.planning.search_from_base", side_effect=RuntimeError("Simulated backend failure")):
            with self.assertRaisesRegex(RuntimeError, "Simulated backend failure"):
                plan_draft(self.planner, self.request)

    def test_inconclusive_search_keeps_null_assessment_and_explicit_state(self):
        with patch("service.planning.search_from_base", side_effect=lambda graph, base: RoutingSearch(graph, graph.grid.index(base), "search_inconclusive", "Synthetic interruption")):
            response = plan_draft(self.planner, self.request)
        self.assertIsNone(response["assessment"])
        self.assertEqual((response["status"], response["search_status"]), ("search_inconclusive", "search_inconclusive"))
        metrics = response["alternatives"][0]["metrics"]
        self.assertIsNone(metrics["reserved_total_s"])
        self.assertEqual(metrics["unavailable_totals_reason"], "movement_duration_unavailable")

    def test_disconnected_input_is_searched_instead_of_using_fixed_response(self):
        raw = raw_fixture()
        for row in raw["parcel"]["grid"]["excluded"]:
            row[1] = True
        planner = PreparedPlanner(registry_from_fixture(raw))
        value = deepcopy(self.request)
        value["destination"] = {"type": "poi", "poi_id": "far_target"}
        result = plan_draft(planner, value)
        self.assertEqual(result["assessment"], "incompatible")
        self.assertEqual(result["alternatives"][0]["return"]["status"], "no_path_in_domain")
        self.assertIsNone(result["alternatives"][0]["metrics"]["elapsed_s"])

    def test_strict_json_and_single_authoritative_catalog_exports(self):
        for value in ('{"a":NaN}', '{"a":1e999}', '{"a":1,"a":2}', '{invalid'):
            with self.assertRaises(PlanningInputError):
                loads_strict(value)
        exported = export_catalogs()
        self.assertEqual(exported["catalog"]["version"], CATALOG.version)
        self.assertEqual(exported["mission_templates"], export_mission_templates())
        json.dumps(exported, allow_nan=False)


if __name__ == "__main__":
    unittest.main()
