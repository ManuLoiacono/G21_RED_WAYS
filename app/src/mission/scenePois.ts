import * as Cesium from "cesium";
import { onLanguageChange, t, tOr } from "../i18n";
import type { Parcel, PlanRequest } from "./draft";
import { metricToScene } from "./geography";

/**
 * Registered points of the active parcel, shown while the wizard is on the Mission step.
 * Origin and destination are highlighted. Display only: no click interaction. Points are placed on
 * the rendered terrain with clampToHeightMostDetailed (clampToGround does not work for points with
 * the globe hidden). Needs a parcel with a geographic adapter; otherwise nothing is drawn.
 */
export function createScenePois(viewer: Cesium.Viewer) {
  const source = new Cesium.CustomDataSource("registered-points");
  void viewer.dataSources.add(source);
  let generation = 0;
  let last: { parcel: Parcel; request: PlanRequest } | null = null;
  /** Origin/destination pair the camera last flew to; reset when the preview is hidden. */
  let lastFlight = "";

  async function update(visible: boolean, parcel: Parcel | null, request: PlanRequest | null) {
    const current = ++generation;
    source.entities.removeAll();
    last = parcel && request ? { parcel, request } : null;
    const adapter = parcel?.geographic_adapter;
    if (!visible) lastFlight = "";
    if (!visible || !parcel || !request || !adapter) return;
    const raw = parcel.pois.map((p) => {
      const [lon, lat] = metricToScene(p.xy_m, adapter);
      return Cesium.Cartesian3.fromDegrees(lon, lat, 0, Cesium.Ellipsoid.MARS);
    });
    let positions: (Cesium.Cartesian3 | undefined)[] = raw;
    try {
      positions = await viewer.scene.clampToHeightMostDetailed(raw.map((c) => Cesium.Cartesian3.clone(c)));
    } catch { /* terrain not ready: keep raw positions */ }
    if (current !== generation) return;
    // Dashed straight line between origin and destination: a visual reference, not the route.
    const oi = parcel.pois.findIndex((p) => p.id === request.origin.poi_id);
    const di = parcel.pois.findIndex((p) => p.id === request.destination.poi_id);
    if (oi >= 0 && di >= 0 && oi !== di) {
      source.entities.add({ polyline: { positions: [raw[oi], raw[di]], width: 3, clampToGround: true,
        material: new Cesium.PolylineDashMaterialProperty({ color: Cesium.Color.WHITE.withAlpha(0.85), dashLength: 14 }) } });
      const key = `${parcel.id}/${request.origin.poi_id}->${request.destination.poi_id}`;
      if (key !== lastFlight) {
        lastFlight = key;
        const ends = [positions[oi] ?? raw[oi], positions[di] ?? raw[di]];
        const sphere = Cesium.BoundingSphere.fromPoints(ends);
        viewer.camera.flyToBoundingSphere(sphere, {
          duration: 1.4,
          offset: new Cesium.HeadingPitchRange(viewer.camera.heading, Cesium.Math.toRadians(-40), Math.max(sphere.radius * 5, 450)),
        });
      }
    }
    parcel.pois.forEach((p, i) => {
      const role = p.id === request.origin.poi_id ? "origin" : p.id === request.destination.poi_id ? "destination" : "other";
      const color = Cesium.Color.fromCssColorString(role === "origin" ? "#7ee787" : role === "destination" ? "#3ff0ff" : "#c0c0cc");
      const name = tOr(`nav.poi.${p.id}`, p.id);
      const text = role === "other" ? name : `${t(role === "origin" ? "wizard.poi.origin" : "wizard.poi.destination")}: ${name}`;
      source.entities.add({
        position: positions[i] ?? raw[i],
        point: { pixelSize: role === "other" ? 10 : 16, color: color.withAlpha(0.85), outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
        label: { text, font: "13px system-ui, sans-serif", fillColor: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3, style: Cesium.LabelStyle.FILL_AND_OUTLINE, pixelOffset: new Cesium.Cartesian2(0, -22),
          disableDepthTestDistance: Number.POSITIVE_INFINITY },
      });
    });
  }

  onLanguageChange(() => { if (source.entities.values.length && last) void update(true, last.parcel, last.request); });
  return { update };
}
