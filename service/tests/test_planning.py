"""Observe build/search calls and verify correct effective-team association."""

from dataclasses import replace
import unittest
from unittest.mock import patch

from engine import CATALOG, build_graph, search_from_base
from service.planning import PlannerBusyError, PreparedPlanner
from service.prepared import fixture_registry, registry_from_fixture
from service.validation import PlanningInputError
from service.tests.test_prepared import raw_fixture


def configuration():
    from engine import MISSION_TEMPLATES
    template = next(item for item in MISSION_TEMPLATES if item.id == "reconnaissance")
    return dict(parcel_id="synthetic_metric_demo", parcel_version="v1", scenario_id="synthetic_replay", scenario_version="v1",
                origin={"type": "poi", "poi_id": "base"}, destination={"type": "poi", "poi_id": "sample"},
                team={"catalog_version": CATALOG.version, "humans": [{"profile_id": "explorer_01", "payload_kg": 0}],
                      "robots": [{"profile_id": "support_rover", "payload_kg": 0}]}, tasks=template.tasks,
                time_budget_s=template.time_budget_s, reserve_s=template.reserve_s,
                departure_utc="2025-10-25T12:00:00Z", as_of_utc="2025-10-25T12:00:00Z")


class PlanningChecks(unittest.TestCase):
    def setUp(self):
        self.planner = PreparedPlanner(fixture_registry())

    def test_task_budget_reserve_departure_and_destination_reuse_search(self):
        from engine import MissionTask
        args = configuration()
        with patch("service.planning.build_graph", wraps=build_graph) as build, patch("service.planning.search_from_base", wraps=search_from_base) as search:
            first = self.planner.plan(**args)
            args.update(tasks=(MissionTask("extended", 16001),), time_budget_s=30000, reserve_s=1800)
            second = self.planner.plan(**args)
            self.assertEqual(second.mission.assessment, "incompatible")
            self.assertEqual(second.mission.limiting_participant_ids, ("support_rover",))
            self.assertEqual(second.mission.limiting_margin_s, -1)
            self.assertEqual(first.context, second.context)
            args.update(departure_utc="2025-10-25T12:38:20Z", destination={"type": "poi", "poi_id": "far_target"})
            third = self.planner.plan(**args)
            self.assertTrue(third.graph_reused and third.search_reused)
            self.assertEqual((build.call_count, search.call_count), (1, 1))
            self.assertGreater(third.mission.outbound_s, first.mission.outbound_s)

    def test_base_change_reuses_graph_and_replaces_search(self):
        args = configuration()
        with patch("service.planning.build_graph", wraps=build_graph) as build, patch("service.planning.search_from_base", wraps=search_from_base) as search:
            self.planner.plan(**args)
            first_search = self.planner._search
            args["origin"] = {"type": "poi", "poi_id": "sample"}
            result = self.planner.plan(**args)
            self.assertEqual((build.call_count, search.call_count), (1, 2))
            self.assertIsNot(first_search, self.planner._search)
            self.assertEqual(result.mission.outbound_s, 0)
            self.assertTrue(result.graph_reused)
            self.assertFalse(result.search_reused)

    def test_effective_team_change_rebuilds_and_changes_duration(self):
        args = configuration()
        with patch("service.planning.build_graph", wraps=build_graph) as build, patch("service.planning.search_from_base", wraps=search_from_base) as search:
            first = self.planner.plan(**args)
            args["team"] = {"catalog_version": CATALOG.version, "humans": [{"profile_id": "explorer_02", "payload_kg": 0}], "robots": []}
            second = self.planner.plan(**args)
            self.assertEqual((build.call_count, search.call_count), (2, 2))
            self.assertNotEqual(first.context.id, second.context.id)
            self.assertEqual((first.mission.outbound_s, second.mission.outbound_s), (100, 60))

    def test_canonical_team_order_does_not_alias_or_force_rebuild(self):
        args = configuration()
        args["team"]["humans"].append({"profile_id": "explorer_02", "payload_kg": 0})
        first = self.planner.plan(**args)
        args["team"]["humans"].reverse()
        second = self.planner.plan(**args)
        self.assertEqual(first.context.id, second.context.id)
        self.assertTrue(second.search_reused)
        args["team"]["humans"][0]["mission_overrides"] = {"flat_speed_m_s": 0.2}
        third = self.planner.plan(**args)
        self.assertNotEqual(second.context.id, third.context.id)
        self.assertFalse(third.graph_reused)

    def test_replacement_clears_old_references_before_build_and_on_failure(self):
        args = configuration()
        self.planner.plan(**args)
        args["team"]["humans"][0]["payload_kg"] = 1
        def failing_build(*unused):
            self.assertIsNone(self.planner._graph)
            self.assertIsNone(self.planner._search)
            raise RuntimeError("Simulated backend failure")
        with patch("service.planning.build_graph", side_effect=failing_build), self.assertRaises(RuntimeError):
            self.planner.plan(**args)
        self.assertIsNone(self.planner._graph)
        self.assertIsNone(self.planner._search)

    def test_mask_data_or_resolution_changes_invalidate_context(self):
        args = configuration()
        first = self.planner.plan(**args)
        for field in ("mask", "data", "resolution"):
            raw = raw_fixture()
            if field == "mask":
                raw["parcel"]["grid"]["excluded"][1][2] = True
            elif field == "data":
                raw["parcel"]["grid"]["data_version"] = "changed-data"
            else:
                raw["parcel"]["grid"]["spacing_m"] = [40, 30]
            self.planner.registry = registry_from_fixture(raw)
            result = self.planner.plan(**args)
            self.assertNotEqual(result.context.id, first.context.id)
            self.assertFalse(result.graph_reused)

    def test_stale_supplied_search_association_is_rejected(self):
        self.planner.plan(**configuration())
        self.planner._search = replace(self.planner._search, base_index=1)
        with self.assertRaises(PlanningInputError) as caught:
            self.planner.plan(**configuration())
        self.assertEqual(caught.exception.code, "stale_movement_context")
        self.assertIsNone(self.planner._search)

    def test_stale_graph_team_association_is_rejected(self):
        from engine import resolve_team
        args = configuration()
        self.planner.plan(**args)
        changed_team = {"catalog_version": CATALOG.version, "humans": [{"profile_id": "explorer_02", "payload_kg": 0}], "robots": []}
        self.planner._graph = replace(self.planner._graph, team=resolve_team(CATALOG, changed_team))
        with self.assertRaises(PlanningInputError) as caught:
            self.planner.plan(**args)
        self.assertEqual(caught.exception.code, "stale_movement_context")
        self.assertIsNone(self.planner._graph)

    def test_inconclusive_search_is_not_retained_as_complete(self):
        from engine import RoutingSearch
        with patch("service.planning.search_from_base", side_effect=lambda graph, base: RoutingSearch(graph, graph.grid.index(base), "search_inconclusive", "Synthetic interruption")):
            result = self.planner.plan(**configuration())
        self.assertIsNone(result.mission.assessment)
        self.assertEqual(result.mission.search_status, "search_inconclusive")
        self.assertIsNone(self.planner._search)
        self.assertIsNotNone(self.planner._graph)
        self.assertEqual(self.planner.plan(**configuration()).mission.assessment, "viable_model")

    def test_single_active_calculation_and_missing_daylight(self):
        self.planner._lock.acquire()
        try:
            with self.assertRaises(PlannerBusyError):
                self.planner.plan(**configuration())
        finally:
            self.planner._lock.release()
        args = configuration()
        args["scenario_id"] = "synthetic_missing_daylight"
        result = self.planner.plan(**args)
        self.assertEqual(result.mission.assessment, "insufficient_evidence")
        self.assertEqual(result.selected_scenario.missing_required, ("daylight",))


if __name__ == "__main__":
    unittest.main()
