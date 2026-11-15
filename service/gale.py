"""Trusted local analytical-package registration; requests never select files or URLs."""

from dataclasses import replace
import hashlib
import math
from pathlib import Path

import numpy as np

from engine import MetricGrid
from .prepared import MAX_PREPARED_CELLS, PreparedParcel, PreparedPOI, PreparedRegistry, fixture_registry, resolve_location
from .validation import canonical, identity, loads_strict


def load_gale(path):
    path = Path(path)
    manifest = loads_strict(path.read_text(encoding="utf-8"))
    content_id = manifest.pop("content_id")
    if identity(manifest) != content_id or manifest["format"] != "gale-analytical-1" or manifest["fixture"] is not False:
        raise ValueError("Invalid analytical package format or content identity.")
    manifest["content_id"] = content_id
    grid_info = manifest["grid"]
    shape = tuple(grid_info["shape"])
    if len(shape) != 2 or any(type(v) is not int or v <= 0 for v in shape) or math.prod(shape) > MAX_PREPARED_CELLS:
        raise ValueError("Analytical package exceeds the bounded cell envelope.")
    if manifest["arrays"]["file"] != "terrain.npz":
        raise ValueError("Only the adjacent terrain.npz archive is supported.")
    expected = {"elevation_m", "terrain_slope_deg", "coverage", "excluded", "native_elevation_m", "native_valid"}
    with np.load(path.parent / "terrain.npz", allow_pickle=False) as archive:
        if set(archive.files) != expected or set(manifest["arrays"]["sha256"]) != expected:
            raise ValueError("Analytical array inventory differs from the manifest.")
        arrays = {}
        for name in sorted(expected):
            a = archive[name]
            if hashlib.sha256(np.ascontiguousarray(a).tobytes()).hexdigest() != manifest["arrays"]["sha256"][name]:
                raise ValueError(f"Analytical array hash mismatch: {name}.")
            if name.startswith("native_"):
                factor = manifest["preparation"]["native_block_factor"]
                if a.shape != tuple(n*factor+2 for n in shape):
                    raise ValueError("Native halo array shape differs from the search grid.")
            else:
                if a.shape != shape:
                    raise ValueError("Analytical search array shape differs from the manifest.")
                arrays[name] = a
    adapter = manifest["geographic_adapter"]
    if (adapter["id"] != "gale-eqc-scene-v1" or adapter["projection"] != "spherical_equirectangular" or
            adapter["radius_m"] != 3396190 or adapter["central_meridian_deg"] != 0 or
            adapter["standard_parallel_deg"] != 0 or adapter["latitude_convention"] != "source_latitude_direct_to_cesium_mars"):
        raise ValueError("Unsupported analytical/geographic/display adapter.")
    grid = MetricGrid(**arrays, spacing_m=grid_info["spacing_m"], origin_center_xy_m=grid_info["origin_center_xy_m"],
                      row_direction=grid_info["row_direction"], aggregation_policy=grid_info["aggregation_policy"],
                      fixture=False, data_version=content_id)
    pois = tuple(PreparedPOI(p["id"], tuple(math.radians(v)*adapter["radius_m"] for v in p["lonlat"]), p["classification"])
                 for p in manifest["pois"])
    parcel = PreparedParcel(manifest["id"], manifest["version"], "gale-hypothetical-base-019698", grid,
                            content_id, manifest["grid"]["aggregation_policy"], adapter["id"],
                            manifest["reference_description"], pois, content_id, canonical(manifest))
    for poi in pois:
        resolve_location(parcel, {"type": "poi", "poi_id": poi.id})
    return parcel


def gale_registry(path, environment_path=None):
    from .environment_package import DEFAULT_PACKAGE, load_environment_package, source_metadata

    environment = load_environment_package(DEFAULT_PACKAGE if environment_path is None else environment_path)
    fixtures = fixture_registry()
    parcel = load_gale(path)
    # Retain the existing explicitly assumed development clock; provide no fabricated solar records.
    old = fixtures.scenario("synthetic_missing_daylight", "v1", fixtures.parcels[0])
    scenario = replace(old, id="gale_development_missing_daylight", parcel_id=parcel.id, parcel_version=parcel.version,
                       evaluation_location_id=parcel.evaluation_location_id, records=(),
                       metadata_json=canonical(source_metadata(environment)),
                       content_id=identity({"parcel": parcel.content_id, "scenario": "gale-development-missing-daylight-v1", "clock": old.content_id}))
    return PreparedRegistry((*fixtures.parcels, parcel), (*fixtures.scenarios, scenario))
