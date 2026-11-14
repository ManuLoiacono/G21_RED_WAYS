import * as Cesium from "cesium";

/**
 * 1 m HiRISE mesh of the parcel (visual only).
 *
 * Built by scripts/build_hirise_tiles.py into data/processed/gale/tiles_hirise/ and served by Vite
 * at /local-data/ (see vite.config.ts). Inside the parcel it replaces Cesium Mars, which reaches
 * ~2.5 m in Gale: Cesium Mars is clipped with a polygon and stays around it as context.
 * If the mesh has not been built, the app keeps going with Cesium Mars and reports no error.
 */

export const HIRISE_TILESET_URL = "/local-data/gale/tiles_hirise/tileset.json";
const METADATA_URL = "/local-data/gale/tiles_hirise/metadata.json";

/** Cesium Mars is clipped slightly inside the mesh edge so no slivers show. */
const CLIP_INSET_M = 3;

interface Metadata {
  bbox_lonlat: { west: number; south: number; east: number; north: number };
  vertical_offset_m: number;
  generated_at: string;
}

export interface HiriseLayer {
  tileset: Cesium.Cesium3DTileset;
  metadata: Metadata;
  setVisible(on: boolean): void;
}

export async function loadHiriseLayer(
  viewer: Cesium.Viewer,
  base: Cesium.Cesium3DTileset,
): Promise<HiriseLayer | undefined> {
  let metadata: Metadata;
  try {
    const res = await fetch(METADATA_URL);
    if (!res.ok) return undefined;
    metadata = (await res.json()) as Metadata;
  } catch {
    return undefined;
  }

  const tileset = await Cesium.Cesium3DTileset.fromUrl(HIRISE_TILESET_URL);
  viewer.scene.primitives.add(tileset);

  const { west, south, east, north } = metadata.bbox_lonlat;
  const dLat = Cesium.Math.toDegrees(CLIP_INSET_M / 3_396_190);
  const dLon = dLat / Math.cos(Cesium.Math.toRadians((south + north) / 2));
  const clip = new Cesium.ClippingPolygon({
    positions: Cesium.Cartesian3.fromDegreesArray(
      [west + dLon, south + dLat, east - dLon, south + dLat, east - dLon, north - dLat, west + dLon, north - dLat],
      Cesium.Ellipsoid.MARS,
    ),
  });
  base.clippingPolygons = new Cesium.ClippingPolygonCollection({ polygons: [clip] });

  return {
    tileset,
    metadata,
    setVisible(on) {
      tileset.show = on;
      base.clippingPolygons.enabled = on;
    },
  };
}
