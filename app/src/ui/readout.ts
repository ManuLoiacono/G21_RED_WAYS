import * as Cesium from "cesium";
import { numberLocale, onLanguageChange, t } from "../i18n";
import type { ElevationGrid, TerrainSample } from "../terrain/elevationGrid";
import type { ThermalSample } from "../thermal/themis";
import { esc, fmtNumber } from "./format";

/**
 * Cursor readout: position, DTM elevation and local slope under the mouse.
 * Elevation and slope come from the 1 m HiRISE DTM grid (derived); outside the parcel only the
 * position is shown. Shown only while the mouse is over the terrain, never on touch screens.
 */

interface Reading {
  lon: number;
  lat: number;
  inGrid: boolean;
  sample: TerrainSample | null;
  thermal: ThermalSample | null;
}

/** THEMIS reading at a DTM-frame position (null when the layer is off or outside the crop). */
export type ThermalProbe = (lonDtm: number, latDtm: number) => ThermalSample | null;

export interface CursorReadout {
  /** Slope above which the value is highlighted (the profile's maximum, editable in the form). */
  setSlopeLimit(deg: number): void;
}

/** Degrees with exactly 4 decimals (~6 m), so the readout does not jump in width. */
const fmtDeg = (d: number) =>
  new Intl.NumberFormat(numberLocale(), { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(d);
const fmtLat = (lat: number) => `${fmtDeg(Math.abs(lat))}° ${lat < 0 ? t("readout.south") : t("readout.north")}`;
const fmtLon = (lon: number) => `${fmtDeg(lon)}° ${t("readout.east")}`;

export function createCursorReadout(
  viewer: Cesium.Viewer,
  grid: ElevationGrid | undefined,
  thermalAt: ThermalProbe = () => null,
): CursorReadout {
  const el = document.createElement("div");
  el.id = "cursorReadout";
  el.hidden = true;
  el.setAttribute("aria-hidden", "true"); // mouse-only aid; the same data is not needed to use the app
  document.body.appendChild(el);

  let last: Reading | null = null;
  let slopeLimit = Infinity;

  function render() {
    if (!last) {
      el.hidden = true;
      return;
    }
    const { lon, lat, inGrid, sample, thermal } = last;
    const thermalRow = thermal
      ? `<div class="ro-thermal" title="${esc(t("readout.thermal.title", { dn: String(thermal.dn) }))}">
           <dt>${esc(t("readout.thermal"))}</dt><dd>${esc(t(`readout.thermal.${thermal.band}`))}</dd>
         </div>`
      : "";
    const steep = sample?.slope_deg != null && sample.slope_deg > slopeLimit;
    const coordsTitle = inGrid ? t("readout.coords.dtm") : t("readout.coords.scene");
    el.innerHTML = `
      <div class="ro-coords" title="${esc(coordsTitle)}">${esc(fmtLat(lat))} · ${esc(fmtLon(lon))}</div>
      ${
        sample
          ? `<dl>
               <div title="${esc(t("readout.elevation.title"))}"><dt>${esc(t("readout.elevation"))}</dt><dd>${esc(fmtNumber(sample.elevation_m, 1))} m</dd></div>
               <div title="${esc(steep ? t("readout.slope.steep", { max: fmtNumber(slopeLimit, 1) }) : t("readout.slope.title"))}" ${steep ? 'class="ro-steep"' : ""}>
                 <dt>${esc(t("readout.slope"))}</dt><dd>${sample.slope_deg == null ? "—" : `${esc(fmtNumber(sample.slope_deg, 1))}°`}</dd>
               </div>
               ${thermalRow}
             </dl>
             <div class="ro-tag">${esc(t("readout.tag"))}</div>`
          : `<div class="ro-tag">${esc(grid ? t("readout.outside") : t("readout.noGrid"))}</div>`
      }`;
    el.hidden = false;
  }

  // Touch screens have no hover: the readout would only flash on taps.
  if (window.matchMedia("(hover: none)").matches) return { setSlopeLimit() {} };

  const scratch = new Cesium.Cartographic();
  let pending: Cesium.Cartesian2 | null = null;
  const update = () => {
    const pos = pending;
    pending = null;
    if (!pos) return;
    const world = viewer.scene.pickPositionSupported ? viewer.scene.pickPosition(pos) : undefined;
    if (!world) {
      last = null;
      render();
      return;
    }
    const carto = Cesium.Cartographic.fromCartesian(world, Cesium.Ellipsoid.MARS, scratch);
    if (!carto) return;
    const sceneLon = Cesium.Math.toDegrees(carto.longitude);
    const sceneLat = Cesium.Math.toDegrees(carto.latitude);
    const sample = grid?.sampleScene(sceneLon, sceneLat) ?? null;
    if (sample && grid) {
      // Inside the grid, show DTM coordinates: the same frame as the elevation and the engine.
      const { radius_m: R, scene_shift_m: shift } = grid.info;
      const lon = sceneLon - Cesium.Math.toDegrees(shift.east / R);
      const lat = sceneLat - Cesium.Math.toDegrees(shift.north / R);
      last = { lon, lat, inGrid: true, sample, thermal: thermalAt(lon, lat) };
    } else {
      last = { lon: sceneLon, lat: sceneLat, inGrid: false, sample: null, thermal: null };
    }
    render();
  };

  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  handler.setInputAction((move: Cesium.ScreenSpaceEventHandler.MotionEvent) => {
    if (!pending) requestAnimationFrame(update);
    pending = Cesium.Cartesian2.clone(move.endPosition);
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
  viewer.scene.canvas.addEventListener("mouseleave", () => {
    pending = null;
    last = null;
    render();
  });

  onLanguageChange(render);
  return {
    setSlopeLimit(deg) {
      slopeLimit = deg;
      render();
    },
  };
}
