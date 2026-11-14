#!/usr/bin/env python3
"""
3D mesh of the parcel from the 1 m HiRISE DTM, as 3D Tiles 1.1 (glb) for Cesium.

Shows the parcel in more detail than Cesium Mars (which reaches ~2.5 m in Gale): the relief
comes from the DTM on its native grid and the texture from the RED orthoimage (0.25 m).
Visual only; the engine still computes on the DTM (D2).

Usage (from the repository root):
    python3 -m venv .venv && .venv/bin/pip install numpy rasterio pillow
    .venv/bin/python scripts/build_hirise_tiles.py
    # options: --bbox W S E N  --shift EAST NORTH  --offset METERS  --out data/processed/gale/tiles_hirise
    # --grid-only: only the elevation grid for the app's cursor readout (elevation.bin + elevation.json)

Reads only the parcel window over HTTP (COG on S3, without downloading the whole file).

Coordinates:
  - DTM: Equirectangular, Mars 2015 sphere (R = 3 396 190 m), clon = 0, planetocentric latitude.
    lon = x / R, lat = y / R.
  - Cesium: vertices are placed like Cartesian3.fromDegrees(lon, lat, h, Ellipsoid.MARS) with the
    latitude as given (verified with Curiosity positions; see CLAUDE.md).
  - Height and position: the DTM and Cesium Mars are not registered the same way. Measured on
    2026-11-14 in the parcel, Cesium Mars matches the DTM moved −25 m east, +35 m north and
    +56.2 m up (0.9 m residual spread over 144 points). By default the mesh is placed that way
    (--shift, --offset) so it joins Cesium Mars without a step. Engine routes (in DTM coordinates)
    must be moved the same way to be drawn on this scene.

Limitations: the texture is a grayscale image (with an optional tint that is not measured color);
DTM nodata areas stay as holes; coarse levels subsample the DTM.
"""
from __future__ import annotations

import argparse
import io
import json
import math
import os
import struct
import sys
import time
from dataclasses import dataclass

import numpy as np
import rasterio
from rasterio.windows import Window
from PIL import Image

BASE = "https://astrogeo-ard.s3-us-west-2.amazonaws.com/mars/mro/hirise/controlled/dtm/ESP_019698_1750_ESP_019988_1750/"
DTM_URL = BASE + "DTEEC_019698_1750_019988_1750_U01.tif"
ORTHO_URL = BASE + "ESP_019698_1750_RED_A_01_ORTHO.tif"

R_SPHERE = 3_396_190.0
# Cesium's Ellipsoid.MARS (x, y, z radii in meters).
MARS_RADII = np.array([3_396_190.0, 3_396_190.0, 3_376_200.0])

LEAF_CELLS = 64          # cells per tile side (65 x 65 vertices)
TEX_SIZE = 256           # texture per tile (at the leaves: 64 m / 256 px ≈ 0.25 m)


# --------------------------------------------------------------------------- geometry

def geodetic_to_ecef(lon_deg: np.ndarray, lat_deg: np.ndarray, h: np.ndarray) -> np.ndarray:
    """Same as Cesium.Cartesian3.fromDegrees(lon, lat, h, Ellipsoid.MARS)."""
    lon = np.radians(lon_deg)
    lat = np.radians(lat_deg)
    cl = np.cos(lat)
    n = np.stack([cl * np.cos(lon), cl * np.sin(lon), np.sin(lat)], axis=-1)
    k = n * (MARS_RADII ** 2)
    gamma = np.sqrt(np.sum(n * k, axis=-1, keepdims=True))
    return k / gamma + n * h[..., None]


def to_gltf_axes(v: np.ndarray) -> np.ndarray:
    """Cesium rotates glTF content from Y-up to Z-up: (x, y, z) → (x, −z, y).
    For an ECEF offset (X, Y, Z) to arrive unchanged, it is stored as (X, Z, −Y)."""
    return np.stack([v[..., 0], v[..., 2], -v[..., 1]], axis=-1)


# --------------------------------------------------------------------------- glb

def _pad4(b: bytes, fill: bytes = b"\x00") -> bytes:
    return b + fill * ((4 - len(b) % 4) % 4)


