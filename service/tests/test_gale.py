"""Package integrity, masks and real-adapter service behavior on a compact test plane."""

import hashlib
import json
from pathlib import Path
import tempfile
import unittest

import numpy as np

from service.exchange import plan_draft
from service.gale import gale_registry, load_gale
from service.http_server import HTTPApplication
from service.planning import PreparedPlanner
from service.prepared import resolve_location
from service.validation import PlanningInputError, identity


class GalePackageChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name)/"manifest.json"
        manifest_path = Path(__file__).parents[2]/"data/processed/gale/analytical/manifest.json"
        self.manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        self.manifest["id"] = "compact-test-plane"
        self.manifest["grid"].update(shape=[3, 3], spacing_m=[2., 2.], origin_center_xy_m=[0., 0.])
        self.manifest["pois"] = [{"id": "base", "lonlat": [0., 0.], "classification": "hypothetical"},
                                 {"id": "sample", "lonlat": [4/3396190*180/np.pi, 0.], "classification": "hypothetical"}]
        self.arrays = {"elevation_m": np.zeros((3, 3)), "terrain_slope_deg": np.zeros((3, 3)),
                       "coverage": np.ones((3, 3), bool), "excluded": np.zeros((3, 3), bool),
                       "native_elevation_m": np.zeros((8, 8), np.float32), "native_valid": np.ones((8, 8), bool)}
        self.write()

    def write(self):
        np.savez_compressed(self.path.parent/"terrain.npz", **self.arrays)
        self.manifest["arrays"]["sha256"] = {name: hashlib.sha256(np.ascontiguousarray(a).tobytes()).hexdigest() for name, a in self.arrays.items()}
        self.manifest.pop("content_id", None)
        self.manifest["content_id"] = identity(self.manifest)
        self.path.write_text(json.dumps(self.manifest), encoding="utf-8")

    def test_content_and_array_tampering_are_rejected(self):
        parcel = load_gale(self.path)
        self.assertFalse(parcel.grid.fixture)
        self.assertEqual(parcel.content_id, self.manifest["content_id"])
        self.arrays["elevation_m"][0, 0] = 1
        np.savez_compressed(self.path.parent/"terrain.npz", **self.arrays)
        with self.assertRaisesRegex(ValueError, "hash mismatch"):
            load_gale(self.path)
        self.write()
        self.manifest["version"] = "tampered"
        self.path.write_text(json.dumps(self.manifest), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "content identity"):
            load_gale(self.path)

    def test_no_snapping_on_bounds_missing_coverage_or_exclusion(self):
        self.arrays["coverage"][1, 0] = False
        self.arrays["elevation_m"][1, 0] = np.nan
        self.arrays["excluded"][1, 1] = True
        self.write()
        parcel = load_gale(self.path)
        for xy, code in (([0, -2], "missing_endpoint_coverage"), ([2, -2], "excluded_endpoint"), ([5, 0], "outside_parcel")):
            with self.assertRaises(PlanningInputError) as caught:
                resolve_location(parcel, {"type": "coordinate", "frame": "parcel_metric", "xy_m": xy})
            self.assertEqual(caught.exception.code, code)
        resolved = resolve_location(parcel, {"type": "coordinate", "frame": "parcel_metric", "xy_m": [.2, .3]})
        self.assertEqual(resolved.requested_xy_m, (.2, .3))
        self.assertEqual(resolved.effective_xy_m, (0., 0.))

    def test_registered_terrain_routes_keep_independent_missing_environment(self):
        registry = gale_registry(self.path)
        parcel = registry.parcels[-1]
        app = HTTPApplication(registry=registry, default_parcel=(parcel.id, parcel.version))
        self.assertEqual(app.health()["default_parcel"]["id"], parcel.id)
        metadata = app.parcel(f"id={parcel.id}&version={parcel.version}")
        self.assertEqual(metadata["geographic_conversion"], "available")
        self.assertEqual(metadata["scenarios"][0]["id"], "gale_development_missing_daylight")
        request = json.loads((Path(__file__).parents[1]/"examples/gale.request.json").read_text())
        request["parcel"] = {"id": parcel.id, "version": parcel.version}
        response = plan_draft(PreparedPlanner(registry), request)
        self.assertEqual(response["assessment"], "insufficient_evidence")
        self.assertFalse(response["input_provenance"]["terrain_fixture"])
        self.assertTrue(response["input_provenance"]["scenario_fixture"])
        for leg in ("outbound", "return"):
            self.assertEqual(response["alternatives"][0][leg]["status"], "found")
        self.assertEqual(response["environment"]["decision_records"], [])


if __name__ == "__main__":
    unittest.main()
