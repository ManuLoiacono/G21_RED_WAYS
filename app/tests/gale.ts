/** Development-only inspection of the production scene; never a production entry. */
import * as Cesium from "cesium";
import { onLanguageChange, t } from "../src/i18n";
import { loadMetadata, requestPlan } from "../src/mission/api";
import type { PlanRequest, PlanResponse } from "../src/mission/draft";
import { metricToGeographic, metricToScene, sceneToMetric } from "../src/mission/geography";
import type { createSceneRoutes } from "../src/mission/sceneRoutes";

const debug = window as unknown as { viewer?: Cesium.Viewer; missionRoutes?: ReturnType<typeof createSceneRoutes>; lastPlanRequest?: PlanRequest; lastPlanResponse?: PlanResponse };
const inspector = document.createElement("details");
inspector.id = "sceneInspection";
Object.assign(inspector.style, { position: "fixed", right: "12px", bottom: "20px", zIndex: "100", maxWidth: "520px", maxHeight: "350px", overflow: "auto", background: "#10141fee", padding: "10px", fontSize: "11px" });
inspector.innerHTML = '<summary></summary><button data-check="controls"></button><button data-check="missing"></button><pre id="sceneReport"></pre><pre id="controlReport"></pre>';
document.body.append(inspector);
const translate = () => {
  inspector.querySelector("summary")!.textContent = t("nav.sceneInspection");
  inspector.querySelector('[data-check="controls"]')!.textContent = t("nav.checkControls");
  inspector.querySelector('[data-check="missing"]')!.textContent = t("nav.checkMissingReturn");
};
translate(); onLanguageChange(translate);
function report() {
  const { viewer, missionRoutes: routes, lastPlanResponse: r } = debug;
  const source = routes?.source;
  const now = Cesium.JulianDate.now();
  const a = r?.geographic_adapter;
  let maxError = 0;
  const entities = source?.entities.values.map((e) => {
    const points = e.polyline?.positions?.getValue(now) as Cesium.Cartesian3[] | undefined;
    const name = e.properties?.leg?.getValue(now) as "outbound" | "return" | undefined;
    if (points && name && a && r) points.forEach((p, i) => {
      const c = Cesium.Cartographic.fromCartesian(p, Cesium.Ellipsoid.MARS);
      const xy = sceneToMetric([Cesium.Math.toDegrees(c.longitude), Cesium.Math.toDegrees(c.latitude)], a);
      maxError = Math.max(maxError, Math.hypot(xy[0]-r.alternatives[0][name].xy_m[i][0], xy[1]-r.alternatives[0][name].xy_m[i][1]));
    });
    return { id: e.id, vertices: points?.length ?? 0, point: !!e.point, label: e.label?.text?.getValue(now) };
  });
  const camera = viewer?.camera.positionCartographic;
  inspector.querySelector("#sceneReport")!.textContent = JSON.stringify({ ready: !!routes,
    request_id: routes?.identity(), visible: source?.show, entities, geometry_max_inversion_error_m: maxError,
    panorama_count: viewer?.dataSources.getByName("rover-panoramas")[0]?.entities.values.length,
    camera: camera && { lon: Cesium.Math.toDegrees(camera.longitude), lat: Cesium.Math.toDegrees(camera.latitude), height_m: camera.height },
    legacy_entities: viewer?.entities.values.filter((e) => e.id === "test_route" || e.id.startsWith("poi:")).length,
  }, null, 2);
}
setInterval(report, 500);
inspector.querySelector('[data-check="controls"]')!.addEventListener("click", async () => {
  const metadata = await loadMetadata();
  const q = debug.lastPlanRequest;
  if (!metadata.ok || !q || !debug.viewer || !metadata.data.parcel.geographic_adapter) return;
  const a = metadata.data.parcel.geographic_adapter;
  const rows = [];
  for (const poi of metadata.data.parcel.pois) {
    const result = await requestPlan({ ...structuredClone(q), request_id: `control-${poi.id}`, destination: { type: "poi", poi_id: poi.id } });
    if (!result.ok) { rows.push({ poi: poi.id, error: result.error }); continue; }
    const p = result.data.locations.destination;
    const lonlat = metricToGeographic(p.effective_xy_m, a);
    const scene = metricToScene(p.effective_xy_m, a);
    const inverted = sceneToMetric(scene, a);
    const [sample] = await debug.viewer.scene.sampleHeightMostDetailed([Cesium.Cartographic.fromDegrees(...scene)]);
    rows.push({ poi: poi.id, cell: p.cell, requested_xy_m: p.requested_xy_m, effective_xy_m: p.effective_xy_m,
      lonlat, scene_lonlat: scene, analytical_elevation_m: p.effective_elevation_m,
      round_trip_error_m: Math.hypot(inverted[0]-p.effective_xy_m[0], inverted[1]-p.effective_xy_m[1]),
      sampled_scene_height_m: sample?.height ?? null,
      scene_minus_analytical_m: sample?.height === undefined ? null : sample.height-p.effective_elevation_m,
      residual_after_registered_vertical_offset_m: sample?.height === undefined ? null : sample.height-p.effective_elevation_m-a.vertical_offset_m });
  }
  inspector.querySelector("#controlReport")!.textContent = JSON.stringify(rows, null, 2);
});
inspector.querySelector('[data-check="missing"]')!.addEventListener("click", async () => {
  const r = debug.lastPlanResponse;
  const m = await loadMetadata();
  if (!r || !m.ok || !debug.missionRoutes) return;
  const diagnostic = structuredClone(r);
  diagnostic.alternatives[0].return = { status: "no_path_in_domain", reason: "Renderer diagnostic: absent return", cells: [], xy_m: [], duration_s: null, search_cost_s: null, horizontal_distance_m: null, ascent_m: null, descent_m: null };
  await debug.missionRoutes.show(diagnostic, m.data.parcel);
  report();
});
