"""Focused complete-mission checks; every duration/clock here is synthetic."""

from dataclasses import asdict, replace
import json
import unittest
from unittest.mock import patch

import numpy as np

from engine import (
    CATALOG, DaylightWindow, Departure, MissionInputError, MissionTask, PhysicalTimeline,
    RoundTripRoutes, RouteLeg, SnapshotReference, build_graph, evaluate_mission,
    resolve_team, routes_to, search_from_base,
)
from engine.mission import TIME_ABS_TOL_S
from engine.tests.test_grid import grid


AXIS = PhysicalTimeline("synthetic-scenario-epoch-v1")
SNAPSHOT = SnapshotReference(
    scenario_id="synthetic-replay", scenario_version="v1", snapshot_id="synthetic-cutoff-v1",
    as_of_utc="2025-10-25T12:00:00Z", available_at_utc="2025-10-25T11:00:00Z",
    availability_policy="Assumed fixture availability; no historical operational knowledge is claimed.",
    evaluation_location_id="synthetic-parcel", fixture=True,
)
DAYLIGHT = DaylightWindow(AXIS, 100.0, 1000.0, "synthetic-parcel", "Explicit fixture physical seconds; no Mars clock conversion.", "synthetic-daylight-v1", "assumed")


def team(human_limit=1000, robot_limit=1000):
    return resolve_team(CATALOG, {
        "catalog_version": CATALOG.version,
        "humans": [{"profile_id": "explorer_01", "payload_kg": 0, "mission_overrides": {"max_sortie_s": human_limit}}],
        "robots": [{"profile_id": "support_rover", "payload_kg": 0, "mission_overrides": {"max_sortie_s": robot_limit}}],
    })


def movement(outbound=100.0, inbound=150.0):
    # Arithmetic-only fixtures are trusted movement results, not searched geometry.
    return RoundTripRoutes(RouteLeg("found", None, duration_s=outbound), RouteLeg("found", None, duration_s=inbound), True, "synthetic-duration-input-v1")


def evaluate(**changes):
    args = dict(routes=movement(), tasks=(MissionTask("task_a", 50.0),), participants=team(),
                time_budget_s=1000.0, reserve_s=100.0, departure=Departure(AXIS, 100.0),
                daylight=DAYLIGHT, snapshot=SNAPSHOT)
    args.update(changes)
    return evaluate_mission(**args)


