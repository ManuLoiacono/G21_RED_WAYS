import * as Cesium from "cesium";

/**
 * Zoom con la rueda del mouse para terreno por debajo del elipsoide (P1-01).
 *
 * En Gale el terreno está ~3,4–4,4 km POR DEBAJO del elipsoide de Marte. El zoom de Cesium usa
 * la «altura sobre el elipsoide» como medida de distancia cuando no encuentra superficie bajo el
 * centro de la pantalla: esa altura es negativa, el zoom se invierte y la cámara termina debajo
 * del terreno o subiendo hacia 0 m. Este zoom se acerca o se aleja respecto del punto bajo el
 * cursor y respeta un margen mínimo sobre el suelo.
 *
 * El zoom por pellizco (tablet) sigue siendo el de Cesium; `keepCameraAboveGround` corrige la
 * cámara si cualquier gesto la deja debajo del terreno. (`enableCollision` del tileset haría lo
 * mismo, pero con Cesium Mars traba la carga de teselas.)
 */
export interface WheelZoomOptions {
  /** Fracción de la distancia al punto apuntado que avanza cada paso de rueda. */
  stepFraction?: number;
  /** Altura mínima de la cámara sobre el terreno, en metros. */
  minClearance_m?: number;
  /** Altura máxima de la cámara sobre el terreno, en metros. */
  maxClearance_m?: number;
}

export function installWheelZoom(viewer: Cesium.Viewer, opts: WheelZoomOptions = {}) {
  const stepFraction = opts.stepFraction ?? 0.2;
  const minClearance = opts.minClearance_m ?? 30;
  const maxClearance = opts.maxClearance_m ?? 40_000;
  const { scene, camera, canvas } = viewer;
  const ellipsoid = scene.ellipsoid;

  // Cesium deja de manejar la rueda (y el arrastre con botón derecho, que usa el mismo zoom).
  scene.screenSpaceCameraController.zoomEventTypes = [Cesium.CameraEventType.PINCH];

  const scratchDir = new Cesium.Cartesian3();
  const scratchPos = new Cesium.Cartesian3();

  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      if (e.deltaY === 0) return;
      const zoomIn = e.deltaY < 0;
      // Varios pasos de rueda juntos (o trackpad) avanzan proporcionalmente, con tope.
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
        // Sin superficie bajo el cursor (cielo): avanza en la dirección de la vista según la altura al suelo.
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
 * Si un gesto (arrastre, inclinación, pellizco) deja la cámara debajo del terreno o a menos de
 * `minClearance_m` del suelo, la sube. Se evalúa cuando la cámara cambia, no en cada cuadro.
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
