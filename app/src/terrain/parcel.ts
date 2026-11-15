import * as Cesium from "cesium";
import type { Parcel, Pair } from "../mission/draft";
import { geographicToMetric, metricToScene } from "../mission/geography";

/** Active analytical bounds use the same registered display adapter as the route. */
export function addParcelOutline(viewer: Cesium.Viewer, parcel: Parcel | null) {
  const source = new Cesium.CustomDataSource("parcel-outline");
  void viewer.dataSources.add(source);
  function setParcel(p: Parcel | null) {
    source.entities.removeAll();
    if (!p?.geographic_adapter || !p.bounds_lonlat) return;
    const a = p.geographic_adapter;
    const { west, south, east, north } = p.bounds_lonlat;
    const corners: Pair[] = [[west, south], [east, south], [east, north], [west, north], [west, south]];
    const degrees: number[] = [];
    for (let i = 0; i < corners.length-1; i++) {
      for (let k = 0; k < 60; k++) {
        const f = k/60;
        const lonlat: Pair = [corners[i][0]*(1-f)+corners[i+1][0]*f, corners[i][1]*(1-f)+corners[i+1][1]*f];
        degrees.push(...metricToScene(geographicToMetric(lonlat, a), a));
      }
    }
    degrees.push(...metricToScene(geographicToMetric(corners[0], a), a));
    source.entities.add({ id: "parcel_outline", polyline: {
      positions: Cesium.Cartesian3.fromDegreesArray(degrees, Cesium.Ellipsoid.MARS), width: 3,
      clampToGround: true, material: Cesium.Color.fromCssColorString("#ff3b30"),
    } });
  }
  setParcel(parcel);
  return { setParcel, setVisible: (on: boolean) => { source.show = on; }, isVisible: () => source.show };
}
