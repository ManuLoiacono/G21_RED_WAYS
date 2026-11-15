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
export type InputMode = "auto" | "mouse" | "trackpad";

const PINCH_FRACTION_PER_UNIT = 0.012;
const TRACKPAD_RADIANS_PER_UNIT = 0.004;
/** After a wheel event that looks like a trackpad, keep treating the stream as trackpad for this long. */
const TRACKPAD_STICKY_MS = 1200;

/**
 * Mouse wheel vs. two-finger trackpad scroll. Browsers deliver both as `wheel` events, so this is a
 * heuristic: mouse notches are large (>= ~50 px, or line mode) and purely vertical; trackpads send
 * small, continuous deltas and often a horizontal component. A detected trackpad gesture stays
 * "sticky" briefly, because fast swipes can produce large deltas mid-stream.
 */
function isTrackpad(e: WheelEvent, mode: InputMode, state: { trackpadUntil: number }): boolean {
  if (mode === "mouse") return false;
  if (mode === "trackpad") return true;
  const now = performance.now();
  const looksTrackpad = e.deltaMode === 0 && (e.deltaX !== 0 || Math.abs(e.deltaY) < 50 || !Number.isInteger(e.deltaY));
  if (looksTrackpad) state.trackpadUntil = now + TRACKPAD_STICKY_MS;
  return looksTrackpad || now < state.trackpadUntil;
}

export interface WheelZoomOptions {
  /** Fraction of the distance to the target point covered by each wheel step. */
  stepFraction?: number;
  /** Orbit control used by two-finger trackpad scroll (tilt and turn). Without it, wheel always zooms. */
  orbit?: Orbit;
  /** Current input preference (auto-detect, mouse or trackpad). */
  inputMode?: () => InputMode;
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
  const pointer = { trackpadUntil: 0 };

  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const cursor = new Cesium.Cartesian2(e.clientX - rect.left, e.clientY - rect.top);

      // Trackpad pinch arrives as a wheel event with ctrlKey (Chrome, Edge, Firefox).
      if (e.ctrlKey) {
        if (e.deltaY) zoomAt(cursor, e.deltaY < 0, Math.min(Math.abs(e.deltaY) * PINCH_FRACTION_PER_UNIT, 0.5));
        return;
      }
      if (opts.orbit && isTrackpad(e, opts.inputMode?.() ?? "auto", pointer)) {
        // Two fingers: up = camera ends above the ground looking down; down = towards the horizon.
        // Sideways = turn around the view center.
        opts.orbit.nudge(-e.deltaX * TRACKPAD_RADIANS_PER_UNIT, -e.deltaY * TRACKPAD_RADIANS_PER_UNIT);
        return;
      }
      if (e.deltaY === 0) return;
      // Several wheel steps at once move proportionally, with a cap.
      const notches = Math.min(Math.abs(e.deltaY) / 100, 3) || 1;
      zoomAt(cursor, e.deltaY < 0, stepFraction * notches);
    },
    { passive: false },
  );

  function zoomAt(cursor: Cesium.Cartesian2, zoomIn: boolean, fraction: number) {
    {
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

      let step = distance * fraction;
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
    }
  }

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

  /** One rotation step in the current pivot frame: turn around the vertical, tilt clamped to the limits. */
  const step = (turn: number, tiltRequest: number) => {
    let tilt = 0;
    if (tiltRequest) {
      const before = elevation();
      tilt = Cesium.Math.clamp(before + tiltRequest, minElevation, maxElevation) - before;
    }
    if (turn) camera.rotateRight(turn);
    // In the pivot frame, Cesium's rotateUp(a) lowers the camera's elevation by a (measured), so a
    // positive elevation change is applied with rotateUp(-tilt).
    if (Math.abs(tilt) > 1e-6) camera.rotateUp(-tilt);
    // Undo the step if it would put the camera into a hill between it and the pivot.
    if (belowGround()) {
      if (Math.abs(tilt) > 1e-6) camera.rotateUp(tilt);
      if (turn) camera.rotateRight(-turn);
    }
  };

  const move = (position: Cesium.Cartesian2) => {
    if (!dragging || !frame) return;
    const dx = position.x - last.x;
    const dy = position.y - last.y;
    last = Cesium.Cartesian2.clone(position);
    // Dragging up raises the camera (looks more from above), like two fingers up on a touchpad.
    step(dx * radiansPerPixel, -dy * radiansPerPixel);
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

  /** Rotate around the terrain at the center of the view (used by two-finger trackpad scroll). */
  const nudge = (turn: number, tilt: number) => {
    if (dragging || (!turn && !tilt)) return;
    const center = new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2);
    const pivot = pickPivot(center);
    if (!pivot) return;
    camera.lookAtTransform(Cesium.Transforms.eastNorthUpToFixedFrame(pivot));
    step(turn, tilt);
    camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
  };

  return { handler, nudge };
}

export type Orbit = ReturnType<typeof installOrbit>;

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

/**
 * Keyboard flight: W/S forward and back, A/D sideways (parallel to the ground, following the view
 * heading), Q/E orbit left and right around the terrain point at the center of the view (same pivot
 * as the touchpad turn). Shift moves faster. Speed grows with the height above
 * the terrain. Keys are ignored while typing in a form field or when a dialog is open.
 */
