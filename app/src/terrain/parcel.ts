import * as Cesium from "cesium";

/**
 * Outline of the analysis parcel, drawn in red on the terrain.
 *
 * The extent is the one in contracts/parcel_manifest.example.json (`extent_lonlat`), which is in
 * DTM coordinates. The scene (Cesium Mars and the HiRISE mesh) shows the DTM moved by a measured
 * shift, so the outline is moved the same way to land on the same ground the engine evaluates.
 * Replace the extent with the real manifest when P3-02 publishes it.
 */

/** Parcel extent in DTM coordinates (degrees, east-positive longitude): ~3 × 3 km (0.05° per side = 2 964 m on the DTM grid), centered on 137.385° E, −4.825°. */
export const PARCEL_EXTENT_DTM = { west: 137.36, south: -4.85, east: 137.41, north: -4.8 };

/** DTM → scene shift measured on 2026-11-14 (see CLAUDE.md); the HiRISE metadata overrides it. */
export const DEFAULT_SCENE_SHIFT_M = { east: -25, north: 35 };

const R_MARS = 3_396_190;
const POINTS_PER_EDGE = 60; // ~30 m apart, so the clamped line follows the relief
const COLOR = "#ff3b30";

export interface ParcelOutline {
  setVisible(on: boolean): void;
  isVisible(): boolean;
}

export function addParcelOutline(viewer: Cesium.Viewer, shift = DEFAULT_SCENE_SHIFT_M): ParcelOutline {
  const dLon = Cesium.Math.toDegrees(shift.east / R_MARS);
  const dLat = Cesium.Math.toDegrees(shift.north / R_MARS);
  const { west, south, east, north } = PARCEL_EXTENT_DTM;
  const corners: [number, number][] = [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
    [west, south],
  ];
  const degrees: number[] = [];
  for (let i = 0; i < corners.length - 1; i++) {
    const [lon0, lat0] = corners[i];
    const [lon1, lat1] = corners[i + 1];
    for (let k = 0; k < POINTS_PER_EDGE; k++) {
      const f = k / POINTS_PER_EDGE;
      degrees.push(lon0 + (lon1 - lon0) * f + dLon, lat0 + (lat1 - lat0) * f + dLat);
    }
  }
  degrees.push(corners[0][0] + dLon, corners[0][1] + dLat);

  const source = new Cesium.CustomDataSource("parcel-outline");
  source.entities.add({
    id: "parcel_outline",
    name: "Parcel outline",
    polyline: {
      positions: Cesium.Cartesian3.fromDegreesArray(degrees, Cesium.Ellipsoid.MARS),
      width: 3,
      clampToGround: true,
      material: Cesium.Color.fromCssColorString(COLOR),
    },
  });
  void viewer.dataSources.add(source);

  return {
    setVisible(on) {
      source.show = on;
    },
    isVisible: () => source.show,
  };
}
