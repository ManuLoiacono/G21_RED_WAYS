import * as Cesium from "cesium";
import { onLanguageChange, t } from "../i18n";
import type { Parcel, PlanResponse, Pair } from "./draft";
import { metricToScene } from "./geography";
import { FlowMaterialProperty, lengthOf, sharesPath, smoothForDisplay } from "./flowMaterial";

/** Owns only calculated mission entities; optical observations have their own data source. */
export function createSceneRoutes(viewer: Cesium.Viewer) {
  const source = new Cesium.CustomDataSource("calculated-mission");
  void viewer.dataSources.add(source);
  let generation = 0;
  let response: PlanResponse | null = null;
  const labels: { entity: Cesium.Entity; key: "nav.outbound" | "nav.return" | "nav.baseResolved" | "nav.destinationResolved" }[] = [];
  function clear() {
    generation += 1; response = null; labels.length = 0; source.entities.removeAll();
  }
  function label(key: typeof labels[number]["key"], offset: number, color = "#ffffff") {
    return { text: t(key), font: "600 13px system-ui, sans-serif", fillColor: Cesium.Color.fromCssColorString(color),
      style: Cesium.LabelStyle.FILL, showBackground: true,
      backgroundColor: Cesium.Color.fromCssColorString("rgba(14, 14, 18, 0.85)"), backgroundPadding: new Cesium.Cartesian2(9, 6),
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset: new Cesium.Cartesian2(0, offset), disableDepthTestDistance: Number.POSITIVE_INFINITY };
  }
  async function show(r: PlanResponse, parcel: Parcel | null, selectedId?: string | null) {
    clear();
    if (!r.geographic_adapter) return;
    const a = parcel?.geographic_adapter;
    if (!a || !parcel || r.request_echo.parcel.id !== parcel.id || r.request_echo.parcel.version !== parcel.version ||
        r.versions.parcel_content_id !== parcel.content_id || a.id !== r.geographic_adapter.id ||
        a.radius_m !== r.geographic_adapter.radius_m || a.vertical_offset_m !== r.geographic_adapter.vertical_offset_m ||
        a.horizontal_shift_m.east !== r.geographic_adapter.horizontal_shift_m.east || a.horizontal_shift_m.north !== r.geographic_adapter.horizontal_shift_m.north) {
      throw new Error("Calculated route does not match the active registered parcel/adapter.");
    }
    const candidate = r.alternatives.find((alt) => alt.id === selectedId) ?? r.alternatives[0];
    if (!candidate) return;
    const current = generation;
    response = r;
    const position = (xy: Pair, h = 0) => {
      const [lon, lat] = metricToScene(xy, a);
      return Cesium.Cartesian3.fromDegrees(lon, lat, h, Cesium.Ellipsoid.MARS);
    };
    // When the return retraces the outbound cells, one animated line tells the story; drawing both
    // stacks two halos and opposite chevrons on the same pixels. The return keeps a hidden entity
    // with its data so nothing that reads the legs loses it.
    const shared = sharesPath(candidate.outbound, candidate.return);
    for (const name of ["outbound", "return"] as const) {
      const leg = candidate[name];
      if (leg.status !== "found" || leg.xy_m.length === 0) continue;
      if (name === "return" && shared) {
        source.entities.add({ id: `route:${r.request_echo.request_id}:${name}`, name: t(`nav.${name}`), show: false,
          properties: { request_id: r.request_echo.request_id, alternative_id: candidate.id, leg: name, cells: leg.cells, xy_m: leg.xy_m, same_path_as_outbound: true } });
        continue;
      }
      const color = Cesium.Color.fromCssColorString(name === "outbound" ? "#3ff0ff" : "#ffb347");
      if (leg.xy_m.length === 1) {
        const entity = source.entities.add({ id: `route:${r.request_echo.request_id}:${name}`, name: t(`nav.${name}`),
          properties: { request_id: r.request_echo.request_id, alternative_id: candidate.id, leg: name, cells: leg.cells, xy_m: leg.xy_m },
          position: position(leg.xy_m[0], r.locations.origin.effective_elevation_m + a.vertical_offset_m),
          point: { pixelSize: name === "outbound" ? 24 : 14, color: color.withAlpha(.35), outlineColor: color, outlineWidth: 2,
            disableDepthTestDistance: Number.POSITIVE_INFINITY },
        });
        entity.label = new Cesium.LabelGraphics(label(`nav.${name}`, name === "outbound" ? -55 : 50));
        labels.push({ entity, key: `nav.${name}` });
        continue;
      }
      // Drawing only: corner-cut copy of the calculated vertices (kept unchanged in `properties`).
      const drawn = smoothForDisplay(leg.xy_m);
      const positions = drawn.map((xy) => position(xy));
      const outbound = name === "outbound";
      // Dark halo under the line so it reads on bright and dark terrain.
      source.entities.add({ id: `route:${r.request_echo.request_id}:${name}:halo`,
        polyline: { positions, width: outbound ? 12 : 9, clampToGround: true, zIndex: outbound ? 0 : 2,
          material: Cesium.Color.BLACK.withAlpha(0.5) } });
      source.entities.add({ id: `route:${r.request_echo.request_id}:${name}`, name: t(`nav.${name}`),
        properties: { request_id: r.request_echo.request_id, alternative_id: candidate.id, leg: name, cells: leg.cells, xy_m: leg.xy_m },
        polyline: { positions, width: outbound ? 8 : 5.5, clampToGround: true, zIndex: outbound ? 1 : 3,
          // Animated chevrons every ~35 m, moving in the direction of travel.
          material: new FlowMaterialProperty(color, Math.max(3, lengthOf(drawn) / 35), 0.5) } });
    }
    const markers: Cesium.Entity[] = [];
    const cartos: Cesium.Cartographic[] = [];
    for (const name of ["origin", "destination"] as const) {
      const location = r.locations[name];
      const [lon, lat] = metricToScene(location.effective_xy_m, a);
      const key = name === "origin" ? "nav.baseResolved" : "nav.destinationResolved";
      const entity = source.entities.add({ id: `route:${name}`, name: t(key),
        position: position(location.effective_xy_m, location.effective_elevation_m + a.vertical_offset_m),
        properties: { requested_xy_m: location.requested_xy_m, effective_xy_m: location.effective_xy_m, cell: location.cell },
        point: { pixelSize: 14, color: Cesium.Color.fromCssColorString(name === "origin" ? "#7ee787" : "#3ff0ff"),
          outlineColor: Cesium.Color.WHITE, outlineWidth: 2.5, disableDepthTestDistance: Number.POSITIVE_INFINITY },
        label: label(key, -14, name === "origin" ? "#7ee787" : "#3ff0ff"),
      });
      labels.push({ entity, key }); markers.push(entity);
      cartos.push(Cesium.Cartographic.fromDegrees(lon, lat));
    }
    // Only drawing uses scene sampling; edits invalidate even an in-flight height request.
    try {
      const sampled = await viewer.scene.sampleHeightMostDetailed(cartos);
      if (generation !== current) return;
      sampled.forEach((c, i) => {
        if (c && Number.isFinite(c.height)) markers[i].position = new Cesium.ConstantPositionProperty(
          Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, c.height, Cesium.Ellipsoid.MARS));
      });
    } catch {
      // The provisional registered DTM display height remains; analytical data is unchanged.
    }
  }
  onLanguageChange(() => {
    for (const { entity, key } of labels) {
      entity.name = t(key);
      if (entity.label) entity.label.text = new Cesium.ConstantProperty(t(key));
    }
  });
  return { source, clear, show, setVisible: (on: boolean) => { source.show = on; }, isVisible: () => source.show,
    identity: () => response?.request_echo.request_id ?? null,
    focus() {
      if (!response) return;
      // Ground polylines retain height-zero input vertices; their bounding sphere is unsuitable
      // for camera focus above negative-elevation terrain. Use the resolved display markers.
      const now = Cesium.JulianDate.now();
      const positions = ["origin", "destination"].flatMap((name) => {
        const p = source.entities.getById(`route:${name}`)?.position?.getValue(now);
        return p ? [p] : [];
      });
      if (positions.length) viewer.camera.flyToBoundingSphere(Cesium.BoundingSphere.fromPoints(positions),
        { duration: 1, offset: new Cesium.HeadingPitchRange(0, -Math.PI/3, 450) });
    } };
}
