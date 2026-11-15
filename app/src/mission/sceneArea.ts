import * as Cesium from "cesium";
import type { Parcel, ReachableArea } from "./draft";
import { decodeArea, conservativeBlocks } from "./area";
import { metricToScene } from "./geography";

/** Independent source: area visibility never changes routes, thermal or panoramas. */
export function createSceneArea(viewer: Cesium.Viewer) {
  const source = new Cesium.CustomDataSource("complete-sortie-reachable-area");
  void viewer.dataSources.add(source);
  source.show = false;
  function clear() { source.entities.removeAll(); source.show = false; }
  function show(layer: ReachableArea, parcel: Parcel | null) {
    clear();
    const adapter = parcel?.geographic_adapter;
    if (!adapter || !layer.geographic_adapter) return;
    const other = layer.geographic_adapter;
    if (layer.parcel_content_id !== parcel.content_id || layer.request_echo.parcel.id !== parcel.id || layer.request_echo.parcel.version !== parcel.version ||
        other.id !== adapter.id || other.radius_m !== adapter.radius_m || other.horizontal_shift_m.east !== adapter.horizontal_shift_m.east || other.horizontal_shift_m.north !== adapter.horizontal_shift_m.north ||
        layer.grid.shape.some((v, i) => v !== parcel.grid.shape[i]) || layer.grid.spacing_m.some((v, i) => v !== parcel.grid.spacing_m[i]) ||
        layer.grid.origin_center_xy_m.some((v, i) => v !== parcel.grid.origin_center_xy_m[i]) || layer.grid.row_direction !== parcel.grid.row_direction) throw new Error("Area does not match the active parcel registration.");
    const [rows, cols] = layer.grid.shape;
    const canvas = document.createElement("canvas"); canvas.width = cols; canvas.height = rows;
    const context = canvas.getContext("2d")!;
    const sign = layer.grid.row_direction === "increasing_y" ? 1 : -1;
    for (const block of conservativeBlocks(decodeArea(layer), layer.grid.shape)) {
      context.fillStyle = block.state === 5 ? "rgba(70,225,130,0.6)" : "rgba(255,185,65,0.6)";
      context.fillRect(block.col, sign < 0 ? block.row : rows - block.row - block.height, block.width, block.height);
    }
    const [dy, dx] = layer.grid.spacing_m;
    const x0 = layer.grid.origin_center_xy_m[0] - dx / 2;
    const y0 = layer.grid.origin_center_xy_m[1] - sign * dy / 2;
    const y1 = y0 + sign * rows * dy;
    const [west, south] = metricToScene([x0, Math.min(y0, y1)], adapter);
    const [east, north] = metricToScene([x0 + cols * dx, Math.max(y0, y1)], adapter);
    source.entities.add({ id: "reachable-area", properties: { request_id: layer.request_echo.request_id, revision: layer.request_echo.revision, layer_id: layer.id },
      rectangle: { coordinates: Cesium.Rectangle.fromDegrees(west, south, east, north),
        material: new Cesium.ImageMaterialProperty({ image: canvas, transparent: true }), classificationType: Cesium.ClassificationType.CESIUM_3D_TILE } });
    source.show = true;
  }
  return { source, clear, show, setVisible: (on: boolean) => { source.show = on; }, isVisible: () => source.show };
}