def write_glb(path: str, pos: np.ndarray, nrm: np.ndarray, uv: np.ndarray, idx: np.ndarray,
              jpeg: bytes, translation: np.ndarray) -> int:
    """glb with float32 positions, normalized int8 normals (KHR_mesh_quantization),
    normalized uint16 UVs, uint16 indices and an embedded JPEG texture."""
    n = len(pos)
    pos_b = pos.astype("<f4").tobytes()
    nrm_q = np.clip(np.round(nrm * 127.0), -127, 127).astype(np.int8)
    nrm_b = np.concatenate([nrm_q, np.zeros((n, 1), np.int8)], axis=1).tobytes()  # stride 4
    uv_b = np.clip(np.round(uv * 65535.0), 0, 65535).astype("<u2").tobytes()
    idx_b = idx.astype("<u2").tobytes()

    chunks, views, offset = [], [], 0
    for data, target, stride in ((pos_b, 34962, None), (nrm_b, 34962, 4), (uv_b, 34962, None),
                                 (idx_b, 34963, None), (jpeg, None, None)):
        view = {"buffer": 0, "byteOffset": offset, "byteLength": len(data)}
        if target:
            view["target"] = target
        if stride:
            view["byteStride"] = stride
        views.append(view)
        padded = _pad4(data)
        chunks.append(padded)
        offset += len(padded)
    binary = b"".join(chunks)

    gltf = {
        "asset": {"version": "2.0", "generator": "G21 RED WAYS build_hirise_tiles.py"},
        "extensionsUsed": ["KHR_mesh_quantization"],
        "extensionsRequired": ["KHR_mesh_quantization"],
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "translation": [float(t) for t in translation]}],
        "meshes": [{"primitives": [{
            "attributes": {"POSITION": 0, "NORMAL": 1, "TEXCOORD_0": 2},
            "indices": 3, "material": 0, "mode": 4}]}],
        "materials": [{
            "pbrMetallicRoughness": {"baseColorTexture": {"index": 0},
                                     "metallicFactor": 0.0, "roughnessFactor": 1.0},
            "doubleSided": True}],
        "textures": [{"sampler": 0, "source": 0}],
        "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 33071, "wrapT": 33071}],
        "images": [{"bufferView": 4, "mimeType": "image/jpeg"}],
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": n, "type": "VEC3",
             "min": pos.min(axis=0).tolist(), "max": pos.max(axis=0).tolist()},
            {"bufferView": 1, "componentType": 5120, "normalized": True, "count": n, "type": "VEC3"},
            {"bufferView": 2, "componentType": 5123, "normalized": True, "count": n, "type": "VEC2"},
            {"bufferView": 3, "componentType": 5123, "count": len(idx), "type": "SCALAR"},
        ],
        "bufferViews": views,
        "buffers": [{"byteLength": len(binary)}],
    }
    js = _pad4(json.dumps(gltf, separators=(",", ":")).encode(), b" ")
    total = 12 + 8 + len(js) + 8 + len(binary)
    with open(path, "wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, total))
        f.write(struct.pack("<I4s", len(js), b"JSON"))
        f.write(js)
        f.write(struct.pack("<I4s", len(binary), b"BIN\x00"))
        f.write(binary)
    return total


# --------------------------------------------------------------------------- data

@dataclass
class Parcel:
    z: np.ndarray            # elevation (m), NaN outside the parcel or nodata; rows north→south
    x0: float                # x (m) of the center of cell [0, 0]
    y0: float                # y (m) of the center of cell [0, 0]
    res: float               # cell size (m)
    ortho: np.ndarray        # uint8, same extent, higher resolution
    ortho_x0: float          # x of the left edge of the orthoimage window
    ortho_y0: float          # y of the top edge
    ortho_res: float


def read_dtm(bbox: tuple[float, float, float, float]) -> tuple[np.ndarray, float, float, float]:
    """DTM window of the parcel: (z with NaN as nodata, x and y of the first cell center, cell size)."""
    west, south, east, north = bbox
    xw, xe = math.radians(west) * R_SPHERE, math.radians(east) * R_SPHERE
    ys, yn = math.radians(south) * R_SPHERE, math.radians(north) * R_SPHERE

    with rasterio.open(DTM_URL) as d:
        res = d.res[0]
        col0 = int(math.floor((xw - d.bounds.left) / res))
        col1 = int(math.ceil((xe - d.bounds.left) / res))
        row0 = int(math.floor((d.bounds.top - yn) / res))
        row1 = int(math.ceil((d.bounds.top - ys) / res))
        print(f"DTM: window rows {row0}–{row1}, columns {col0}–{col1}", flush=True)
        z = d.read(1, window=Window(col0, row0, col1 - col0, row1 - row0)).astype(np.float64)
        z[z < -1e30] = np.nan
        x0 = d.bounds.left + (col0 + 0.5) * res
        y0 = d.bounds.top - (row0 + 0.5) * res

    # Exact clip to the parcel (cells whose center falls outside become nodata).
    xs = x0 + np.arange(z.shape[1]) * res
    ys_ = y0 - np.arange(z.shape[0]) * res
    z[:, (xs < xw) | (xs > xe)] = np.nan
    z[(ys_ < ys) | (ys_ > yn), :] = np.nan
    return z, x0, y0, res


def read_parcel(bbox: tuple[float, float, float, float], tint: bool) -> Parcel:
    west, south, east, north = bbox
    xw, xe = math.radians(west) * R_SPHERE, math.radians(east) * R_SPHERE
    ys, yn = math.radians(south) * R_SPHERE, math.radians(north) * R_SPHERE
    z, x0, y0, res = read_dtm(bbox)

    with rasterio.open(ORTHO_URL) as o:
        ores = o.res[0]
        m = 4 * ores  # margin for crops at the edge
        oc0 = int(math.floor((xw - m - o.bounds.left) / ores))
        oc1 = int(math.ceil((xe + m - o.bounds.left) / ores))
        or0 = int(math.floor((o.bounds.top - (yn + m)) / ores))
        or1 = int(math.ceil((o.bounds.top - (ys - m)) / ores))
        print(f"RED orthoimage: window {oc1 - oc0} x {or1 - or0} px at {ores:.3f} m", flush=True)
        raw = o.read(1, window=Window(oc0, or0, oc1 - oc0, or1 - or0))
        ox0 = o.bounds.left + oc0 * ores
        oy0 = o.bounds.top - or0 * ores

    valid = raw > 0
    lo, hi = np.percentile(raw[valid], [0.5, 99.5])
    g = np.clip((raw.astype(np.float64) - lo) / (hi - lo), 0, 1)
    # Narrow output range to resemble Cesium Mars brightness (the app's shader colors both the same way).
    g = 0.12 + 0.50 * g
    g[~valid] = 0.37
    print(f"Orthoimage stretch: DN {lo:.0f}–{hi:.0f}", flush=True)
    if tint:
        # Illustrative tint (not measured color): maps gray to ochre tones similar to Cesium Mars.
        dark, light = np.array([0.20, 0.12, 0.08]), np.array([0.93, 0.76, 0.60])
        rgb = dark + (light - dark) * g[..., None]
    else:
        rgb = np.repeat(g[..., None], 3, axis=2)
    ortho = np.round(rgb * 255).astype(np.uint8)

    return Parcel(z=z, x0=x0, y0=y0, res=res, ortho=ortho, ortho_x0=ox0, ortho_y0=oy0, ortho_res=ores)


# --------------------------------------------------------------------------- tiling

def build(p: Parcel, out: str, offset: float, shift: tuple[float, float], jpeg_quality: int) -> dict:
    rows, cols = p.z.shape
    cells = max(rows, cols) - 1
    depth = max(0, math.ceil(math.log2(cells / LEAF_CELLS)))
    span = LEAF_CELLS * 2 ** depth  # cells covered by the root
    print(f"Grid {rows} x {cols}, {depth + 1} levels, root of {span} cells", flush=True)

    # Full grid padded with NaN up to span + 1 vertices.
    Z = np.full((span + 1, span + 1), np.nan)
    Z[:rows, :cols] = p.z
    # Placement in the scene: DTM coordinates + shift measured against Cesium Mars.
    lon = np.degrees((p.x0 + shift[0] + np.arange(span + 1) * p.res) / R_SPHERE)
    lat = np.degrees((p.y0 + shift[1] - np.arange(span + 1) * p.res) / R_SPHERE)
    LON, LAT = np.meshgrid(lon, lat)
    ecef = geodetic_to_ecef(LON, LAT, np.nan_to_num(Z) + offset)
    up = geodetic_to_ecef(LON, LAT, np.full_like(Z, 1.0)) - geodetic_to_ecef(LON, LAT, np.zeros_like(Z))

    # The root covers more than the parcel: pad the orthoimage so every crop fits.
    need_w = int(math.ceil((p.x0 + span * p.res - p.ortho_x0) / p.ortho_res)) + 4
    need_h = int(math.ceil((p.ortho_y0 - (p.y0 - span * p.res)) / p.ortho_res)) + 4
    padded = np.full((max(need_h, p.ortho.shape[0]), max(need_w, p.ortho.shape[1]), 3), 128, np.uint8)
    padded[:p.ortho.shape[0], :p.ortho.shape[1]] = p.ortho
    ortho_img = Image.fromarray(padded)
    os.makedirs(out, exist_ok=True)
    stats = {"tiles": 0, "bytes": 0, "vertices": 0}

    def tile(level: int, ti: int, tj: int) -> dict | None:
        s = 2 ** (depth - level)
        r0, c0 = ti * LEAF_CELLS * s, tj * LEAF_CELLS * s
        sl = (slice(r0, r0 + LEAF_CELLS * s + 1, s), slice(c0, c0 + LEAF_CELLS * s + 1, s))
        z = Z[sl]
        ok = ~np.isnan(z)
        if ok.sum() < 4:
            return None

        children = []
        if level < depth:
            for di in (0, 1):
                for dj in (0, 1):
                    ch = tile(level + 1, 2 * ti + di, 2 * tj + dj)
                    if ch:
                        children.append(ch)

        P = ecef[sl]
        U = up[sl]
        # Normals: east × north (rows go from north to south).
        d_col = np.gradient(P, axis=1)
        d_row = np.gradient(P, axis=0)
        N = np.cross(d_col, -d_row)
        N /= np.linalg.norm(N, axis=-1, keepdims=True)

        n = LEAF_CELLS + 1
        vid = np.arange(n * n).reshape(n, n)
        a, b, c, d = vid[:-1, :-1], vid[1:, :-1], vid[:-1, 1:], vid[1:, 1:]
        oka, okb, okc, okd = ok[:-1, :-1], ok[1:, :-1], ok[:-1, 1:], ok[1:, 1:]
        t1 = np.stack([a, b, c], -1)[oka & okb & okc]
        t2 = np.stack([c, b, d], -1)[okc & okb & okd]

        # Edge skirts: hide cracks between tiles of different levels.
        skirt = max(2.0, 2.0 * s)
        border = np.concatenate([vid[0, :], vid[:, -1][1:], vid[-1, ::-1][1:], vid[::-1, 0][1:-1]])
        flat_ok = ok.ravel()
        uvg = np.stack(np.meshgrid(np.linspace(0, 1, n), np.linspace(0, 1, n)), -1).reshape(-1, 2)
        pos = P.reshape(-1, 3)
        nrm = N.reshape(-1, 3)
        extra_pos = pos[border] - U.reshape(-1, 3)[border] * skirt
        extra_ids = n * n + np.arange(len(border))
        skirt_tris = []
        for k in range(len(border)):
            k2 = (k + 1) % len(border)
            va, vb = border[k], border[k2]
            if flat_ok[va] and flat_ok[vb]:
                ea, eb = extra_ids[k], extra_ids[k2]
                skirt_tris += [(va, ea, vb), (vb, ea, eb)]
        pos = np.concatenate([pos, extra_pos])
        nrm = np.concatenate([nrm, nrm[border]])
        uvs = np.concatenate([uvg, uvg[border]])
        tris = np.concatenate([t1, t2, np.array(skirt_tris, dtype=np.int64).reshape(-1, 3)])

        # Drop unused vertices (the NaN ones) and reindex.
        used = np.zeros(len(pos), bool)
        used[tris.ravel()] = True
        remap = np.cumsum(used) - 1
        pos, nrm, uvs, tris = pos[used], nrm[used], uvs[used], remap[tris]

        lo, hi = pos.min(0), pos.max(0)
        center = (lo + hi) / 2
        radius = float(np.linalg.norm(pos - center, axis=1).max())

        # Texture: the orthoimage crop between the centers of the corner cells.
        x_a = p.x0 + c0 * p.res
        x_b = p.x0 + (c0 + LEAF_CELLS * s) * p.res
        y_a = p.y0 - r0 * p.res
        y_b = p.y0 - (r0 + LEAF_CELLS * s) * p.res
        box = ((x_a - p.ortho_x0) / p.ortho_res, (p.ortho_y0 - y_a) / p.ortho_res,
               (x_b - p.ortho_x0) / p.ortho_res, (p.ortho_y0 - y_b) / p.ortho_res)
        tex = ortho_img.resize((TEX_SIZE, TEX_SIZE), Image.LANCZOS, box=box)
        buf = io.BytesIO()
        tex.save(buf, "JPEG", quality=jpeg_quality)

        rel = f"{level}/{ti}_{tj}.glb"
        os.makedirs(os.path.join(out, str(level)), exist_ok=True)
        size = write_glb(os.path.join(out, rel), to_gltf_axes(pos - center),
                         to_gltf_axes(nrm), uvs, tris.ravel(), buf.getvalue(), to_gltf_axes(center))
        stats["tiles"] += 1
        stats["bytes"] += size
        stats["vertices"] += len(pos)

        # Geometric error: maximum difference between the full DTM and this subsampled version.
        if level == depth:
            gerr = 0.0
        else:
            full = Z[r0:r0 + LEAF_CELLS * s + 1, c0:c0 + LEAF_CELLS * s + 1]
            zc = np.where(ok, z, np.nan)
            # Bilinear interpolation of the coarse grid onto the fine one.
            fi = np.arange(full.shape[0]) / s
            i0 = np.minimum(np.floor(fi).astype(int), LEAF_CELLS - 1)
            w = fi - i0
            row_i = zc[i0] * (1 - w)[:, None] + zc[i0 + 1] * w[:, None]
            col_i = row_i[:, i0] * (1 - w)[None, :] + row_i[:, i0 + 1] * w[None, :]
            diff = np.abs(full - col_i)
            diff = diff[~np.isnan(diff)]
            gerr = float(np.percentile(diff, 99)) if diff.size else 0.0
            # The texture counts too: with SSE ~6 px, refine before a texel covers more than ~1 px.
            texel = LEAF_CELLS * s * p.res / TEX_SIZE
            gerr = max(gerr, 6.0 * texel)

        node = {
            "boundingVolume": {"sphere": [*map(float, center), radius]},
            "geometricError": round(gerr, 3),
            "content": {"uri": rel},
        }
        if children:
            node["children"] = children
        return node

    t0 = time.time()
    root = tile(0, 0, 0)
    if root is None:
        sys.exit("The parcel has no valid DTM data.")
    root["refine"] = "REPLACE"
    tileset = {
        "asset": {"version": "1.1", "generator": "G21 RED WAYS build_hirise_tiles.py"},
        "geometricError": max(root["geometricError"] * 4, 500.0),
        "root": root,
    }
    with open(os.path.join(out, "tileset.json"), "w") as f:
        json.dump(tileset, f, separators=(",", ":"))
    print(f"{stats['tiles']} tiles, {stats['vertices']:,} vertices, "
          f"{stats['bytes'] / 1e6:.1f} MB in {time.time() - t0:.0f} s", flush=True)
    return {**stats, "levels": depth + 1}


# --------------------------------------------------------------------------- elevation grid

def write_elevation_grid(z: np.ndarray, x0: float, y0: float, res: float, out: str,
                         shift: tuple[float, float]) -> dict:
    """
    DTM elevations of the parcel on the native 1 m grid, for the app's cursor readout
    (elevation and slope under the mouse). Display only; the engine reads the DTM itself.

    Format: elevation.bin = uint16 little-endian, row-major from the north-west cell;
    value = round((z - z_min) / scale); 65535 = nodata. elevation.json describes the grid.
    """
    valid = ~np.isnan(z)
    z_min, z_max = float(np.nanmin(z)), float(np.nanmax(z))
    # 1 cm steps while the relief fits in 16 bits, coarser otherwise.
    scale = max(0.01, math.ceil((z_max - z_min) / 65534 * 100) / 100)
    q = np.full(z.shape, 65535, dtype="<u2")
    q[valid] = np.round((z[valid] - z_min) / scale).astype("<u2")
    with open(os.path.join(out, "elevation.bin"), "wb") as f:
        f.write(q.tobytes())
    info = {
        "product": "DTM elevation grid of the parcel (cursor readout)",
        "kind": "derivado",  # contract value: derived
        "format": "uint16 little-endian, row-major from the north-west cell; z = z_min + value * scale; 65535 = nodata",
        "cols": int(z.shape[1]),
        "rows": int(z.shape[0]),
        "cell_m": res,
        # Center of the first (north-west) cell, DTM projected meters (lon = x / R, lat = y / R).
        "x0_m": x0,
        "y0_m": y0,
        "radius_m": R_SPHERE,
        "z_min_m": z_min,
        "z_max_m": z_max,
        "scale_m": scale,
        "nodata": 65535,
        "nodata_fraction": round(float(1 - valid.mean()), 4),
        "elevation_reference": "DTM elevation (HiRISE DTM vertical datum), not Cesium scene height",
        # The scene is the DTM moved by this amount: the app subtracts it to read the grid.
        "scene_shift_m": {"east": shift[0], "north": shift[1]},
        "source": {"class": "topografica", "mission": "MRO", "instrument": "HiRISE",
                   "product": "DTEEC_019698_1750_019988_1750_U01", "url": DTM_URL, "kind": "observado"},
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    with open(os.path.join(out, "elevation.json"), "w") as f:
        json.dump(info, f, ensure_ascii=False, indent=2)
    print(f"Elevation grid: {z.shape[1]} x {z.shape[0]}, {z_min:.1f}–{z_max:.1f} m, step {scale} m", flush=True)
    return info


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--bbox", nargs=4, type=float, metavar=("W", "S", "E", "N"),
                    default=[137.360, -4.850, 137.410, -4.800],
                    help="degrees, east-positive longitude (default: parcel of the example manifest)")
    ap.add_argument("--offset", type=float, default=56.2,
                    help="meters added to the DTM to match Cesium Mars height (measured in the parcel: 56.2)")
    ap.add_argument("--shift", nargs=2, type=float, metavar=("EAST", "NORTH"), default=[-25.0, 35.0],
                    help="meters the mesh is moved to match Cesium Mars (measured in the parcel: -25 35)")
    ap.add_argument("--out", default="data/processed/gale/tiles_hirise")
    ap.add_argument("--tint", action="store_true",
                    help="ochre tint in the texture (default gray: the app colors it with the same shader as Cesium Mars)")
    ap.add_argument("--jpeg-quality", type=int, default=85)
    ap.add_argument("--grid-only", action="store_true",
                    help="only (re)write the elevation grid for the cursor readout; keeps the existing mesh")
    a = ap.parse_args()

    os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
    os.makedirs(a.out, exist_ok=True)
    if a.grid_only:
        write_elevation_grid(*read_dtm(tuple(a.bbox)), a.out, tuple(a.shift))
        return
    p = read_parcel(tuple(a.bbox), tint=a.tint)
    stats = build(p, a.out, a.offset, tuple(a.shift), a.jpeg_quality)
    write_elevation_grid(p.z, p.x0, p.y0, p.res, a.out, tuple(a.shift))

    meta = {
        "product": "3D mesh of the parcel (3D Tiles 1.1)",
        "kind": "derivado",  # contract value: derived
        "bbox_lonlat_dtm": dict(zip(["west", "south", "east", "north"], a.bbox)),
        # Extent in the scene (shift applied): the app uses it to clip Cesium Mars.
        "bbox_lonlat": {
            "west": a.bbox[0] + math.degrees(a.shift[0] / R_SPHERE),
            "south": a.bbox[1] + math.degrees(a.shift[1] / R_SPHERE),
            "east": a.bbox[2] + math.degrees(a.shift[0] / R_SPHERE),
            "north": a.bbox[3] + math.degrees(a.shift[1] / R_SPHERE),
        },
        "vertical_offset_m": a.offset,
        "horizontal_shift_m": {"east": a.shift[0], "north": a.shift[1]},
        "alignment_note": (
            "Shift and height measured on 2026-11-14 comparing 144 parcel points against Cesium Mars "
            "(0.9 m residual spread). Curiosity positions (MSL_waypoints) are also offset from the DTM: "
            "~(-43, +33) m and elev_geoid ≈ DTM - 17.9 m (563 points)."
        ),
        "texture": "HiRISE RED ortho, 0.5–99.5 % stretched to 0.12–0.62" + (", illustrative ochre tint (not measured color)" if a.tint else ""),
        "sources": [
            {"class": "topografica", "mission": "MRO", "instrument": "HiRISE",
             "product": "DTEEC_019698_1750_019988_1750_U01", "url": DTM_URL, "kind": "observado"},
            {"class": "optica", "mission": "MRO", "instrument": "HiRISE",
             "product": "ESP_019698_1750_RED_A_01_ORTHO", "url": ORTHO_URL, "kind": "observado"},
        ],
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        **stats,
    }
    with open(os.path.join(a.out, "metadata.json"), "w") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
