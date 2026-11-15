"""Candidate semantics and counterfactual conservation through the real adapter."""

from copy import deepcopy
import unittest

from service.example import example_requests
from service.exchange import plan_draft
from service.planning import PreparedPlanner
from service.prepared import fixture_registry
from service.recommendations import recommendations
from service.tests.test_http import serving, request


class ComparisonServiceTests(unittest.TestCase):
    def test_real_candidates_have_independent_target_intervals_and_daylight(self):
        import json
        from pathlib import Path
        from datetime import timedelta
        from service.gale import gale_registry
        from service.validation import utc
        manifest = Path("data/processed/gale/analytical/manifest.json")
        if not (manifest.parent / "terrain.npz").exists():
            self.skipTest("Verified ignored real archive is unavailable; prepare_gale --factor 2 is required.")
        planner = PreparedPlanner(gale_registry(manifest))
        payload = json.loads(Path("service/examples/gale-comparison.request.json").read_text())
        response = plan_draft(planner, payload)
        self.assertEqual(len(response["alternatives"]), 2)
        fast, ascent = response["alternatives"]
        self.assertLess(fast["metrics"]["elapsed_s"], ascent["metrics"]["elapsed_s"])
        end = next(x["record"]["valid_to_utc"] for x in fast["environment"]["decision_records"] if x["record"]["kind"] == "forecast")
        departure = utc(end, "target") - timedelta(seconds=fast["metrics"]["reserved_total_s"] + (ascent["metrics"]["reserved_total_s"] - fast["metrics"]["reserved_total_s"]) / 2)
        payload["mission"]["departure_utc"] = departure.isoformat().replace("+00:00", "Z")
        response = plan_draft(planner, payload)
        fast, ascent = response["alternatives"]
        count = lambda a: sum(x["record"]["kind"] == "forecast" for x in a["environment"]["decision_records"])
        self.assertEqual(count(fast), 4)
        self.assertLess(count(ascent), count(fast))
        self.assertNotEqual(fast["environment"]["mission_target_interval"], ascent["environment"]["mission_target_interval"])
        self.assertTrue(all(a["assessment"] == "incompatible" for a in response["alternatives"]))

    def test_dedup_and_physical_budgets(self):
        planner = PreparedPlanner(fixture_registry())
        payload = example_requests()["baseline"]
        baseline = plan_draft(planner, payload)
        payload["criterion"] = "comparison"
        response = plan_draft(planner, payload)
        self.assertEqual(response["request_echo"], payload)
        self.assertEqual(len(response["alternatives"]), 1)
        alt = response["alternatives"][0]
        self.assertEqual(len(alt["criteria"]), 3)
        self.assertEqual(alt["metrics"], baseline["alternatives"][0]["metrics"])
        self.assertEqual(alt["metrics"]["elapsed_s"], 800)
        self.assertEqual(alt["metrics"]["reserved_total_s"], 2600)
        self.assertEqual(alt["optimization"]["total_positive_ascent_m"], 0)
        self.assertIn("environment", alt)
        payload["mission"]["time_budget_s"] = 2500
        result = plan_draft(planner, payload)
        self.assertTrue(all(a["assessment"] == "incompatible" for a in result["alternatives"]))

    def test_evaluated_suggestions_preserve_requirements_and_payload(self):
        planner = PreparedPlanner(fixture_registry())
        payload = example_requests()["baseline"]
        payload["team"]["humans"][0]["payload_kg"] = 4
        payload["team"]["robots"][0]["payload_kg"] = 5
        before = deepcopy(payload)
        result = recommendations(planner, payload)
        self.assertEqual(payload, before)
        self.assertLessEqual(result["attempted"], 3)
        self.assertTrue(result["proposals"])
        for item in result["proposals"]:
            proposal = item["proposed_request"]
            self.assertEqual(item["total_payload_kg"], 9)
            self.assertEqual(sum(m["payload_kg"] for group in ("humans", "robots") for m in proposal["team"][group]), 9)
            self.assertEqual(proposal["origin"], payload["origin"])
            self.assertEqual(proposal["destination"], payload["destination"])
            for field in ("tasks", "reserve_s", "time_budget_s"):
                self.assertEqual(proposal["mission"][field], payload["mission"][field])
            self.assertEqual(proposal["scenario"], payload["scenario"])
            self.assertGreaterEqual(proposal["mission"]["departure_utc"], payload["scenario"]["as_of_utc"])
            self.assertEqual(item["assessment"], "viable_model")
            actual = plan_draft(planner, proposal)["alternatives"][0]
            self.assertEqual(actual["metrics"], item["metrics"])
        payload["mission"]["time_budget_s"] = 1
        self.assertEqual(recommendations(planner, payload)["proposals"], [])

    def test_unknown_daylight_does_not_become_proven_solution(self):
        payload = example_requests()["missing_daylight"]
        result = recommendations(PreparedPlanner(fixture_registry()), payload)
        for item in result["proposals"]:
            self.assertEqual(item["evidence_status"], "numerical_improvement_not_proven_viable")

    def test_no_suggestion_drops_payload_to_fit_remaining_capacity(self):
        payload = example_requests()["baseline"]
        payload["team"]["humans"][0]["payload_kg"] = 10
        payload["team"]["robots"][0]["payload_kg"] = 20
        result = recommendations(PreparedPlanner(fixture_registry()), payload)
        self.assertEqual(result["proposals"], [])

    def test_recommendation_http_and_cap(self):
        import json
        with serving() as server:
            status, _, result = request(server, "POST", "/recommendations", json.dumps(example_requests()["baseline"]), {"Content-Type": "application/json"})
            self.assertEqual(status, 200)
            self.assertEqual(result["cap"], 3)
            self.assertEqual(result["schema_version"], "p2-recommendations-1")


if __name__ == "__main__":
    unittest.main()
