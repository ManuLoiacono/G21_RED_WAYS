"""One central template catalog, editable copies and evaluator compatibility."""

from dataclasses import FrozenInstanceError, replace
import json
import unittest

from engine import MISSION_TEMPLATES, MissionTask, TEMPLATE_VERSION, export_mission_templates
from engine.tests.test_mission import evaluate


class TemplateChecks(unittest.TestCase):
    def test_four_canonical_english_ids_and_evaluable_defaults(self):
        self.assertEqual(tuple(template.id for template in MISSION_TEMPLATES), (
            "geological_observation", "topographic_exploration", "reconnaissance", "environmental_measurement",
        ))
        for template in MISSION_TEMPLATES:
            result = evaluate(tasks=template.tasks, time_budget_s=template.time_budget_s, reserve_s=template.reserve_s)
            self.assertEqual(result.tasks_s, sum(task.duration_s for task in template.tasks))
            self.assertTrue(all(check.reason.code for check in result.checks))

    def test_export_is_labeled_versioned_and_detached_from_defaults(self):
        exported = export_mission_templates()
        self.assertEqual(exported["version"], TEMPLATE_VERSION)
        self.assertTrue(exported["fixture"])
        self.assertEqual(exported["evidence_kind"], "assumed")
        self.assertEqual(exported["editable_fields"], ["tasks", "time_budget_s", "reserve_s"])
        json.dumps(exported, allow_nan=False)
        exported["templates"][0]["tasks"][0]["duration_s"] = -1
        exported["templates"].clear()
        fresh = export_mission_templates()
        self.assertEqual(len(fresh["templates"]), 4)
        self.assertGreater(fresh["templates"][0]["tasks"][0]["duration_s"], 0)

    def test_editable_scenarios_preserve_frozen_defaults(self):
        original = MISSION_TEMPLATES[0]
        changed = replace(original, tasks=(MissionTask("custom_task", 10),), reserve_s=0, time_budget_s=600)
        self.assertEqual(evaluate(tasks=changed.tasks, reserve_s=changed.reserve_s, time_budget_s=changed.time_budget_s).assessment, "viable_model")
        self.assertNotEqual(changed.tasks, original.tasks)
        with self.assertRaises(FrozenInstanceError):
            original.reserve_s = 0


if __name__ == "__main__":
    unittest.main()
