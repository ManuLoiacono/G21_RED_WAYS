"""Progress reevaluation through the fixture adapter and over HTTP."""

from copy import deepcopy
import json
import unittest

from service.example import example_requests
from service.exchange import plan_draft
from service.planning import PreparedPlanner
from service.prepared import fixture_registry
from service.progress import reevaluate
from service.tests.test_http import request, serving
from service.validation import PlanningInputError


def body(plan, phase="outbound", index=1, done=0, delay=0, cell=None):
    leg = plan["alternatives"][0]["return" if phase == "return" else "outbound"]
    cell = cell or (leg["cells"][-1] if phase == "tasks" else leg["cells"][index])
    return {"schema_version": "p2-progress-1", "request": plan["request_echo"], "alternative_id": plan["alternatives"][0]["id"],
            "progress": {"phase": phase, "vertex_index": index, "cell": list(cell), "tasks_done_s": done, "delay_s": delay}}


class ProgressServiceTests(unittest.TestCase):
    def setUp(self):
        self.planner = PreparedPlanner(fixture_registry())
        self.plan = plan_draft(self.planner, example_requests()["baseline"])

    def test_options_preserve_the_calculated_plan(self):
        result = reevaluate(self.planner, body(self.plan, index=1))
        keep, back = result["options"]
        self.assertEqual((keep["id"], back["id"]), ("continue", "return_now"))
        self.assertEqual(keep["metrics"]["reserved_total_s"], self.plan["alternatives"][0]["metrics"]["reserved_total_s"])
        self.assertEqual(back["return"]["cells"][-1], self.plan["alternatives"][0]["return"]["cells"][-1])
        self.assertEqual(result["planned"]["reserved_total_s"], keep["metrics"]["reserved_total_s"])
        self.assertIn("terrain_blockage_event", result["not_evaluated"])

    def test_delay_reduces_the_margin_and_is_explained(self):
        late = reevaluate(self.planner, body(self.plan, index=1, delay=900))
        margin = self.plan["alternatives"][0]["metrics"]["mission_margin_s"]
        self.assertAlmostEqual(late["options"][0]["metrics"]["mission_margin_s"], margin - 900)
        self.assertIn(late["recommendation"]["reason"], ("continue_within_limits", "return_keeps_limits", "return_ends_sooner", "no_better_option"))

    def test_stale_or_foreign_progress_is_rejected(self):
        for payload, code in ((body(self.plan, index=1, cell=[999, 999]), "stale_progress"),
                              ({**body(self.plan), "alternative_id": "lowest_relative_effort"}, "unknown_alternative"),
                              ({**body(self.plan), "schema_version": "p2-progress-0"}, "unsupported_schema_version")):
            with self.subTest(code=code), self.assertRaises(PlanningInputError) as caught:
                reevaluate(self.planner, payload)
            self.assertEqual(caught.exception.code, code)

    def test_outbound_and_return_from_different_alternatives(self):
        import json as _json
        from pathlib import Path
        from service.gale import gale_registry
        manifest = Path("data/processed/gale/analytical/manifest.json")
        if not (manifest.parent / "terrain.npz").exists():
            self.skipTest("Verified ignored real archive is unavailable.")
        planner = PreparedPlanner(gale_registry(manifest))
        plan = plan_draft(planner, _json.loads(Path("service/examples/gale-comparison.request.json").read_text()))
        fast = next(a for a in plan["alternatives"] if "fastest" in a["criteria"])
        ascent = next(a for a in plan["alternatives"] if "lowest_relative_effort" in a["criteria"])
        payload = {**body(plan, index=0), "alternative_id": fast["id"], "return_alternative_id": ascent["id"]}
        result = reevaluate(planner, payload)
        expected = fast["metrics"]["outbound_s"] + fast["metrics"]["tasks_s"] + ascent["metrics"]["return_s"]
        self.assertAlmostEqual(result["planned"]["metrics"]["elapsed_s"], expected)
        self.assertAlmostEqual(result["options"][0]["metrics"]["elapsed_s"], expected)
        self.assertEqual(result["return_alternative_id"], ascent["id"])
        cell = ascent["return"]["cells"][3]
        back = reevaluate(planner, {**payload, "progress": {"phase": "return", "vertex_index": 3, "cell": cell,
                                                             "tasks_done_s": fast["metrics"]["tasks_s"], "delay_s": 0}})
        self.assertEqual([o["id"] for o in back["options"]], ["continue"])

    def test_http_endpoint(self):
        with serving() as server:
            status, _, plan = request(server, "POST", "/plan", json.dumps(example_requests()["baseline"]),
                                      {"Content-Type": "application/json"})
            self.assertEqual(status, 200)
            status, _, result = request(server, "POST", "/reevaluate", json.dumps(body(plan, phase="tasks", index=0, done=10)),
                                        {"Content-Type": "application/json"})
            self.assertEqual(status, 200, result)
            self.assertEqual(result["schema_version"], "p2-progress-1")
            status, _, problem = request(server, "POST", "/reevaluate", json.dumps(body(plan, index=1, cell=[999, 999])),
                                         {"Content-Type": "application/json"})
            self.assertEqual((status, problem["error"]["code"]), (422, "stale_progress"))


if __name__ == "__main__":
    unittest.main()
