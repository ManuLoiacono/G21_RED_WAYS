/**
 * DTM elevation grid of the parcel (1 m HiRISE, native grid), for the cursor readout.
 *
 * Written by scripts/build_hirise_tiles.py next to the mesh (elevation.bin + elevation.json) and
 * served by Vite at /local-data/. Display only: the engine reads the DTM on its own (D2).
 *
 * Coordinates: the scene shows the DTM moved by `scene_shift_m` (to match Cesium Mars), so a
 * point picked on the scene is moved back before reading the grid. Elevations are DTM values, not
 * Cesium scene heights (those are ~71 m off).
 */

const BASE = "/local-data/gale/tiles_hirise/";

export interface GridInfo {
  cols: number;
  rows: number;
  cell_m: number;
  x0_m: number;
  y0_m: number;
  radius_m: number;
  z_min_m: number;
  scale_m: number;
  nodata: number;
  scene_shift_m: { east: number; north: number };
}

export interface TerrainSample {
  /** DTM elevation (m), bilinear between the 4 surrounding cells. */
  elevation_m: number;
  /** Slope (degrees) at 1 m, central differences around the nearest cell. */
  slope_deg: number | null;
}

export class ElevationGrid {
  private constructor(
    readonly info: GridInfo,
    private readonly data: Uint16Array,
  ) {}

  /** Loads the grid; undefined if it has not been built on this machine. */
  static async load(): Promise<ElevationGrid | undefined> {
    try {
      const res = await fetch(`${BASE}elevation.json`);
      if (!res.ok) return undefined;
      const info = (await res.json()) as GridInfo;
      const bin = await fetch(`${BASE}elevation.bin`);
      if (!bin.ok) return undefined;
      const buffer = await bin.arrayBuffer();
      if (buffer.byteLength !== info.cols * info.rows * 2) {
        console.warn("elevation.bin does not match elevation.json; cursor readout disabled.");
        return undefined;
      }
      // The file is little-endian, like every browser this app targets.
      return new ElevationGrid(info, new Uint16Array(buffer));
    } catch {
      return undefined;
    }
  }

  private z(row: number, col: number): number | null {
    if (row < 0 || col < 0 || row >= this.info.rows || col >= this.info.cols) return null;
    const v = this.data[row * this.info.cols + col];
    return v === this.info.nodata ? null : this.info.z_min_m + v * this.info.scale_m;
  }

  /** Reads the grid at a scene position (degrees, as Cesium returns them). Null outside or on nodata. */
  sampleScene(lonDeg: number, latDeg: number): TerrainSample | null {
    const { radius_m: R, scene_shift_m: shift, x0_m, y0_m, cell_m } = this.info;
    const x = (lonDeg * Math.PI) / 180 * R - shift.east;
    const y = (latDeg * Math.PI) / 180 * R - shift.north;
    const fc = (x - x0_m) / cell_m;
    const fr = (y0_m - y) / cell_m;
    const c = Math.floor(fc);
    const r = Math.floor(fr);
    const corners = [this.z(r, c), this.z(r, c + 1), this.z(r + 1, c), this.z(r + 1, c + 1)];
    if (corners.some((v) => v === null)) return null;
    const [z00, z01, z10, z11] = corners as number[];
    const tx = fc - c;
    const ty = fr - r;
    const elevation_m = (z00 * (1 - tx) + z01 * tx) * (1 - ty) + (z10 * (1 - tx) + z11 * tx) * ty;

    const rn = Math.round(fr);
    const cn = Math.round(fc);
    const e = this.z(rn, cn + 1);
    const w = this.z(rn, cn - 1);
    const n = this.z(rn - 1, cn);
    const s = this.z(rn + 1, cn);
    let slope_deg: number | null = null;
    if (e !== null && w !== null && n !== null && s !== null) {
      const dzdx = (e - w) / (2 * cell_m);
      const dzdy = (n - s) / (2 * cell_m);
      slope_deg = (Math.atan(Math.hypot(dzdx, dzdy)) * 180) / Math.PI;
    }
    return { elevation_m, slope_deg };
  }
}
