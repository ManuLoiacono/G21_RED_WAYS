"""Independent segment fractions, unknown coverage and advisory invariance."""

from dataclasses import replace
import json
import math
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from engine import RouteLeg, RoundTripRoutes
from service.material import intersections, sample, evaluate_material, load_material
from service.prepared import fixture_registry
from service.validation import canonical
from service.exchange import plan_draft
from service.planning import PreparedPlanner
from service.example import example_requests


def crop():
    return {"width": 3, "height": 1, "dn": [1, 128, 255], "nodata": 0, "stretch": [0, 255], "radius_m": 3396190,
            "bbox_lonlat": {"west": 0, "east": .003, "south": 0, "north": .001}, "method": "exact-grid-segment-intersections-v1",
            "content_id": "test-material", "source": {}, "pixel_m": 59.274, "interpretation": "qualitative fixture"}


def xy(col, row=.5):
    return math.radians(col * .001) * 3396190, math.radians(.001 - row * .001) * 3396190


class MaterialTests(unittest.TestCase):
    def test_exact_crossings_not_endpoint_classification(self):
        parts = list(intersections(crop(), xy(.5), xy(2.5)))
        self.assertEqual([p[0] for p in parts], ["looser", "intermediate", "firmer"])
        for actual, expected in zip((p[1] for p in parts), (.25, .5, .25)):
            self.assertAlmostEqual(actual, expected)
        reverse = list(intersections(crop(), xy(2.5), xy(.5)))
        self.assertEqual([p[0] for p in reverse], ["firmer", "intermediate", "looser"])

    def test_unknown_outside_nodata_and_half_open_boundaries(self):
        raw = crop(); raw["dn"][1] = 0
        parts = list(intersections(raw, xy(-.5), xy(3.5)))
        self.assertAlmostEqual(sum(f for band, f in parts if band == "unknown"), .5)
        self.assertEqual(sample(raw, (3, .5)), "unknown")
        self.assertEqual(sample(raw, (0, .5)), "looser")

    def test_distances_times_stationary_and_no_scene_shift(self):
        raw = crop()
        parcel = replace(fixture_registry().parcels[0], metadata_json=canonical({"geographic_adapter": {
            "projection": "spherical_equirectangular", "radius_m": 3396190, "horizontal_shift_m": {"east": 9999, "north": 9999}}}))
        start, end = xy(.5), xy(2.5)
        outgoing = RouteLeg("found", None, xy_m=(start, end), duration_s=40, edge_results=(SimpleNamespace(duration_s=40),))
        returning = replace(outgoing, xy_m=(end, start))
        routes = RoundTripRoutes(outgoing, returning, True, "fixture")
        with patch("service.material.load_material", return_value=raw):
            result = evaluate_material(parcel, routes, 60)
        self.assertTrue(result["warning"])
        self.assertAlmostEqual(result["categories"]["intermediate"]["travel_s"], 40)
        distance = math.dist(start, end)
        self.assertAlmostEqual(sum(b["distance_m"] for b in result["categories"].values()), 2 * distance)
        self.assertAlmostEqual(sum(b["travel_s"] for b in result["categories"].values()), 80)
        self.assertEqual(result["destination_tasks"], {"category": "firmer", "duration_s": 60})
        self.assertEqual(result["reserve_exposure_s"], 0)
        missing = RouteLeg("no_path_in_domain", "Fixture unavailable leg")
        with patch("service.material.load_material", return_value=raw):
            partial = evaluate_material(parcel, replace(routes, return_leg=missing), 60)
            absent = evaluate_material(parcel, replace(routes, outbound=missing, return_leg=missing), 60)
        self.assertEqual(partial["status"], "partial")
        self.assertAlmostEqual(sum(b["distance_m"] for b in partial["categories"].values()), distance)
        self.assertEqual(absent["status"], "unevaluated")
        self.assertNotIn("categories", absent)

    def test_package_matches_existing_display_and_does_not_change_model(self):
        from pathlib import Path
        raw = load_material()
        source = json.loads(Path("app/src/thermal/themis_nir_parcel.json").read_text(encoding="utf-8"))
        for key in ("bbox_lonlat", "stretch", "nodata", "dn", "pixel_m", "source"):
            self.assertEqual(raw[key], source[key])
        from service.gale import gale_registry
        manifest = Path("data/processed/gale/analytical/manifest.json")
        if not (manifest.parent / "terrain.npz").exists():
            self.skipTest("Verified real archive unavailable; prepare_gale --factor 2.")
        planner = PreparedPlanner(gale_registry(manifest))
        request = json.loads(Path("service/examples/gale-replay.request.json").read_text())
        with patch("service.material.load_material", return_value={**raw, "dn": [1] * 900}):
            before = plan_draft(planner, request)
        with patch("service.material.load_material", return_value={**raw, "dn": [255] * 900}):
            after = plan_draft(planner, request)
        self.assertEqual(before["alternatives"][0]["metrics"], after["alternatives"][0]["metrics"])
        self.assertEqual(before["alternatives"][0]["outbound"], after["alternatives"][0]["outbound"])
        self.assertEqual(before["assessment"], after["assessment"])
        self.assertTrue(before["alternatives"][0]["terrain_context"]["warning"])
        self.assertFalse(after["alternatives"][0]["terrain_context"]["warning"])
        self.assertTrue(after["movement_reuse"]["graph"])


if __name__ == "__main__":
    unittest.main()
