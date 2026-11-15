"""Physical sol/time, actual-location sunlight and independent REMS references."""

from dataclasses import replace
import math
import unittest

from engine import DaylightWindow, MissionTask, evaluate_mission
from service.environment_package import load_environment_package
from service.exchange import decode_request, plan_draft
from service.gale import gale_registry
from service.planning import PreparedPlanner
from service.solar import (EPOCH_ID, METHOD, SOL_S, daylight_interval, elevation_sine,
                           iso, offset, sol_instant, sol_lmst, source_interval)
from service.validation import PlanningInputError, loads_strict
from service.tests import test_gale


class SolarChecks(unittest.TestCase):
    def test_round_trips_separated_dates_and_physical_sol(self):
        for sol in (4699, 4700, 4720, 4739):
            for hours in (.001, 9, 12, 23.99):
                instant = sol_instant(sol, hours, 137.404)
                actual_sol, actual_hours = sol_lmst(instant, 137.404)
                self.assertEqual(actual_sol, sol)
                self.assertAlmostEqual(actual_hours, hours, places=7)
            self.assertAlmostEqual(offset(sol_instant(sol + 1)) - offset(sol_instant(sol)), SOL_S, places=5)
        self.assertAlmostEqual(SOL_S, 88775.24414688, places=7)
        self.assertGreater(SOL_S / 1440, 61.6)

    def test_sunrise_sunset_roots_across_replay_and_location_changes(self):
        for sol in (4699, 4719, 4739):
            instant = sol_instant(sol, 9, 137.404)
            actual, (rise, setting) = daylight_interval(instant, 137.404, -4.825)
            self.assertEqual(actual, sol)
            self.assertLess(abs(elevation_sine(rise, 137.404, -4.825)), 1e-9)
            self.assertLess(abs(elevation_sine(setting, 137.404, -4.825)), 1e-9)
            other = daylight_interval(instant, 137.40, -10)[1]
            self.assertGreater(abs(other[0] - rise), 1)

    def test_independent_rems_rounded_local_clock_reference(self):
        errors = []
        for row in load_environment_package()["daily_sources"]:
            if row["sol"] not in (4699, 4719, 4739):
                continue
            lon, lat = row["rover_lon_deg"], row["rover_lat_deg"]
            _, bounds = daylight_interval(sol_instant(row["sol"], 9, lon), lon, lat)
            for instant, key in zip(bounds, ("sunrise_lmst", "sunset_lmst")):
                hour, minute = map(int, row[key].split(":"))
                errors.append(abs(sol_lmst(iso(instant), lon)[1]*60 - (hour*60+minute)))
        # Independent rounded report, not exact sunlight at the hypothetical base.
        self.assertLess(max(errors), 2)

    def test_legacy_source_envelope_does_not_release_rad_early(self):
        start, end = source_interval(4699)
        self.assertLessEqual(offset(start), offset(sol_instant(4699)))
        self.assertGreater(offset(end), offset(sol_instant(4700)) + 1.9)


class SolarMissionChecks(unittest.TestCase):
    def setUp(self):
        helper = test_gale.GalePackageChecks()
        helper.setUp()
        self.addCleanup(helper.doCleanups)
        self.registry = gale_registry(helper.path)
        self.planner = PreparedPlanner(self.registry)
        from pathlib import Path
        self.request = loads_strict((Path(__file__).parents[1] / "examples/gale.request.json").read_text())
        self.request["parcel"] = {"id": self.registry.parcels[-1].id, "version": self.registry.parcels[-1].version}
        self.request["scenario"].update(id="gale_historical_replay", as_of_utc=sol_instant(4700, 9, 0))
        self.request["mission"]["departure_utc"] = self.request["scenario"]["as_of_utc"]

    def test_boundaries_overrun_missing_and_reuse(self):
        response = plan_draft(self.planner, self.request)
        self.assertEqual(response["assessment"], "viable_model")
        total = response["alternatives"][0]["metrics"]["reserved_total_s"]
        sunset = response["environment"]["daylight"]["end_s"]
        self.request["mission"]["departure_utc"] = iso(sunset-total)
        boundary = plan_draft(self.planner, self.request)
        self.assertEqual(boundary["assessment"], "viable_model")
        self.assertAlmostEqual(boundary["alternatives"][0]["metrics"]["daylight_reserved_return_margin_s"], 0, places=6)
        self.request["mission"]["departure_utc"] = iso(sunset-total+.001)
        self.assertEqual(plan_draft(self.planner, self.request)["assessment"], "incompatible")
        self.request["mission"]["departure_utc"] = iso(response["environment"]["daylight"]["start_s"]-1)
        self.request["scenario"]["as_of_utc"] = self.request["mission"]["departure_utc"]
        self.assertEqual(plan_draft(self.planner, self.request)["assessment"], "incompatible")
        self.request["scenario"]["id"] = "gale_historical_missing_daylight"
        missing = plan_draft(self.planner, self.request)
        self.assertEqual(missing["assessment"], "insufficient_evidence")
        self.assertEqual(missing["movement_reuse"], {"graph": True, "base_search": True})

    def test_location_and_epoch_mismatch_rejected_and_coverage_explicit(self):
        response = plan_draft(self.planner, self.request)
        self.assertEqual(response["environment"]["daylight"]["method"], METHOD)
        self.request["scenario"]["as_of_utc"] = "2025-12-06T00:00:00Z"
        self.request["mission"]["departure_utc"] = self.request["scenario"]["as_of_utc"]
        with self.assertRaises(PlanningInputError) as error:
            plan_draft(self.planner, self.request)
        self.assertEqual(error.exception.code, "outside_clock_coverage")