export interface KeyboardMoveOptions {
  /** Horizontal speed as a fraction of the height above the terrain, per second. */
  speedPerClearance?: number;
  minSpeed_mps?: number;
  maxSpeed_mps?: number;
  /** Turn rate for Q/E, degrees per second. */
  turnRate_dps?: number;
  /** Speed multiplier while Shift is held. */
  fastFactor?: number;
}

const MOVE_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE"]);

export function installKeyboardMove(viewer: Cesium.Viewer, orbit: Orbit, opts: KeyboardMoveOptions = {}) {
  const speedPerClearance = opts.speedPerClearance ?? 0.8;
  const minSpeed = opts.minSpeed_mps ?? 15;
  const maxSpeed = opts.maxSpeed_mps ?? 4000;
  const turnRate = Cesium.Math.toRadians(opts.turnRate_dps ?? 60);
  const fastFactor = opts.fastFactor ?? 3;
  const { scene, camera } = viewer;
  const ellipsoid = scene.ellipsoid;
  const pressed = new Set<string>();
  let shift = false;
  let frame = 0;
  let lastTime = 0;

  const typing = (target: EventTarget | null) => {
    const el = target as HTMLElement | null;
    if (!el) return false;
    return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
  };

  const tick = (time: number) => {
    const dt = Math.min((time - lastTime) / 1000, 0.1);
    lastTime = time;
    if (!pressed.size) { frame = 0; return; }
    if (!Cesium.Matrix4.equals(camera.transform, Cesium.Matrix4.IDENTITY)) { frame = requestAnimationFrame(tick); return; }

    const carto = ellipsoid.cartesianToCartographic(camera.positionWC);
    if (carto) {
      const ground = scene.sampleHeight(carto);
      const clearance = ground === undefined ? 1000 : Math.max(carto.height - ground, 0);
      const speed = Cesium.Math.clamp(clearance * speedPerClearance, minSpeed, maxSpeed) * (shift ? fastFactor : 1);
      const forward = (pressed.has("KeyW") ? 1 : 0) - (pressed.has("KeyS") ? 1 : 0);
      const right = (pressed.has("KeyD") ? 1 : 0) - (pressed.has("KeyA") ? 1 : 0);
      const turn = (pressed.has("KeyE") ? 1 : 0) - (pressed.has("KeyQ") ? 1 : 0);
      // E turns the view to the right (heading increases) by orbiting around the view center.
      if (turn) orbit.nudge(-turn * turnRate * dt, 0);
      const heading = camera.heading;
      const pitch = camera.pitch;

      if (forward || right) {
        let destination = Cesium.Cartesian3.clone(camera.positionWC);
        // Horizontal axes from the local east-north-up frame and the camera heading.
        const enu = Cesium.Transforms.eastNorthUpToFixedFrame(camera.positionWC);
        const east = Cesium.Matrix4.getColumn(enu, 0, new Cesium.Cartesian4());
        const north = Cesium.Matrix4.getColumn(enu, 1, new Cesium.Cartesian4());
        const e3 = new Cesium.Cartesian3(east.x, east.y, east.z);
        const n3 = new Cesium.Cartesian3(north.x, north.y, north.z);
        const fwd = Cesium.Cartesian3.add(
          Cesium.Cartesian3.multiplyByScalar(n3, Math.cos(heading), new Cesium.Cartesian3()),
          Cesium.Cartesian3.multiplyByScalar(e3, Math.sin(heading), new Cesium.Cartesian3()),
          new Cesium.Cartesian3(),
        );
        const rgt = Cesium.Cartesian3.add(
          Cesium.Cartesian3.multiplyByScalar(e3, Math.cos(heading), new Cesium.Cartesian3()),
          Cesium.Cartesian3.multiplyByScalar(n3, -Math.sin(heading), new Cesium.Cartesian3()),
          new Cesium.Cartesian3(),
        );
        const norm = Math.hypot(forward, right) || 1;
        const delta = Cesium.Cartesian3.add(
          Cesium.Cartesian3.multiplyByScalar(fwd, (forward / norm) * speed * dt, new Cesium.Cartesian3()),
          Cesium.Cartesian3.multiplyByScalar(rgt, (right / norm) * speed * dt, new Cesium.Cartesian3()),
          new Cesium.Cartesian3(),
        );
        destination = Cesium.Cartesian3.add(destination, delta, destination);
        // Keep the same height above the ellipsoid; keepCameraAboveGround lifts it over hills.
        const next = ellipsoid.cartesianToCartographic(destination);
        if (next) {
          const height = ellipsoid.cartesianToCartographic(camera.positionWC)?.height ?? carto.height;
          next.height = height;
          destination = ellipsoid.cartographicToCartesian(next);
        }
        camera.setView({ destination, orientation: { heading, pitch, roll: 0 } });
      }
    }
    frame = requestAnimationFrame(tick);
  };

  window.addEventListener("keydown", (e) => {
    shift = e.shiftKey;
    if (!MOVE_KEYS.has(e.code) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (typing(e.target) || document.querySelector("dialog[open]")) return;
    e.preventDefault();
    pressed.add(e.code);
    if (!frame) {
      lastTime = performance.now();
      frame = requestAnimationFrame(tick);
    }
  });
  window.addEventListener("keyup", (e) => {
    shift = e.shiftKey;
    pressed.delete(e.code);
  });
  window.addEventListener("blur", () => pressed.clear());
}
