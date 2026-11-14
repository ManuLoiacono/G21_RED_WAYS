import * as Cesium from "cesium";
import type { PlanResponse } from "./response";
import { altColor } from "./results";

/**
 * Dibuja las alternativas de la respuesta sobre el terreno (clampToGround, D2).
 * Ida: línea continua. Vuelta: línea a trazos (solo si difiere de la ida).
 * Incompatibles: rojo y a trazos. La seleccionada se resalta; las demás quedan tenues.
 */
export class RouteLayer {
  private readonly source = new Cesium.CustomDataSource("plan-routes");
  private styles = new Map<string, { color: Cesium.Color; incompatible: boolean; entities: Cesium.Entity[] }>();

  constructor(viewer: Cesium.Viewer) {
    void viewer.dataSources.add(this.source);
  }

  show(response: PlanResponse) {
    this.clear();
    response.alternatives.forEach((alt, i) => {
      const color = Cesium.Color.fromCssColorString(altColor(alt, i));
      const incompatible = alt.status === "incompatible";
      const entities: Cesium.Entity[] = [];
      const toPositions = (lonlat: [number, number][]) =>
        lonlat.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat, 0, Cesium.Ellipsoid.MARS));

      entities.push(
        this.source.entities.add({
          id: `route:${alt.id}:out`,
          name: `${alt.id} (ida)`,
          polyline: { positions: toPositions(alt.outbound.lonlat), clampToGround: true },
        }),
      );
      if (!sameLine(alt.outbound.lonlat, [...alt.return.lonlat].reverse())) {
        entities.push(
          this.source.entities.add({
            id: `route:${alt.id}:ret`,
            name: `${alt.id} (vuelta)`,
            polyline: { positions: toPositions(alt.return.lonlat), clampToGround: true },
          }),
        );
      }
      this.styles.set(alt.id, { color, incompatible, entities });
    });
  }

  select(altId: string | null) {
    for (const [id, { color, incompatible, entities }] of this.styles) {
      const selected = id === altId;
      const c = selected ? color : color.withAlpha(0.45);
      entities.forEach((e, k) => {
        const isReturn = k === 1;
        e.polyline!.width = new Cesium.ConstantProperty(selected ? 7 : 4);
        e.polyline!.zIndex = new Cesium.ConstantProperty(selected ? 10 : 1);
        e.polyline!.material =
          incompatible || isReturn
            ? new Cesium.PolylineDashMaterialProperty({ color: c, dashLength: 14 })
            : selected
              ? new Cesium.PolylineGlowMaterialProperty({ color: c, glowPower: 0.25 })
              : new Cesium.ColorMaterialProperty(c);
      });
    }
  }

  clear() {
    this.source.entities.removeAll();
    this.styles.clear();
  }
}

function sameLine(a: [number, number][], b: [number, number][]) {
  return a.length === b.length && a.every(([x, y], i) => x === b[i][0] && y === b[i][1]);
}
