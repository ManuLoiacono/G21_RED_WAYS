"""Mars24 analytic solar geometry on a declared physical-second UTC timeline.

NASA GISS algorithm (2025-01-07): https://www.giss.nasa.gov/tools/mars24/help/algorithm.html
The local horizon is spherical, using the analytical source latitude directly.
No scene latitude/height registration, refraction, solar radius or terrain shadow.
"""

from dataclasses import dataclass
from datetime import timedelta
import math

from engine import Departure, PhysicalTimeline
from .validation import PlanningInputError, utc

METHOD = "mars24-2025-spherical-geometric-v1"
ADAPTER = "mars24-utc-msl-lmst-v1"
EPOCH = "2025-10-25T00:00:00Z"
EPOCH_ID = "utc-2025-10-25-physical-seconds-v1"
SOL_S = 86400 * 1.0274912517
SOL_OFFSET = 49269
SOURCE_LON = 137.42  # Existing RAD sol partition; not the evaluation location.
TT_MINUS_UTC_S = 69.184  # 2025 historical replay only, no leap second in this window.


def iso(offset_s):
    return (utc(EPOCH, "epoch") + timedelta(seconds=offset_s)).isoformat().replace("+00:00", "Z")


def offset(instant):
    return (utc(instant, "instant") - utc(EPOCH, "epoch")).total_seconds()


J2000_AT_EPOCH = (utc(EPOCH, "epoch") - utc("2000-01-01T12:00:00Z", "j2000")).total_seconds() / 86400 + TT_MINUS_UTC_S / 86400
MSD_AT_EPOCH = (J2000_AT_EPOCH - 4.5) / 1.0274912517 + 44796 - .0009626


def sol_lmst(instant, lon_east_deg=SOURCE_LON):
    day = MSD_AT_EPOCH + offset(instant) / SOL_S + lon_east_deg / 360
    whole = math.floor(day)
    return whole - SOL_OFFSET, (day - whole) * 24


def sol_instant(sol, lmst_hours=0., lon_east_deg=SOURCE_LON):
    return iso((sol + SOL_OFFSET + lmst_hours / 24 - lon_east_deg / 360 - MSD_AT_EPOCH) * SOL_S)


def source_interval(sol, lon_east_deg=SOURCE_LON):
    """Conservative envelope including the original marstime 0.5.3 RAD partition.

    Inspected 0.5.3 and pipeline-pinned 0.5.6 stop at TAI-UTC=35 s (2 s stale in 2025).
    Keep this source error explicit rather than mislabel legacy aggregates.
    """
    def legacy_boundary(value):
        j2000 = (value + SOL_OFFSET - lon_east_deg / 360 - 44796 + .00096) * 1.027491252 + 4.5
        return (j2000 - J2000_AT_EPOCH) * 86400 + 2
    start = min(offset(sol_instant(sol, lon_east_deg=lon_east_deg)), legacy_boundary(sol))
    end = max(offset(sol_instant(sol + 1, lon_east_deg=lon_east_deg)), legacy_boundary(sol + 1))
    return iso(start), iso(end)


def solar_parameters(offset_s):
    d = J2000_AT_EPOCH + offset_s / 86400
    sin = lambda degrees: math.sin(math.radians(degrees))
    cos = lambda degrees: math.cos(math.radians(degrees))
    m = 19.3871 + .52402073 * d
    pbs = sum(a * cos(.985626 * d / tau + phi) for a, tau, phi in (
        (.0071, 2.2353, 49.409), (.0057, 2.7543, 168.173), (.0039, 1.1177, 191.837),
        (.0037, 15.7866, 21.736), (.0021, 2.1354, 15.704), (.0020, 2.4694, 95.528), (.0018, 32.8493, 49.095)))
    center = (10.691 + 3e-7 * d) * sin(m) + .623 * sin(2*m) + .050 * sin(3*m) + .005 * sin(4*m) + .0005 * sin(5*m) + pbs
    ls = (270.3871 + .524038496 * d + center) % 360
    eot = 2.861 * sin(2*ls) - .071 * sin(4*ls) + .002 * sin(6*ls) - center
    decl = math.asin(.42565 * sin(ls)) + math.radians(.25 * sin(ls))
    return ls, decl, eot


def elevation_sine(offset_s, lon, lat):
    _, decl, eot = solar_parameters(offset_s)
    lmst = ((MSD_AT_EPOCH + offset_s / SOL_S + lon / 360) % 1) * 24
    hour = math.radians((lmst - 12) * 15 + eot)
    phi = math.radians(lat)
    return math.sin(phi)*math.sin(decl) + math.cos(phi)*math.cos(decl)*math.cos(hour)


def daylight_interval(instant, lon, lat):
    if not (-180 <= lon <= 180 and -85 <= lat <= 85):
        raise PlanningInputError("unsupported_solar_location", "environment.location", "This geometric daylight adapter supports nonpolar source coordinates only.")
    sol, _ = sol_lmst(instant, lon)
    midnight = offset(sol_instant(sol, lon_east_deg=lon))
    roots = []
    for start, end in ((0, .5), (.5, 1)):
        left, right = midnight + SOL_S*start, midnight + SOL_S*end
        sign = elevation_sine(left, lon, lat)
        if sign * elevation_sine(right, lon, lat) >= 0:
            raise PlanningInputError("unsupported_solar_interval", "environment.daylight", "No ordinary sunrise/sunset crossing in this interval.")
        for _ in range(48):
            middle = (left + right) / 2
            if elevation_sine(middle, lon, lat) * sign > 0:
                left = middle
            else:
                right = middle
        roots.append(round((left + right) / 2, 6))
    return sol, tuple(roots)


@dataclass(frozen=True)
class MarsClockMapping:
    valid_from_utc: str
    valid_to_utc: str
    adapter_id: str = ADAPTER
    timeline: PhysicalTimeline = PhysicalTimeline(EPOCH_ID)
    utc_epoch: str = EPOCH
    offset_at_epoch_s: float = 0.
    assumption: str = "Mars24 2025 method, TT-UTC=69.184 s; MSL sol=floor(MSD+east_longitude/360)-49269; 1 LMST minute is SOL_S/1440 physical seconds."

    def departure(self, departure_utc, path="mission.departure_utc"):
        instant = utc(departure_utc, path)
        if not utc(self.valid_from_utc, path) <= instant < utc(self.valid_to_utc, path):
            raise PlanningInputError("outside_clock_coverage", path, "Instant is outside the prepared real replay interval (end exclusive).")
        return Departure(self.timeline, offset(departure_utc))
