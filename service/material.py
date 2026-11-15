"""Advisory THEMIS crossings in the unshifted analytical frame; no routing effects."""

from functools import lru_cache
import math
from pathlib import Path

from .validation import identity, loads_strict

PACKAGE = Path(__file__).resolve().parents[1] / "data/processed/gale/material/themis.json"
BANDS = ("looser", "intermediate", "firmer", "unknown")


def validate_material(raw):
    if raw["format"] != "qualitative-themis-route-1" or raw["radius_m"] != 3396190 or raw["method"] != "exact-grid-segment-intersections-v1":
        raise ValueError("Unsupported qualitative material package.")
    w, h = raw["width"], raw["height"]
    if type(w) is not int or type(h) is not int or not (0 < w <= 256 and 0 < h <= 256) or len(raw["dn"]) != w * h:
        raise ValueError("Invalid bounded material crop shape.")
    if any(type(v) is not int or not 0 <= v <= 255 for v in raw["dn"]) or raw["nodata"] != 0:
        raise ValueError("Material brightness must retain uint8/nodata semantics.")
    box = raw["bbox_lonlat"]
    if not all(math.isfinite(box[key]) for key in ("west", "east", "south", "north")) or not (box["west"] < box["east"] and box["south"] < box["north"]):
        raise ValueError("Invalid material footprint.")
    lo, hi = raw["stretch"]
    if not (math.isfinite(lo) and math.isfinite(hi) and lo < hi and math.isfinite(raw["pixel_m"]) and raw["pixel_m"] > 0):
        raise ValueError("Invalid original material stretch/resolution.")


@lru_cache(maxsize=1)
def load_material():
    raw = loads_strict(PACKAGE.read_text(encoding="utf-8"))
    content = raw.pop("content_id")
    if identity(raw) != content:
        raise ValueError("Qualitative material package identity differs.")
    validate_material(raw)
    return {**raw, "content_id": content}


def crop_coordinate(raw, xy):
    lon, lat = (math.degrees(v / raw["radius_m"]) for v in xy)
    b = raw["bbox_lonlat"]
    return ((lon - b["west"]) / (b["east"] - b["west"]) * raw["width"],
            (b["north"] - lat) / (b["north"] - b["south"]) * raw["height"])


def sample(raw, point):
    x, y = map(math.floor, point)
    if not (0 <= x < raw["width"] and 0 <= y < raw["height"]):
        return "unknown"
    value = raw["dn"][y * raw["width"] + x]
    if value == raw["nodata"]:
        return "unknown"
    lo, hi = raw["stretch"]
    relative = min(1, max(0, (hi - value) / (hi - lo)))
    return "looser" if relative >= 2 / 3 else "intermediate" if relative >= 1 / 3 else "firmer"


def intersections(raw, start, end):
    """Exact pixel-boundary partition of a straight analytical route edge."""
    a, b = crop_coordinate(raw, start), crop_coordinate(raw, end)
    breaks = {0., 1.}
    for axis, limit in ((0, raw["width"]), (1, raw["height"])):
        delta = b[axis] - a[axis]
        if delta:
            first = max(0, math.ceil(min(a[axis], b[axis])))
            last = min(limit, math.floor(max(a[axis], b[axis])))
            for boundary in range(first, last + 1):
                fraction = (boundary - a[axis]) / delta
                if 0 < fraction < 1:
                    breaks.add(fraction)
    ordered = sorted(breaks)
    for left, right in zip(ordered, ordered[1:]):
        middle = (left + right) / 2
        point = tuple(a[i] + (b[i] - a[i]) * middle for i in (0, 1))
        yield sample(raw, point), right - left


def evaluate_material(parcel, routes, tasks_s):
    adapter = parcel.geographic_adapter
    if not adapter or adapter["radius_m"] != 3396190 or adapter["projection"] != "spherical_equirectangular":
        return {"status": "unevaluated", "reason": "registered_material_transform_unavailable", "warning": False}
    raw = load_material()
    contributions = {band: {"distance_m": [], "travel_s": []} for band in BANDS}
    found = 0
    for leg in (routes.outbound, routes.return_leg):
        if leg.status != "found":
            continue
        found += 1
        for start, end, edge in zip(leg.xy_m, leg.xy_m[1:], leg.edge_results):
            distance = math.hypot(end[0] - start[0], end[1] - start[1])
            for band, fraction in intersections(raw, start, end):
                contributions[band]["distance_m"].append(distance * fraction)
                contributions[band]["travel_s"].append(edge.duration_s * fraction)
    if not found:
        return {"status": "unevaluated", "reason": "route_geometry_unavailable", "warning": False}
    totals = {band: {key: math.fsum(values) for key, values in metrics.items()} for band, metrics in contributions.items()}
    destination = routes.outbound.xy_m[-1] if routes.outbound.status == "found" else None
    stationary = sample(raw, crop_coordinate(raw, destination)) if destination is not None else "unknown"
    return {"status": "evaluated" if found == 2 else "partial", "source_id": "themis_nir",
        "version": raw["content_id"], "source": raw["source"], "method": raw["method"], "pixel_m": raw["pixel_m"],
        "categories": totals, "destination_tasks": {"category": stationary, "duration_s": tasks_s}, "reserve_exposure_s": 0,
        "warning": totals["looser"]["distance_m"] > 0 or (stationary == "looser" and tasks_s > 0),
        "scope": raw["interpretation"], "effects": "Advisory only: no speed, edge exclusion, ranking or viability change. Unknown/outside does not imply firm ground."}
