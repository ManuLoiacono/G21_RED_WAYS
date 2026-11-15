/** Component regressions use the production modules with a real, token-free Cesium viewer.
 * This harness cannot establish that streamed Gale terrain/registration is correct.
 */
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import "../src/style.css";
import { translateStaticDom } from "../src/i18n";
import { addPanoramas, PANORAMAS } from "../src/panoramas/panoramas";
import { createPanoramaViewer } from "../src/panoramas/viewer";
import { createLayersPanel } from "../src/ui/layers";
import { createSourcesPanel } from "../src/provenance/panel";
import { installWheelZoom, keepCameraAboveGround } from "../src/camera";

translateStaticDom();
document.body.style.margin = "0";
const container = document.getElementById("cesiumContainer")!;
Object.assign(container.style, { width: "100vw", height: "100vh" });
Cesium.Ellipsoid.default = Cesium.Ellipsoid.MARS;
const viewer = new Cesium.Viewer(container, {
  baseLayer: false, baseLayerPicker: false, geocoder: false, timeline: false, animation: false,
  skyBox: false, globe: false, infoBox: false, selectionIndicator: false,
});
const first = PANORAMAS[0];
const reset = () => viewer.camera.setView({
  destination: Cesium.Cartesian3.fromDegrees(first.lonlat[0], first.lonlat[1], first.elevGeoidM + 171.2, Cesium.Ellipsoid.MARS),
  orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
});
reset();
document.getElementById("resetCamera")!.onclick = () => { reset(); report(); };
installWheelZoom(viewer);
keepCameraAboveGround(viewer);
const markers = addPanoramas(viewer);
await Promise.resolve(); // DataSourceCollection.add publishes on the next microtask.
const panorama = createPanoramaViewer(document.getElementById("panoDialog") as HTMLDialogElement);
createSourcesPanel(document.getElementById("sourcesDialog") as HTMLDialogElement);
createLayersPanel(document.getElementById("layersPanel")!, [{
  id: "panoramas", section: "observations", dataClass: "optica", name: "layers.panoramas", origin: "MSL Â· Mastcam Â· Navcam",
  sourceId: "rover_panoramas", status: () => "streaming",
  visibility: { get: () => markers.isVisible(), set: (on) => { markers.setVisible(on); report(); } },
  action: { label: "layers.panoramas.view", run: () => panorama.open(first) },
}]);
function report() {
  const source = viewer.dataSources.getByName("rover-panoramas")[0];
  const entity = source.entities.getById("pano:" + first.id)!;
  const position = entity.position!.getValue(Cesium.JulianDate.now())!;
  const height = Cesium.Cartographic.fromCartesian(position, Cesium.Ellipsoid.MARS).height;
  document.getElementById("regressionStatus")!.textContent = JSON.stringify({
    marker_count: source.entities.values.length, marker_visible: markers.isVisible(),
    visual_height_offset_m: Number((height - first.elevGeoidM).toFixed(3)),
    wheel_mode: viewer.scene.screenSpaceCameraController.zoomEventTypes,
    camera_height_m: Number(viewer.camera.positionCartographic.height.toFixed(3)),
  });
}
report();
viewer.camera.changed.addEventListener(report);
