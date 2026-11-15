import * as Cesium from "cesium";
import mastcam from "./panoramas.json";
import navcam from "./navcam_panoramas.json";
import { getLanguage, onLanguageChange, t } from "../i18n";
import { roverIconUrl } from "./roverIcon";

/**
 * Real 360° panoramas taken by Curiosity inside the parcel, shown as points of interest
 * (observed, optical class). Two kinds:
 * - Mastcam color mosaics, curated by hand (`panoramas.json`).
 * - Navcam grayscale mosaics that NASA publishes for most stops, collected by
 *   `scripts/build_rover_panoramas.py` (`navcam_panoramas.json`). Their pages give the azimuth at
 *   the center of the image, so the viewer can show a compass.
 * Positions are the rover's own (MSL_waypoints), already in the scene frame.
 */
export interface Panorama {
  id: string;
  camera: "mastcam" | "navcam";
  /** Fixed titles by language (Mastcam); Navcam titles are built from the sol. */
  titles: Record<string, string>;
  lonlat: [number, number];
  /** Rover elevation at the stop (MSL_waypoints `elev_geoid`), metres. */
  elevGeoidM: number;
  solStart: number;
  solEnd: number;
  dateStart: string | null;
  dateEnd: string | null;
  instrument: string;
  images: number | null;
  credit: string;
  pageUrl: string;
  imageUrl: string;
  imageMb: number | null;
  /** Azimuth at the horizontal center of the image, degrees clockwise from north (NASA page). */
  azimuthCenterDeg: number | null;
  /** Local mean solar time of the exposures, as NASA writes it (e.g. "3 PM to 4 PM"). */
  lmst: string | null;
}

const MASTCAM: Panorama[] = mastcam.panoramas.map((p) => ({
  id: p.id,
  camera: "mastcam",
  titles: { es: p.title, en: p.title_en },
  lonlat: p.lonlat as [number, number],
  elevGeoidM: p.elev_geoid_m,
  solStart: p.sol_start,
  solEnd: p.sol_end,
  dateStart: p.date_start,
  dateEnd: p.date_end,
  instrument: p.instrument,
  images: p.images,
  credit: p.credit,
  pageUrl: p.page_url,
  imageUrl: p.image_url,
  imageMb: Math.round(p.image_bytes / 1e6),
  azimuthCenterDeg: null,
  lmst: null,
}));

/** One entry of navcam_panoramas.json (written by scripts/build_rover_panoramas.py). */
interface NavcamEntry {
  sol: number;
  sol_start: number;
  sol_end: number;
  date: string | null;
  azimuth_center_deg: number;
  frames: number | null;
  lmst: string | null;
  image_url: string;
  image_mb: number | null;
  page_url: string;
  lonlat: number[];
  elev_geoid_m: number;
}

const NAVCAM: Panorama[] = (navcam.panoramas as NavcamEntry[]).map((p) => ({
  id: `navcam_sol_${p.sol}`,
  camera: "navcam",
  titles: {},
  lonlat: [p.lonlat[0], p.lonlat[1]],
  elevGeoidM: p.elev_geoid_m,
  solStart: p.sol_start,
  solEnd: p.sol_end,
  dateStart: p.date,
  dateEnd: p.date,
  instrument: "Navcam",
  images: p.frames,
  credit: "NASA/JPL-Caltech",
  pageUrl: p.page_url,
  imageUrl: p.image_url,
  imageMb: p.image_mb === null ? null : Math.round(p.image_mb),
  azimuthCenterDeg: p.azimuth_center_deg,
  lmst: p.lmst,
}));

/** Color Mastcam first (the "View" button opens the first one), then Navcam by sol. */
export const PANORAMAS: Panorama[] = [...MASTCAM, ...NAVCAM];

export const panoTitle = (p: Panorama) =>
  p.titles[getLanguage()] ?? p.titles.es ?? t("pano.navcamTitle", { sol: String(p.solStart) });
const COLOR = { mastcam: "#c792ff", navcam: "#e2d4ff" };
/** Rover icon per camera: color Mastcam larger with a white outline, Navcam violet with a dark one. */
const ICON = {
  mastcam: { url: roverIconUrl("#c792ff", "#ffffff"), size: 40 },
  navcam: { url: roverIconUrl("#a46bff", "#2a1150"), size: 30 },
};
/** Scale of the icon under the pointer (selectable feedback). */
const HOVER_SCALE = 1.3;
/** Navcam labels only show up close, so the map does not fill with text. */
const NAVCAM_LABEL_MAX_DISTANCE_M = 1800;

export interface PanoramaLayer {
  setVisible(on: boolean): void;
  isVisible(): boolean;
  /** Enlarges the rover under the pointer (entity id `pano:<id>`), or none with null. */
  setHover(entityId: string | null): void;
}

/** Panorama drawn by the entity with this id (`pano:<id>`), if any. Used by the map click handler. */
export function panoramaForEntity(entityId: string): Panorama | undefined {
  return entityId.startsWith("pano:") ? PANORAMAS.find((p) => p.id === entityId.slice(5)) : undefined;
}

/**
 * Cesium Mars heights ≈ rover `elev_geoid` + 71.2 m (measured 2026-11-14 at 20 Curiosity positions,
 * ±0.3 m; see CLAUDE.md). Used ONLY to draw the point on the visual tileset: no terrain sampling
 * needed, and never mixed with DTM heights.
 */
const CESIUM_MINUS_GEOID_M = 71.2;

/** Adds the panorama points (synchronous: the height comes from the rover data, see above). */
export function addPanoramas(viewer: Cesium.Viewer): PanoramaLayer {
  const source = new Cesium.CustomDataSource("rover-panoramas");
  void viewer.dataSources.add(source);
  const entities = new Map<string, Cesium.Entity>();
  for (const p of PANORAMAS) {
    entities.set(
      p.id,
      source.entities.add({
        id: `pano:${p.id}`,
        name: panoTitle(p),
        position: Cesium.Cartesian3.fromDegrees(p.lonlat[0], p.lonlat[1], p.elevGeoidM + CESIUM_MINUS_GEOID_M, Cesium.Ellipsoid.MARS),
        billboard: {
          image: ICON[p.camera].url,
          width: ICON[p.camera].size,
          height: ICON[p.camera].size,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: panoTitle(p),
          font: p.camera === "mastcam" ? "13px system-ui, sans-serif" : "12px system-ui, sans-serif",
          fillColor: Cesium.Color.fromCssColorString(COLOR[p.camera]),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -(ICON[p.camera].size / 2 + 2)),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          distanceDisplayCondition:
            p.camera === "navcam" ? new Cesium.DistanceDisplayCondition(0, NAVCAM_LABEL_MAX_DISTANCE_M) : undefined,
        },
      }),
    );
  }
  onLanguageChange(() => {
    for (const p of PANORAMAS) {
      const e = entities.get(p.id);
      if (!e) continue;
      e.name = panoTitle(p);
      if (e.label) e.label.text = new Cesium.ConstantProperty(panoTitle(p));
    }
  });
  let hovered: Cesium.Entity | null = null;
  return {
    setVisible: (on) => void (source.show = on),
    isVisible: () => source.show,
    setHover(entityId) {
      const next = entityId ? source.entities.getById(entityId) ?? null : null;
      if (next === hovered) return;
      if (hovered?.billboard) hovered.billboard.scale = new Cesium.ConstantProperty(1);
      if (next?.billboard) next.billboard.scale = new Cesium.ConstantProperty(HOVER_SCALE);
      hovered = next;
    },
  };
}
