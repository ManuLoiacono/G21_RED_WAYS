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
 * Orbit (rotate the 3D view) around the terrain point under the cursor.
 *
 * Cesium's own tilt (middle drag / Ctrl + left drag) pivots on the globe, which is hidden here and
 * lies 3–4 km above the Gale terrain, so it does not work in this scene. This handler picks the
 * pivot on the rendered terrain instead:
 * - right drag, middle drag or Ctrl + left drag: horizontal movement turns around the pivot's
 *   vertical (heading), vertical movement tilts the view (pitch);
 * - the tilt is limited so the camera never looks from below the pivot's horizon or straight down
 *   past the vertical.
 * Pinch tilt on touch devices is left to Cesium.
 */
export interface OrbitOptions {
  /** Radians of rotation per pixel of drag. */
  radiansPerPixel?: number;
  /** Lowest allowed camera elevation above the pivot's horizon, in degrees. */
  minElevation_deg?: number;
  /** Highest allowed camera elevation above the pivot's horizon, in degrees. */
  maxElevation_deg?: number;
}

const MIN_CLEARANCE_M = 30;
const FALLBACK_PIVOT_DISTANCE_M = 1000;

export function installOrbit(viewer: Cesium.Viewer, opts: OrbitOptions = {}) {
  const radiansPerPixel = opts.radiansPerPixel ?? 0.005;
  const minElevation = Cesium.Math.toRadians(opts.minElevation_deg ?? 3);
  const maxElevation = Cesium.Math.toRadians(opts.maxElevation_deg ?? 89);
  const { scene, camera, canvas } = viewer;
  const controller = scene.screenSpaceCameraController;

  // Cesium keeps only pinch tilt; mouse tilt is handled here.
  controller.tiltEventTypes = [Cesium.CameraEventType.PINCH];
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  let dragging = false;
  let last = new Cesium.Cartesian2();
  let frame: Cesium.Matrix4 | undefined;

  const pickPivot = (screen: Cesium.Cartesian2): Cesium.Cartesian3 | undefined => {
    const hit = scene.pickPositionSupported ? scene.pickPosition(screen) : undefined;
    if (Cesium.defined(hit)) return hit;
    // Sky under the cursor: use the terrain at the center of the screen.
    const center = new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2);
    const mid = scene.pickPositionSupported ? scene.pickPosition(center) : undefined;
    if (Cesium.defined(mid)) return mid;
    // Terrain not rendered yet: a point ahead of the camera, so the view still turns.
    return Cesium.Cartesian3.add(
      camera.positionWC,
      Cesium.Cartesian3.multiplyByScalar(camera.directionWC, FALLBACK_PIVOT_DISTANCE_M, new Cesium.Cartesian3()),
      new Cesium.Cartesian3(),
    );
  };

  /** Camera elevation angle above the pivot's local horizon (camera is in the pivot frame). */
  const elevation = () => {
    const p = camera.position;
    const horizontal = Math.hypot(p.x, p.y);
    return Math.atan2(p.z, horizontal);
  };

  const start = (position: Cesium.Cartesian2) => {
    const pivot = pickPivot(position);
    if (!pivot) return;
    frame = Cesium.Transforms.eastNorthUpToFixedFrame(pivot);
    camera.lookAtTransform(frame);
    controller.enableInputs = false;
    dragging = true;
    last = Cesium.Cartesian2.clone(position);
  };

  const move = (position: Cesium.Cartesian2) => {
    if (!dragging || !frame) return;
    const dx = position.x - last.x;
    const dy = position.y - last.y;
    last = Cesium.Cartesian2.clone(position);
    const turn = dx * radiansPerPixel;
    let tilt = 0;
    if (dy) {
      const before = elevation();
      const target = Cesium.Math.clamp(before + dy * radiansPerPixel, minElevation, maxElevation);
      tilt = target - before;
    }
    if (turn) camera.rotateRight(turn);
    if (Math.abs(tilt) > 1e-6) camera.rotateUp(tilt);
    // Undo the step if it would put the camera into a hill between it and the pivot.
    if (belowGround()) {
      if (Math.abs(tilt) > 1e-6) camera.rotateUp(-tilt);
      if (turn) camera.rotateRight(-turn);
    }
  };

  const belowGround = () => {
    const carto = scene.ellipsoid.cartesianToCartographic(camera.positionWC);
    if (!carto) return false;
    const ground = scene.sampleHeight(carto);
    return ground !== undefined && carto.height < ground + MIN_CLEARANCE_M;
  };

  const end = () => {
    if (!dragging) return;
    dragging = false;
    frame = undefined;
    camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    controller.enableInputs = true;
  };

  const handler = new Cesium.ScreenSpaceEventHandler(canvas);
  const down = (e: { position: Cesium.Cartesian2 }) => start(e.position);
  handler.setInputAction(down, Cesium.ScreenSpaceEventType.RIGHT_DOWN);
  handler.setInputAction(down, Cesium.ScreenSpaceEventType.MIDDLE_DOWN);
  handler.setInputAction(down, Cesium.ScreenSpaceEventType.LEFT_DOWN, Cesium.KeyboardEventModifier.CTRL);
  const moveAction = (e: { endPosition: Cesium.Cartesian2 }) => move(e.endPosition);
  handler.setInputAction(moveAction, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
  handler.setInputAction(moveAction, Cesium.ScreenSpaceEventType.MOUSE_MOVE, Cesium.KeyboardEventModifier.CTRL);
  handler.setInputAction(end, Cesium.ScreenSpaceEventType.RIGHT_UP);
  handler.setInputAction(end, Cesium.ScreenSpaceEventType.MIDDLE_UP);
  handler.setInputAction(end, Cesium.ScreenSpaceEventType.LEFT_UP);
  handler.setInputAction(end, Cesium.ScreenSpaceEventType.LEFT_UP, Cesium.KeyboardEventModifier.CTRL);
  window.addEventListener("blur", end);
  return handler;
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
    // While orbiting, the camera works in the pivot's frame; installOrbit checks the ground itself.
    if (correcting || !Cesium.Matrix4.equals(camera.transform, Cesium.Matrix4.IDENTITY)) return;
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
