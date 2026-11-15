"""Prepared package identity, coordinate containment and clock boundaries."""

from dataclasses import FrozenInstanceError, replace
from pathlib import Path
import unittest

from service.prepared import fixture_registry, registry_from_fixture, resolve_location
from service.validation import PlanningInputError, loads_strict


def raw_fixture():
    return loads_strict((Path(__file__).parents[1] / "fixtures" / "synthetic_demo.json").read_text(encoding="utf-8"))


def coordinate(x, y):
    return {"type": "coordinate", "frame": "parcel_metric", "xy_m": [x, y]}


class PreparedChecks(unittest.TestCase):
    def setUp(self):
        self.registry = fixture_registry()
        self.parcel = self.registry.parcel("synthetic_metric_demo", "v1")
        self.scenario = self.registry.scenario("synthetic_replay", "v1", self.parcel)

    def rejects(self, code, function, *args):
        with self.assertRaises(PlanningInputError) as caught:
            function(*args)
        self.assertEqual(caught.exception.code, code)
        self.assertTrue(caught.exception.path)

    def test_registered_ids_versions_and_parcel_location_association(self):
        self.rejects("unknown_parcel", self.registry.parcel, "../../other", "v1")
        self.rejects("unknown_parcel", self.registry.parcel, self.parcel.id, "v2")
        self.rejects("unknown_scenario", self.registry.scenario, "live", "v1", self.parcel)
        self.rejects("scenario_parcel_mismatch", self.registry.scenario, self.scenario.id, "v1", replace(self.parcel, id="other"))
        self.rejects("scenario_location_mismatch", self.registry.scenario, self.scenario.id, "v1", replace(self.parcel, evaluation_location_id="other"))

    def test_pois_and_coordinates_share_containing_cell_validation(self):
        poi = resolve_location(self.parcel, {"type": "poi", "poi_id": "sample"})
        point = resolve_location(self.parcel, coordinate(31, 1))
        self.assertEqual(poi.cell, (0, 1))
        self.assertEqual(point.cell, poi.cell)
        self.assertEqual(point.effective_xy_m, (30, 0))
        self.assertEqual(point.requested.xy_m, (31, 1))
        self.assertEqual(point.geographic_conversion, "unavailable")
        for poi_id, xy, code in (("missing", (0, -60), "missing_endpoint_coverage"), ("excluded", (30, -60), "excluded_endpoint")):
            self.rejects(code, resolve_location, self.parcel, {"type": "poi", "poi_id": poi_id})
            self.rejects(code, resolve_location, self.parcel, coordinate(*xy))
        self.rejects("unknown_poi", resolve_location, self.parcel, {"type": "poi", "poi_id": "unknown"})

    def test_half_open_footprints_at_outer_and_internal_boundaries(self):
        self.assertEqual(resolve_location(self.parcel, coordinate(-15, 15)).cell, (0, 0))
        self.assertEqual(resolve_location(self.parcel, coordinate(15, -15)).cell, (1, 1))
        self.assertEqual(resolve_location(self.parcel, coordinate(74.999, 0)).cell, (0, 2))
        for xy in ((75, 0), (-15.001, 0), (0, 15.001), (60, -75)):
            self.rejects("outside_parcel", resolve_location, self.parcel, coordinate(*xy))
        increasing = replace(self.parcel, grid=replace(self.parcel.grid, row_direction="increasing_y"))
        self.assertEqual(resolve_location(increasing, coordinate(15, 15)).cell, (1, 1))
        self.rejects("outside_parcel", resolve_location, increasing, coordinate(60, 75))

    def test_no_real_or_geographic_adapter_is_inferred(self):
        self.rejects("unsupported_coordinate_adapter", resolve_location, self.parcel, {"type": "coordinate", "frame": "lonlat", "xy_m": [137, -4]})
        self.rejects("unsupported_coordinate_adapter", resolve_location, replace(self.parcel, coordinate_adapter="unreviewed_real"), coordinate(0, 0))
        raw = raw_fixture()
        raw["parcel"]["grid"]["fixture"] = False
        self.rejects("unsupported_coordinate_adapter", registry_from_fixture, raw)
        for value in (True, None, float("nan"), float("inf"), "30"):
            self.rejects("invalid_number", resolve_location, self.parcel, coordinate(value, 0))

    def test_explicit_fixture_mapping_and_coverage(self):
        self.assertEqual(self.scenario.clock.departure("2025-10-25T12:00:00Z").offset_s, 100)
        self.assertEqual(self.scenario.clock.departure("2025-10-25T12:38:20Z").offset_s, 2400)
        self.assertEqual(self.scenario.clock.departure("2025-10-25T11:59:59Z").offset_s, 99)
        self.rejects("outside_clock_coverage", self.scenario.clock.departure, "2025-12-05T00:00:00Z")
        self.rejects("invalid_utc", self.scenario.clock.departure, "12:00")
        self.rejects("unsupported_clock_adapter", replace(self.scenario.clock, adapter_id="guess_mars_time").departure, "2025-10-25T12:00:00Z")

    def test_wrong_daylight_epoch_location_and_units_reject_at_ingestion(self):
        for key, value, code in (("epoch_id", "other-sol", "daylight_epoch_or_interval_mismatch"),
                                 ("source_location_id", "rover-reference", "daylight_location_or_unit_mismatch"),
                                 ("units", "mars_hour", "daylight_location_or_unit_mismatch")):
            raw = raw_fixture()
            raw["scenarios"][0]["records"][0][key] = value
            self.rejects(code, registry_from_fixture, raw)
        raw = raw_fixture()
        raw["scenarios"][0]["clock"]["adapter_id"] = "real_unreviewed"
        self.rejects("unsupported_clock_adapter", registry_from_fixture, raw)

    def test_immutable_records_and_content_identity(self):
        again = fixture_registry().parcel(self.parcel.id, "v1")
        self.assertEqual(self.parcel.content_id, again.content_id)
        with self.assertRaises(FrozenInstanceError):
            self.parcel.version = "changed"
        with self.assertRaises(ValueError):
            self.parcel.grid.elevation_m[0, 0] = 99
        raw = raw_fixture()
        raw["parcel"]["grid"]["excluded"][0][1] = True
        self.assertNotEqual(registry_from_fixture(raw).parcel(self.parcel.id, "v1").content_id, self.parcel.content_id)
        self.assertEqual(self.parcel.grid.origin_center_xy_m, (0, 0))
        self.assertEqual(self.parcel.grid.elevation_m[0, 0], 0)


if __name__ == "__main__":
    unittest.main()
