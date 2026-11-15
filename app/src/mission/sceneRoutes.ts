import * as Cesium from "cesium";
import { onLanguageChange, t } from "../i18n";
import type { Parcel, PlanResponse, Pair } from "./draft";
import { metricToScene } from "./geography";

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
  function label(key: typeof labels[number]["key"], offset: number) {
    return { text: t(key), font: "13px system-ui, sans-serif", fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK, outlineWidth: 3, style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cesium.Cartesian2(0, offset), disableDepthTestDistance: Number.POSITIVE_INFINITY };
  }
  async function show(r: PlanResponse, parcel: Parcel | null) {
    clear();
    if (!r.geographic_adapter) return;
    const a = parcel?.geographic_adapter;
    if (!a || !parcel || r.request_echo.parcel.id !== parcel.id || r.request_echo.parcel.version !== parcel.version ||
        r.versions.parcel_content_id !== parcel.content_id || a.id !== r.geographic_adapter.id ||
        a.radius_m !== r.geographic_adapter.radius_m || a.vertical_offset_m !== r.geographic_adapter.vertical_offset_m ||
        a.horizontal_shift_m.east !== r.geographic_adapter.horizontal_shift_m.east || a.horizontal_shift_m.north !== r.geographic_adapter.horizontal_shift_m.north) {
      throw new Error("Calculated route does not match the active registered parcel/adapter.");
    }
    const candidate = r.alternatives[0];
    if (!candidate) return;
    const current = generation;
    response = r;
    const position = (xy: Pair, h = 0) => {
      const [lon, lat] = metricToScene(xy, a);
      return Cesium.Cartesian3.fromDegrees(lon, lat, h, Cesium.Ellipsoid.MARS);
    };
    for (const name of ["outbound", "return"] as const) {
      const leg = candidate[name];
      if (leg.status !== "found" || leg.xy_m.length === 0) continue;
      const color = Cesium.Color.fromCssColorString(name === "outbound" ? "#3ff0ff" : "#ffb347");
      const entity = source.entities.add({ id: `route:${r.request_echo.request_id}:${name}`, name: t(`nav.${name}`),
        properties: { request_id: r.request_echo.request_id, leg: name, cells: leg.cells, xy_m: leg.xy_m },
        ...(leg.xy_m.length === 1 ? {
          position: position(leg.xy_m[0], r.locations.origin.effective_elevation_m + a.vertical_offset_m),
          point: { pixelSize: name === "outbound" ? 24 : 14, color: color.withAlpha(.35), outlineColor: color, outlineWidth: 2,
            disableDepthTestDistance: Number.POSITIVE_INFINITY },
        } : { polyline: { positions: leg.xy_m.map((xy) => position(xy)), width: name === "outbound" ? 9 : 4,
          clampToGround: true, zIndex: name === "outbound" ? 0 : 1,
          material: name === "outbound" ? color : new Cesium.PolylineDashMaterialProperty({ color, dashLength: 20 }),
        } }),
      });
      if (leg.xy_m.length === 1) {
        entity.label = new Cesium.LabelGraphics(label(`nav.${name}`, name === "outbound" ? -55 : 50));
        labels.push({ entity, key: `nav.${name}` });
      } else {
        // A short final segment carries direction without replacing any analytical vertices.
        source.entities.add({ id: `route:${r.request_echo.request_id}:${name}:arrow`,
          polyline: { positions: leg.xy_m.slice(-5).map((xy) => position(xy)), width: name === "outbound" ? 16 : 10,
            clampToGround: true, zIndex: name === "outbound" ? 2 : 3,
            material: new Cesium.PolylineArrowMaterialProperty(color) } });
      }
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
        point: { pixelSize: name === "origin" ? 13 : 11, color: Cesium.Color.fromCssColorString(name === "origin" ? "#ffffff" : "#ffd166"),
          outlineColor: Cesium.Color.BLACK, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
        label: label(key, name === "origin" ? -25 : 28),
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
