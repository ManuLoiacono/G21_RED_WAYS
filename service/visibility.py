"""Bounded GDAL raster viewshed adapter; no scene offsets or radio model."""

import ctypes as ct
import ctypes.util
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from .validation import identity, number, fields, PlanningInputError

METHOD = "gdal-wang-edge-bounds-mars-v1"
RADIUS_M = 3396190.0
UNKNOWN, VISIBLE, OCCLUDED = 0, 1, 2


def settings(raw=None):
    raw = {} if raw is None else raw
    fields(raw, (), ("base_height_m", "receiver_height_m"), "options.communication")
    result = {key: number(raw.get(key, default), f"options.communication.{key}", minimum=0)
              for key, default in (("base_height_m", 5), ("receiver_height_m", 2))}
    if max(result.values()) > 100000:
        raise PlanningInputError("height_resource_limit", "options.communication", "This raster method supports heights up to 100000 m; this is a numerical bound, not a radio threshold.")
    return result


def _library():
    # Importing rasterio initializes its official wheel's dependent libraries.
    import rasterio
    directory = Path(rasterio.__file__).parent.parent
    candidates = [*directory.glob("rasterio.libs/gdal*.dll"),
                  *directory.glob("rasterio.libs/libgdal*.so*"),
                  *directory.glob("rasterio/.dylibs/libgdal*.dylib")]
    name = str(candidates[0]) if candidates else ct.util.find_library("gdal")
    if not name:
        raise PlanningInputError("visibility_backend_unavailable", "options.communication", "Install scripts/analytical-requirements.txt for the GDAL viewshed backend.")
    lib = ct.CDLL(name)
    signatures = {
        "GDALAllRegister": (None, []), "GDALGetDriverByName": (ct.c_void_p, [ct.c_char_p]),
        "GDALCreate": (ct.c_void_p, [ct.c_void_p, ct.c_char_p, ct.c_int, ct.c_int, ct.c_int, ct.c_int, ct.c_void_p]),
        "GDALGetRasterBand": (ct.c_void_p, [ct.c_void_p, ct.c_int]),
        "GDALSetGeoTransform": (ct.c_int, [ct.c_void_p, ct.POINTER(ct.c_double)]),
        "GDALRasterIO": (ct.c_int, [ct.c_void_p, ct.c_int, ct.c_int, ct.c_int, ct.c_int, ct.c_int,
                                   ct.c_void_p, ct.c_int, ct.c_int, ct.c_int, ct.c_int, ct.c_int]),
        "GDALClose": (None, [ct.c_void_p]),
        "GDALViewshedGenerate": (ct.c_void_p, [ct.c_void_p, ct.c_char_p, ct.c_char_p, ct.c_void_p,
            *([ct.c_double] * 9), ct.c_int, ct.c_double, ct.c_void_p, ct.c_void_p, ct.c_int, ct.c_void_p]),
    }
    for key, (result, arguments) in signatures.items():
        function = getattr(lib, key)
        function.restype, function.argtypes = result, arguments
    lib.GDALAllRegister()
    return lib, rasterio.__gdal_version__


def _scan(lib, elevation, spacing, base, heights):
    """One linear native Wang raster scan; Float64 terrain, byte result."""
    rows, cols = elevation.shape
    source = output = None
    try:
        source = lib.GDALCreate(lib.GDALGetDriverByName(b"MEM"), b"", cols, rows, 1, 7, None)
        if not source:
            raise RuntimeError("GDAL could not allocate the bounded viewshed raster.")
        # A local projected metric frame, with north-up rows. Curvature is applied
        # explicitly before this call, avoiding GDAL's terrestrial default radius.
        transform = (ct.c_double * 6)(-spacing[1] / 2, spacing[1], 0, spacing[0] / 2, 0, -spacing[0])
        if lib.GDALSetGeoTransform(source, transform):
            raise RuntimeError("GDAL viewshed transform failed.")
        band = lib.GDALGetRasterBand(source, 1)
        values = np.ascontiguousarray(elevation, dtype=np.float64)
        if lib.GDALRasterIO(band, 1, 0, 0, cols, rows, values.ctypes.data, cols, rows, 7, 0, 0):
            raise RuntimeError("GDAL terrain transfer failed.")
        output = lib.GDALViewshedGenerate(band, b"MEM", b"", None,
            base[1] * spacing[1], -base[0] * spacing[0], heights["base_height_m"], heights["receiver_height_m"],
            1, 2, 0, 0, 0, 2, 0, None, None, 1, None)
        if not output:
            raise RuntimeError("GDAL viewshed calculation failed.")
        result = np.empty((rows, cols), dtype=np.uint8)
        if lib.GDALRasterIO(lib.GDALGetRasterBand(output, 1), 0, 0, 0, cols, rows,
                            result.ctypes.data, cols, rows, 1, 0, 0):
            raise RuntimeError("GDAL viewshed output transfer failed.")
        return result
    finally:
        if output:
            lib.GDALClose(output)
        if source:
            lib.GDALClose(source)


@dataclass(frozen=True)
class Visibility:
    id: str
    states: np.ndarray
    metadata: dict


def prepare_visibility(parcel, base, raw=None):
    heights = settings(raw)
    grid = parcel.grid
    grid.index(base)
    metadata = {"method": METHOD, "parcel_content_id": parcel.content_id, "base_cell": base,
                "heights": heights, "resolution_m": grid.spacing_m, "radius_m": RADIUS_M,
                "curvature": "subtract horizontal distance squared / (2 * Mars radius); no refraction",
                "sampling": "GDAL Wang raster scan, edge interpolation; analytical cell centers",
                "uncertainty": "two scans with missing terrain filled at negative/positive 1e9 m; disagreement is unknown",
                "scope": "estimated geometric visibility; no Fresnel, link budget, range or radio coverage"}
    key = identity(metadata)
    states = np.zeros(grid.shape, dtype=np.uint8)
    if grid.coverage[base]:
        lib, version = _library()
        metadata["gdal_version"] = version
        # Grid row sign does not change relative horizontal distances or sight lines.
        rr = (np.arange(grid.shape[0]) - base[0]) * grid.spacing_m[0]
        cc = (np.arange(grid.shape[1]) - base[1]) * grid.spacing_m[1]
        curvature = (rr[:, None] ** 2 + cc[None, :] ** 2) / (2 * RADIUS_M)
        ground = grid.elevation_m - curvature
        if np.any(np.abs(ground[grid.coverage]) > 1e8):
            raise PlanningInputError("terrain_numeric_limit", "visibility", "Terrain exceeds this viewshed method's declared numerical envelope.")
        low = _scan(lib, np.where(grid.coverage, ground, -1e9), grid.spacing_m, base, heights)
        high = _scan(lib, np.where(grid.coverage, ground, 1e9), grid.spacing_m, base, heights)
        states[(low == OCCLUDED) & grid.coverage] = OCCLUDED
        states[(high == VISIBLE) & grid.coverage] = VISIBLE
    states.flags.writeable = False
    return Visibility(key, states, metadata)
