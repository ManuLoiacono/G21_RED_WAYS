"""Offline package integrity and discovery boundaries."""

import json
from pathlib import Path
import tempfile
import unittest

from service.environment_package import load_environment_package, source_metadata
from service.validation import PlanningInputError, identity


class EnvironmentPackageChecks(unittest.TestCase):
    def test_source_inventory_and_safe_metadata(self):
        package = load_environment_package()
        self.assertEqual(len(package["daily_sources"]), 52)
        self.assertEqual(package["replay_sols"], [4699, 4739])
        self.assertNotIn("daily_sources", source_metadata(package))

    def test_missing_and_tampered_packages_fail_explicitly(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "sources.json"
            with self.assertRaisesRegex(PlanningInputError, "Prepare the local package"):
                load_environment_package(path)
            package = load_environment_package()
            package["daily_sources"][0]["pressure_pa"] = 999
            path.write_text(json.dumps(package), encoding="utf-8")
            with self.assertRaises(PlanningInputError) as error:
                load_environment_package(path)
            self.assertEqual(error.exception.code, "environment_identity_mismatch")
            package["daily_sources"].append(package["daily_sources"][0])
            package.pop("content_id")
            package["content_id"] = identity(package)
            path.write_text(json.dumps(package), encoding="utf-8")
            with self.assertRaises(PlanningInputError) as error:
                load_environment_package(path)
            self.assertEqual(error.exception.code, "duplicate_record")
