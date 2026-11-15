"""Prepare a bounded, content-addressed analytical parcel from the native HiRISE COG.

Run from the repository root: python -m scripts.prepare_gale
No Cesium shifts or rover height corrections enter analytical elevations.
"""

import argparse
import hashlib
import json
import math
import os
from pathlib import Path

import numpy as np
import rasterio
from rasterio.windows import Window
from scipy.ndimage import minimum_filter

from service.validation import identity

# Keep analytical preparation independent of optional mesh/texture (Pillow) imports.
DTM_URL = "https://astrogeo-ard.s3-us-west-2.amazonaws.com/mars/mro/hirise/controlled/dtm/ESP_019698_1750_ESP_019988_1750/DTEEC_019698_1750_019988_1750_U01.tif"
R_SPHERE = 3_396_190.0

POLICY = "native-central-difference-3x3-valid-max-block-mean-elevation-v1"
BBOX = (137.360, -4.850, 137.410, -4.800)


def summarize(raw, valid, resolution, factor):
    """One native-pixel processing halo; block only if every derivative is known."""
    z = np.where(valid, raw, np.nan).astype(np.float64)
    dx = (z[1:-1, 2:] - z[1:-1, :-2]) / (2 * resolution)
    dy = (z[:-2, 1:-1] - z[2:, 1:-1]) / (2 * resolution)
    slope = np.degrees(np.arctan(np.hypot(dx, dy)))
    known = minimum_filter(valid, size=3, mode="constant", cval=0)[1:-1, 1:-1]
    rows, cols = slope.shape
    if rows % factor or cols % factor:
        raise ValueError("Analytical core must contain whole native blocks.")
    blocks = lambda a: a.reshape(rows // factor, factor, cols // factor, factor)
    coverage = blocks(known).all(axis=(1, 3))
    elevation = blocks(z[1:-1, 1:-1]).mean(axis=(1, 3))
    maximum = blocks(slope).max(axis=(1, 3))
    elevation[~coverage] = np.nan
    maximum[~coverage] = np.nan
    return dict(elevation_m=elevation, terrain_slope_deg=maximum, coverage=coverage,
                excluded=np.zeros(coverage.shape, dtype=bool))


def prepare(out, factor=2):
    os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    west, south, east, north = [math.radians(v) * R_SPHERE for v in BBOX]
    with rasterio.open(DTM_URL) as source:
        t = source.transform
        params = source.crs.to_dict()
        radius = params.get("R", params.get("a"))
        if not (params.get("proj") == "eqc" and radius == R_SPHERE and
                params.get("b", radius) == radius and params.get("lon_0", 0) == 0 and
                params.get("lat_ts", 0) == 0 and params.get("units") == "m"):
            raise ValueError("Source CRS does not match the adopted spherical equirectangular adapter.")
        if t.b != 0 or t.d != 0 or t.a <= 0 or t.e != -t.a:
            raise ValueError("Expected a north-up square native raster.")
        res = t.a
        # Whole block footprints inside the reviewed bounds; globally aligned native blocks.
        col0 = math.ceil((west - t.c) / res / factor) * factor
        col1 = math.floor((east - t.c) / res / factor) * factor
        row0 = math.ceil((t.f - north) / res / factor) * factor
        row1 = math.floor((t.f - south) / res / factor) * factor
        if not (1 <= col0 < col1 < source.width and 1 <= row0 < row1 < source.height):
            raise ValueError("Requested core and derivative halo must fit the source raster.")
        if (row1-row0) * (col1-col0) // factor**2 > 2_250_000:
            raise ValueError("Prepared search domain exceeds the existing cell resource bound.")
        raw = source.read(1, window=Window(col0-1, row0-1, col1-col0+2, row1-row0+2))
        valid = np.isfinite(raw) & (raw != source.nodata)
        source_info = {"url": DTM_URL, "product": "DTEEC_019698_1750_019988_1750_U01",
                       "mission": "MRO", "instrument": "HiRISE", "evidence_kind": "observed",
                       "crs_wkt": source.crs.to_wkt(), "native_transform": list(t)[:6],
                       "native_shape": list(source.shape), "nodata": source.nodata,
                       "window_with_halo": [col0-1, row0-1, col1-col0+2, row1-row0+2]}
    arrays = summarize(raw, valid, res, factor)
    # Preserve original native float32 values, including the original nodata sentinel.
    arrays.update(native_elevation_m=raw, native_valid=valid)
    np.savez_compressed(out / "terrain.npz", **arrays)
    hashes = {name: hashlib.sha256(np.ascontiguousarray(a).tobytes()).hexdigest() for name, a in arrays.items()}
    origin = [t.c + (col0 + factor/2)*res, t.f - (row0 + factor/2)*res]
    bounds = {"west": math.degrees((t.c+col0*res)/R_SPHERE),
              "east": math.degrees((t.c+col1*res)/R_SPHERE),
              "north": math.degrees((t.f-row0*res)/R_SPHERE),
              "south": math.degrees((t.f-row1*res)/R_SPHERE)}
    manifest = {
        "format": "gale-analytical-1", "id": "gale_hirise_019698", "version": "native2-v1" if factor == 2 else f"native{factor}-v1",
        "fixture": False, "source": source_info, "reviewed_bounds_lonlat": dict(zip(("west", "south", "east", "north"), BBOX)),
        "bounds_lonlat": bounds, "reference_description": "Mars 2015 sphere; east-positive longitude, source planetocentric latitude, native equirectangular meters; east-west distortion about 0.35 percent.",
        "grid": {"shape": list(arrays["coverage"].shape), "spacing_m": [res*factor]*2,
                 "origin_center_xy_m": origin, "row_direction": "decreasing_y", "cell_convention": "center",
                 "aggregation_policy": POLICY},
        "preparation": {"native_block_factor": factor, "native_resolution_m": res, "processing_halo_pixels": 1,
                        "slope_policy": "Central differences at native resolution; maximum over every search block; all 3x3 native stencil pixels must be valid.",
                        "elevation_policy": "Mean of unchanged native block values; no display shifts. Native values with halo retained verbatim.",
                        "coverage_policy": "All source samples and derivative stencils in a whole block valid; otherwise untraversable. No filling or neighbor snapping.",
                        "exclusion_policy": "No supplied scientific exclusion layer; explicit all-false mask. Team slope/edge limits still apply. Small rocks and material hazards are unevaluated.",
                        "command": f"python -m scripts.prepare_gale --factor {factor}"},
        "arrays": {"file": "terrain.npz", "sha256": hashes},
        "masks": {"covered_cells": int(arrays["coverage"].sum()), "excluded_cells": 0},
        "location_selection": 'Hypothetical photo-sector locations selected inside a 7946-cell strongly connected component of the unchanged default-team directed graph. No terrain or profile changes.',
        "pois": [{'id': 'base', 'lonlat': [137.3751012600287, -4.811074715231375], 'classification': 'hypothetical', 'role': 'base'}, {'id': 'sample', 'lonlat': [137.3700489010339, -4.8134984820464455], 'classification': 'hypothetical', 'role': 'destination'}, {'id': 'control', 'lonlat': [137.371858191755, -4.810835752305946], 'classification': 'hypothetical', 'role': 'destination'}, {'id': 'lookout', 'lonlat': [137.37267749321364, -4.814044683018855], 'classification': 'hypothetical', 'role': 'destination'}],
        "geographic_adapter": {"id": "gale-eqc-scene-v1", "projection": "spherical_equirectangular",
                               "radius_m": R_SPHERE, "central_meridian_deg": 0, "standard_parallel_deg": 0,
                               "latitude_convention": "source_latitude_direct_to_cesium_mars",
                               "horizontal_shift_m": {"east": -25., "north": 35.}, "vertical_offset_m": 56.2,
                               "registration_status": "provisional_existing_p1_measurement",
                               "evidence": "scripts/build_hirise_tiles.py and CLAUDE.md: 144 points, reported height residual spread 0.9 m, 2026-11-14. Raw control samples were not delivered; fresh visual review required. Panorama +71.2 m is unrelated."},
    }
    manifest["content_id"] = identity(manifest)
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2, allow_nan=False)+"\n", encoding="utf-8")
    print(json.dumps({"id": manifest["id"], "version": manifest["version"], "content_id": manifest["content_id"],
                      "shape": manifest["grid"]["shape"], "spacing_m": res*factor, "covered_cells": manifest["masks"]["covered_cells"]}))
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default="data/processed/gale/analytical")
    parser.add_argument("--factor", type=int, choices=(2, 4), default=2)
    args = parser.parse_args()
    prepare(args.out, args.factor)