class MissionChecks(unittest.TestCase):
    def reject(self, code, path, **changes):
        with self.assertRaises(MissionInputError) as caught:
            evaluate(**changes)
        self.assertEqual((caught.exception.code, caught.exception.path), (code, path))

    def check(self, result, rule_id):
        return next(check for check in result.checks if check.rule_id == rule_id)

    def test_elapsed_reserve_and_all_margins(self):
        result = evaluate(participants=team(600, 450), time_budget_s=800)
        self.assertEqual(result.assessment, "viable_model")
        self.assertEqual((result.elapsed_s, result.reserved_total_s), (300, 400))
        self.assertEqual((result.estimated_return_s, result.reserved_deadline_s), (400, 500))
        self.assertEqual(result.mission_margin_s, 400)
        self.assertEqual([item.margin_s for item in result.participant_margins], [200, 50])
        self.assertEqual(result.limiting_margin_s, 50)
        self.assertEqual(result.limiting_participant_ids, ("support_rover",))
        self.assertEqual(result.limiting_constraints, ("participants[1].max_sortie_s",))
        self.assertIn("communication", result.not_evaluated)
        self.assertIn("material", result.not_evaluated)
        self.assertNotIn("mission_budget", result.not_evaluated)
        self.assertNotIn("daylight", result.not_evaluated)
        self.assertEqual(result.snapshot, SNAPSHOT)
        self.assertEqual(result.daylight, DAYLIGHT)
        json.dumps(asdict(result), allow_nan=False)

    def test_task_increase_consumes_every_participants_original_limit(self):
        first = evaluate(participants=team(1000, 450))
        second = evaluate(participants=team(1000, 450), tasks=(MissionTask("a", 100), MissionTask("b", 50)))
        self.assertEqual(second.assessment, "incompatible")
        self.assertEqual(second.elapsed_s - first.elapsed_s, 100)
        self.assertEqual(first.mission_margin_s - second.mission_margin_s, 100)
        self.assertEqual([a.margin_s - b.margin_s for a, b in zip(first.participant_margins, second.participant_margins)], [100, 100])
        failed = [check for check in second.checks if check.status == "failed"]
        self.assertEqual([(check.rule_id, check.participant_id, check.margin_s) for check in failed], [("participant_time_limit", "support_rover", -50)])

    def test_reserve_is_margin_not_elapsed_activity(self):
        first = evaluate(reserve_s=0)
        second = evaluate(reserve_s=701)
        self.assertEqual(first.elapsed_s, second.elapsed_s)
        self.assertEqual(first.estimated_return_s, second.estimated_return_s)
        self.assertEqual(first.reserved_total_s, 300)
        self.assertEqual(second.reserved_total_s, 1001)
        self.assertEqual(second.mission_margin_s, -1)
        self.assertEqual(second.assessment, "incompatible")
        self.assertEqual(self.check(second, "daylight_return_deadline").status, "failed")

    def test_limits_are_not_pooled_and_ties_are_explicit(self):
        result = evaluate(participants=team(399, 2000), time_budget_s=2000)
        self.assertEqual(result.assessment, "incompatible")
        self.assertEqual(result.limiting_participant_ids, ("explorer_01",))
        tied = evaluate(participants=team(400, 400), time_budget_s=400)
        self.assertEqual(tied.assessment, "viable_model")
        self.assertEqual(tied.limiting_margin_s, 0)
        self.assertEqual(tied.limiting_participant_ids, ("explorer_01", "support_rover"))
        self.assertEqual(len(tied.limiting_constraints), 3)
        mission = evaluate(participants=team(700, 800), time_budget_s=399)
        self.assertEqual(mission.limiting_constraints, ("time_budget_s",))
        self.assertEqual(mission.limiting_participant_ids, ())

    def test_daylight_exact_boundaries_and_absolute_numerical_policy(self):
        exact = replace(DAYLIGHT, end_s=500)
        self.assertEqual(evaluate(daylight=exact).assessment, "viable_model")
        self.assertEqual(self.check(evaluate(daylight=exact), "daylight_return_deadline").margin_s, 0)
        tiny = evaluate(daylight=replace(exact, end_s=500 - TIME_ABS_TOL_S / 2))
        self.assertEqual(tiny.assessment, "viable_model")
        self.assertLess(self.check(tiny, "daylight_return_deadline").margin_s, 0)
        material = evaluate(daylight=replace(exact, end_s=499.999))
        self.assertEqual(material.assessment, "incompatible")
        self.assertLess(self.check(material, "daylight_return_deadline").margin_s, -0.0009)
        # No relative tolerance: a large epoch offset must not hide 0.01 seconds.
        far = evaluate(departure=Departure(AXIS, 1e9), daylight=replace(DAYLIGHT, start_s=1e9, end_s=1e9 + 399.99))
        self.assertEqual(far.assessment, "incompatible")
        empty = evaluate(routes=movement(0, 0), tasks=(), reserve_s=0, departure=Departure(AXIS, 1000))
        self.assertEqual(empty.assessment, "viable_model")

    def test_departure_before_sunrise_and_after_sunset(self):
        for offset in (99.999, 1000.001):
            result = evaluate(departure=Departure(AXIS, offset))
            self.assertEqual(result.assessment, "incompatible")
            check = self.check(result, "daylight_departure")
            self.assertEqual((check.status, check.reason.code), ("failed", "departure_outside_daylight"))

    def test_missing_daylight_never_passes_even_when_time_already_fails(self):
        for budget, expected in ((1000, "insufficient_evidence"), (399, "incompatible")):
            result = evaluate(daylight=None, time_budget_s=budget)
            self.assertEqual(result.assessment, expected)
            self.assertEqual([check.rule_id for check in result.checks if check.status == "missing_evidence"], ["daylight_departure", "daylight_return_deadline"])
            self.assertIn("daylight", result.not_evaluated)

    def test_absent_return_preserves_unknown_metrics_and_missing_checks(self):
        routes = replace(movement(), return_leg=RouteLeg("no_path_in_domain", "Synthetic one-way domain."))
        result = evaluate(routes=routes, daylight=None)
        self.assertEqual((result.assessment, result.search_status), ("incompatible", "complete"))
        for value in (result.return_s, result.elapsed_s, result.reserved_total_s, result.mission_margin_s,
                      result.limiting_margin_s, result.estimated_return_s, result.reserved_deadline_s):
            self.assertIsNone(value)
        self.assertEqual([item.margin_s for item in result.participant_margins], [None, None])
        self.assertEqual(self.check(result, "return_path").reason.path, "routes.return_leg")
        self.assertEqual(self.check(result, "mission_budget").status, "not_evaluated")
        self.assertEqual(self.check(result, "daylight_departure").status, "missing_evidence")
        json.dumps(asdict(result), allow_nan=False)

    def test_inconclusive_search_stays_separate_from_assessment(self):
        routes = replace(movement(), return_leg=RouteLeg("search_inconclusive", "Synthetic interrupted search."))
        result = evaluate(routes=routes, daylight=None)
        self.assertEqual(result.search_status, "search_inconclusive")
        self.assertEqual(result.assessment, "insufficient_evidence")
        self.assertIsNone(result.reserved_total_s)
        self.assertEqual(self.check(result, "return_path").status, "not_evaluated")
        self.assertEqual(self.check(result, "daylight_departure").status, "missing_evidence")
        self.assertIsNone(evaluate(routes=routes).assessment)
        known_failure = evaluate(routes=routes, departure=Departure(AXIS, 90))
        self.assertEqual((known_failure.assessment, known_failure.search_status), ("incompatible", "search_inconclusive"))
        no_path = replace(routes, outbound=RouteLeg("no_path_in_domain", "Synthetic disconnection."))
        self.assertEqual(evaluate(routes=no_path).assessment, "incompatible")

    def test_daylight_validation_and_incompatible_clock_metadata(self):
        self.reject("timeline_mismatch", "daylight.timeline.epoch_id", daylight=replace(DAYLIGHT, timeline=PhysicalTimeline("other-sol")))
        self.reject("unsupported_time_unit", "departure.timeline.unit", departure=Departure(replace(AXIS, unit="mars_clock_hour"), 100))
        self.reject("unsupported_time_convention", "daylight.timeline.convention", daylight=replace(DAYLIGHT, timeline=replace(AXIS, convention="local_solar_time")))
        self.reject("invalid_text", "departure.timeline.epoch_id", departure=Departure(PhysicalTimeline(""), 100))
        for end in (100, 99):
            self.reject("invalid_interval", "daylight.end_s", daylight=replace(DAYLIGHT, end_s=end))
        self.reject("location_mismatch", "daylight.evaluation_location_id", daylight=replace(DAYLIGHT, evaluation_location_id="other-parcel"))
        self.reject("invalid_text", "daylight.method", daylight=replace(DAYLIGHT, method=""))
        self.reject("invalid_evidence_kind", "daylight.evidence_kind", daylight=replace(DAYLIGHT, evidence_kind="unknown"))
        self.reject("invalid_structure", "daylight", daylight={})

    def test_nonfinite_boolean_and_missing_numbers_are_field_errors(self):
        invalid = (True, False, None, "100", float("nan"), float("inf"), -float("inf"), 10 ** 1000)
        for value in invalid:
            with self.subTest(value=repr(value)[:30]):
                self.reject("invalid_number", "reserve_s", reserve_s=value)
                self.reject("invalid_number", "time_budget_s", time_budget_s=value)
                self.reject("invalid_number", "tasks[0].duration_s", tasks=(MissionTask("a", value),))
                self.reject("invalid_number", "departure.offset_s", departure=Departure(AXIS, value))
                self.reject("invalid_number", "daylight.end_s", daylight=replace(DAYLIGHT, end_s=value))
                self.reject("invalid_number", "routes.outbound.duration_s", routes=movement(value))
                members = team()
                bad = replace(members[0], parameters=replace(members[0].parameters, max_sortie_s=value))
                self.reject("invalid_number", "participants[0].max_sortie_s", participants=(bad,))

    def test_ranges_duplicates_and_unavailable_leg_validation(self):
        self.reject("out_of_range", "time_budget_s", time_budget_s=0)
        self.reject("out_of_range", "reserve_s", reserve_s=-1)
        self.reject("out_of_range", "tasks[0].duration_s", tasks=(MissionTask("a", -1),))
        self.reject("out_of_range", "routes.return_leg.duration_s", routes=movement(inbound=-1))
        self.reject("invalid_structure", "participants", participants=())
        self.reject("duplicate_participant", "participants[1].profile_id", participants=(team()[0], team()[0]))
        self.reject("duplicate_task", "tasks[1].id", tasks=(MissionTask("a", 1), MissionTask("a", 1)))
        self.reject("invalid_text", "tasks[0].id", tasks=(MissionTask("", 1),))
        self.reject("invalid_leg_status", "routes.return_leg.status", routes=replace(movement(), return_leg=RouteLeg("error", "Technical error.")))
        self.reject("unavailable_leg_duration", "routes.return_leg.duration_s", routes=replace(movement(), return_leg=RouteLeg("no_path_in_domain", None, duration_s=0)))
        self.reject("unavailable_leg_metrics", "routes.return_leg", routes=replace(movement(), return_leg=RouteLeg("search_inconclusive", None, cells=((0, 0),))))

    def test_numeric_overflow_never_serializes_nonfinite_totals(self):
        self.reject("numeric_overflow", "tasks_s", tasks=(MissionTask("a", 1e308), MissionTask("b", 1e308)))
        self.reject("numeric_overflow", "elapsed_s", routes=movement(1e308, 1e308))
        self.reject("numeric_overflow", "reserved_total_s", routes=movement(5e307, 5e307), reserve_s=1e308)
        self.reject("numeric_overflow", "estimated_return_s", routes=movement(5e307, 5e307), departure=Departure(AXIS, 1e308))

    def test_snapshot_cutoff_identity_and_availability_are_explicit(self):
        self.reject("snapshot_after_cutoff", "snapshot.available_at_utc", snapshot=replace(SNAPSHOT, available_at_utc="2025-10-25T12:00:01Z"))
        self.assertEqual(evaluate(snapshot=replace(SNAPSHOT, available_at_utc=SNAPSHOT.as_of_utc)).assessment, "viable_model")
        for value in ("2025-10-25", "2025-10-25T12:00:00", "2025-10-25T12:00:00-03:00", "not-a-date"):
            self.reject("invalid_utc", "snapshot.as_of_utc", snapshot=replace(SNAPSHOT, as_of_utc=value))
        self.reject("invalid_text", "snapshot.availability_policy", snapshot=replace(SNAPSHOT, availability_policy=""))
        self.reject("unsupported_mode", "snapshot.mode", snapshot=replace(SNAPSHOT, mode="live"))
        self.reject("invalid_boolean", "snapshot.fixture", snapshot=replace(SNAPSHOT, fixture=1))

    def test_pure_repeatable_evaluation_does_not_search_or_modify_inputs(self):
        routes, members = movement(), team()
        before = (asdict(routes), tuple(asdict(member) for member in members), asdict(SNAPSHOT))
        with patch("engine.routing.dijkstra", side_effect=AssertionError("Evaluator must not search.")):
            first = evaluate(routes=routes, participants=members)
            second = evaluate(routes=routes, participants=members)
        self.assertEqual(first, second)
        self.assertEqual(before, (asdict(routes), tuple(asdict(member) for member in members), asdict(SNAPSHOT)))
        self.assertEqual(CATALOG.find("support_rover").defaults.max_sortie_s, 18000)

    def test_integrates_searched_directed_routes_and_same_cell(self):
        members = team()
        search = search_from_base(build_graph(grid(np.zeros((1, 2)), spacing_m=(30, 30)), members), (0, 0))
        found = routes_to(search, (0, 1))
        result = evaluate(routes=found, participants=members)
        self.assertEqual((result.outbound_s, result.return_s, result.elapsed_s, result.reserved_total_s), (100, 100, 250, 350))
        same = evaluate(routes=routes_to(search, (0, 0)), participants=members, tasks=(), reserve_s=0)
        self.assertEqual((same.assessment, same.elapsed_s), ("viable_model", 0))
        asymmetric = resolve_team(CATALOG, {"catalog_version": CATALOG.version, "humans": [{"profile_id": "explorer_01", "payload_kg": 0,
                                  "mission_overrides": {"max_ascent_deg": 15, "max_descent_deg": 5}}], "robots": []})
        one_way = routes_to(search_from_base(build_graph(grid([[0, 14]], spacing_m=(100, 100)), asymmetric), (0, 0)), (0, 1))
        no_return = evaluate(routes=one_way, participants=asymmetric)
        self.assertEqual(no_return.assessment, "incompatible")
        self.assertIsNone(no_return.return_s)


if __name__ == "__main__":
    unittest.main()
