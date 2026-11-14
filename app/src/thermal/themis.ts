import * as Cesium from "cesium";
import data from "./themis_nir_parcel.json";
import { DEFAULT_SCENE_SHIFT_M } from "../terrain/parcel";

/**
 * "Loose material" warning layer (thermal class, P1) from the THEMIS nighttime infrared mosaic
 * (Mars Odyssey), cropped to the parcel by scripts/build_themis_parcel.py.
 *
 * At night loose material (sand, dust, fine regolith) cools faster than rock and firm ground, so it
 * is darker in this mosaic. The layer tints the coldest pixels amber, RELATIVE to the parcel
 * (percentiles 2–98 of the crop). It is qualitative: 8-bit brightness, not thermal inertia, one
 * value per 100 m × 100 m. It only warns; it does not change routes.
 *
 * Drawn as a rectangle classified onto the 3D tiles (Cesium Mars and the HiRISE mesh), moved by
 * the same DTM → scene shift as the parcel outline. Each pixel is drawn as an amber grid (opacity by
 * looseness) instead of a solid fill, so the terrain stays visible; pixels are kept square, with no
 * smoothing that would suggest detail finer than 100 m.
 */

const R_MARS = 3_396_190;
/** Texture pixels per THEMIS pixel (nearest-neighbour upscale). */
const UPSCALE = 32;
/** Each cell is drawn as an amber grid (not a solid fill), so the terrain shows through.
 * Line spacing and width in texture pixels: 8 of 32 = 25 m, 2 of 32 ≈ 6 m on the ground. */
const GRID_SPACING = 8;
const GRID_LINE = 2;
const TINT: [number, number, number] = [255, 170, 40];
/** Opacity of the grid lines of the most "loose" pixel. */
const MAX_ALPHA = 0.95;
/** Opacity for a relative looseness r in [0, 1]: firm ground fades out. */
const alphaFor = (r: number) => MAX_ALPHA * r ** 1.5;

/** Relative looseness bands shown in the readout. */
export type Looseness = "looser" | "intermediate" | "firmer";

export interface ThermalSample {
  dn: number;
  /** 0 = warmest in the parcel (firmer), 1 = coldest (looser). */
  relative: number;
  band: Looseness;
}

export interface ThermalLayer {
  setVisible(on: boolean): void;
  isVisible(): boolean;
  /** THEMIS value at a DTM-frame position, or null outside the crop / nodata. */
  sample(lonDtm: number, latDtm: number): ThermalSample | null;
}

const [LO, HI] = data.stretch as [number, number];
const relative = (dn: number) => Math.min(1, Math.max(0, (HI - dn) / (HI - LO)));

function texture(): HTMLCanvasElement {
  const { width: w, height: h, dn, nodata } = data;
  const canvas = document.createElement("canvas");
  canvas.width = w * UPSCALE;
  canvas.height = h * UPSCALE;
  const g = canvas.getContext("2d")!;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = dn[y * w + x];
      if (v === nodata) continue;
      g.fillStyle = `rgba(${TINT.join(",")},${alphaFor(relative(v)).toFixed(3)})`;
      const x0 = x * UPSCALE;
      const y0 = y * UPSCALE;
      // Vertical lines full height; horizontal ones only between them, so crossings are not
      // painted twice (they would look brighter).
      for (let k = 0; k < UPSCALE; k += GRID_SPACING) g.fillRect(x0 + k, y0, GRID_LINE, UPSCALE);
      for (let j = 0; j < UPSCALE; j += GRID_SPACING) {
        for (let k = 0; k < UPSCALE; k += GRID_SPACING) {
          g.fillRect(x0 + k + GRID_LINE, y0 + j, GRID_SPACING - GRID_LINE, GRID_LINE);
        }
      }
    }
  }
  return canvas;
}

export function addThermalLayer(viewer: Cesium.Viewer, shift = DEFAULT_SCENE_SHIFT_M): ThermalLayer {
  const dLon = Cesium.Math.toDegrees(shift.east / R_MARS);
  const dLat = Cesium.Math.toDegrees(shift.north / R_MARS);
  const b = data.bbox_lonlat;
  const source = new Cesium.CustomDataSource("themis-loose-material");
  source.entities.add({
    id: "themis_loose_material",
    name: "THEMIS night IR",
    rectangle: {
      coordinates: Cesium.Rectangle.fromDegrees(b.west + dLon, b.south + dLat, b.east + dLon, b.north + dLat),
      material: new Cesium.ImageMaterialProperty({ image: texture(), transparent: true }),
      classificationType: Cesium.ClassificationType.CESIUM_3D_TILE,
    },
  });
  source.show = false; // off by default: a warning layer the user turns on
  void viewer.dataSources.add(source);

  return {
    setVisible: (on) => void (source.show = on),
    isVisible: () => source.show,
    sample(lon, lat) {
      const x = Math.floor(((lon - b.west) / (b.east - b.west)) * data.width);
      const y = Math.floor(((b.north - lat) / (b.north - b.south)) * data.height);
      if (x < 0 || y < 0 || x >= data.width || y >= data.height) return null;
      const dn = data.dn[y * data.width + x];
      if (dn === data.nodata) return null;
      const r = relative(dn);
      return { dn, relative: r, band: r >= 2 / 3 ? "looser" : r >= 1 / 3 ? "intermediate" : "firmer" };
    },
  };
}

/** Legend gradient (CSS), same tint and opacity curve as the texture. */
const amber = `rgb(${TINT.join(",")})`;
const lines = (deg: number) => `repeating-linear-gradient(${deg}deg, ${amber} 0 1.5px, transparent 1.5px 6px)`;
/** Legend swatch (inline CSS): the same amber grid, fading from looser (left) to firmer (right)
 * with the texture's opacity curve. */
const fade = `linear-gradient(to right,${[0, 0.25, 0.5, 0.75, 1]
  .map((x) => `rgba(0,0,0,${(alphaFor(1 - x) / MAX_ALPHA).toFixed(3)}) ${x * 100}%`)
  .join(",")})`;
export const LEGEND_STYLE = `background-image:${lines(90)},${lines(0)};mask-image:${fade};-webkit-mask-image:${fade};`;
