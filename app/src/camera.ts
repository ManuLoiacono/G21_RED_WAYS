import * as Cesium from "cesium";

/**
 * Mouse-wheel zoom for terrain below the ellipsoid (P1-01).
 *
 * In Gale the terrain is ~3.4–4.4 km BELOW the Mars ellipsoid. Cesium's zoom uses the
 * "height above the ellipsoid" as its distance measure when it finds no surface under the
 * center of the screen: that height is negative, the zoom inverts and the camera ends up under
 * the terrain or climbing towards 0 m. This zoom moves towards or away from the point under the
 * cursor and keeps a minimum clearance above the ground.
 *
 * Pinch zoom (tablet) is still Cesium's; `keepCameraAboveGround` fixes the camera if any
 * gesture leaves it under the terrain. (The tileset's `enableCollision` would do the same, but
 * with Cesium Mars it stalls tile loading.)
 */
export interface WheelZoomOptions {
  /** Fraction of the distance to the target point covered by each wheel step. */
  stepFraction?: number;
  /** Minimum camera height above the terrain, in meters. */
  minClearance_m?: number;
  /** Maximum camera height above the terrain, in meters. */
  maxClearance_m?: number;
}

export function installWheelZoom(viewer: Cesium.Viewer, opts: WheelZoomOptions = {}) {
  const stepFraction = opts.stepFraction ?? 0.2;
  const minClearance = opts.minClearance_m ?? 30;
  const maxClearance = opts.maxClearance_m ?? 40_000;
  const { scene, camera, canvas } = viewer;
  const ellipsoid = scene.ellipsoid;

  // Cesium stops handling the wheel (and right-button drag, which uses the same zoom).
  scene.screenSpaceCameraController.zoomEventTypes = [Cesium.CameraEventType.PINCH];

  const scratchDir = new Cesium.Cartesian3();
  const scratchPos = new Cesium.Cartesian3();

  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      if (e.deltaY === 0) return;
      const zoomIn = e.deltaY < 0;
      // Several wheel steps at once (or a trackpad) move proportionally, with a cap.
      const notches = Math.min(Math.abs(e.deltaY) / 100, 3) || 1;

      const rect = canvas.getBoundingClientRect();
      const cursor = new Cesium.Cartesian2(e.clientX - rect.left, e.clientY - rect.top);
      const origin = camera.positionWC;
      const target = scene.pickPositionSupported ? scene.pickPosition(cursor) : undefined;

      let dir: Cesium.Cartesian3;
      let distance: number;
      if (Cesium.defined(target)) {
        distance = Cesium.Cartesian3.distance(origin, target);
        dir = Cesium.Cartesian3.normalize(Cesium.Cartesian3.subtract(target, origin, scratchDir), scratchDir);
      } else {
        // No surface under the cursor (sky): move along the view direction based on the height above ground.
        dir = Cesium.Cartesian3.clone(camera.directionWC, scratchDir);
        distance = Math.max(clearanceAt(origin) ?? 1000, 200);
      }

      let step = distance * stepFraction * notches;
      if (zoomIn) step = Math.min(step, Math.max(distance - minClearance, 0));
      else step = -step * 1.25;
      if (Math.abs(step) < 0.5) return;

      const next = Cesium.Cartesian3.add(origin, Cesium.Cartesian3.multiplyByScalar(dir, step, scratchPos), scratchPos);
      const carto = ellipsoid.cartesianToCartographic(next);
      if (!carto) return;
      const ground = scene.sampleHeight(carto);
      if (ground !== undefined) {
        if (carto.height < ground + minClearance) carto.height = ground + minClearance;
        if (carto.height > ground + maxClearance) return;
      }

      camera.setView({
        destination: ellipsoid.cartographicToCartesian(carto),
        orientation: { heading: camera.heading, pitch: camera.pitch, roll: camera.roll },
      });
    },
    { passive: false },
  );

  function clearanceAt(position: Cesium.Cartesian3): number | undefined {
    const c = ellipsoid.cartesianToCartographic(position);
    if (!c) return undefined;
    const g = scene.sampleHeight(c);
    return g === undefined ? undefined : c.height - g;
  }
}

/**
 * If a gesture (drag, tilt, pinch) leaves the camera under the terrain or closer than
 * `minClearance_m` to the ground, it lifts it. Checked when the camera changes, not every frame.
 */
export function keepCameraAboveGround(viewer: Cesium.Viewer, minClearance_m = 30) {
  const { scene, camera } = viewer;
  const ellipsoid = scene.ellipsoid;
  camera.percentageChanged = 0.01;
  let correcting = false;

  const check = () => {
    if (correcting) return;
    const carto = ellipsoid.cartesianToCartographic(camera.positionWC);
    if (!carto) return;
    const ground = scene.sampleHeight(carto);
    if (ground === undefined || carto.height >= ground + minClearance_m) return;
    correcting = true;
    carto.height = ground + minClearance_m;
    camera.setView({
      destination: ellipsoid.cartographicToCartesian(carto),
      orientation: { heading: camera.heading, pitch: camera.pitch, roll: camera.roll },
    });
    correcting = false;
  };
  camera.changed.addEventListener(check);
  camera.moveEnd.addEventListener(check);
}
