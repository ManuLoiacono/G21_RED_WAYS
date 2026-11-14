import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { applyAtmosphere, applyPreset, marsShader, sunDirectionWC, type Preset } from "./look";
import fixtureRoute from "./fixture_route.json";

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------
const CESIUM_MARS_ASSET_ID = 3644333; // Cesium Mars (3D Tiles), en Cesium ion
const GALE = { lon: 137.374, lat: -4.792 }; // cerca de la última posición de Curiosity (sol 5073)

const token = import.meta.env.VITE_CESIUM_ION_TOKEN as string | undefined;
if (!token) {
  throw new Error("Falta VITE_CESIUM_ION_TOKEN. Copiá .env.example a .env y pegá tu token de Cesium ion.");
}
Cesium.Ion.defaultAccessToken = token;

// Marte como cuerpo por defecto: todas las conversiones lat/lon usan el elipsoide marciano.
Cesium.Ellipsoid.default = Cesium.Ellipsoid.MARS;

// ---------------------------------------------------------------------------
// Visor
// ---------------------------------------------------------------------------
const viewer = new Cesium.Viewer("cesiumContainer", {
  baseLayer: false,
  baseLayerPicker: false,
  geocoder: false,
  timeline: false,
  animation: false,
  homeButton: false,
  sceneModePicker: false,
  navigationHelpButton: false,
  fullscreenButton: false,
  infoBox: false,
  selectionIndicator: false,
  globe: new Cesium.Globe(Cesium.Ellipsoid.MARS),
  skyBox: false,
  skyAtmosphere: new Cesium.SkyAtmosphere(Cesium.Ellipsoid.MARS),
});
// El terreno lo pone el tileset 3D; el globo vacío se oculta.
viewer.scene.globe.show = false;

function resetView() {
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(GALE.lon, GALE.lat, -2700, Cesium.Ellipsoid.MARS),
    orientation: { heading: Cesium.Math.toRadians(160), pitch: Cesium.Math.toRadians(-9), roll: 0 },
  });
}

async function main() {
  const tileset = await Cesium.Cesium3DTileset.fromIonAssetId(CESIUM_MARS_ASSET_ID);
  viewer.scene.primitives.add(tileset);

  // Aspecto: sol bajo desde el oeste (azimut 280°, elevación 8°). Es un valor estético,
  // no una posición solar calculada: la ventana solar real va por REMS/Horizons.
  const sun = sunDirectionWC(GALE.lon, GALE.lat, 280, 8);
  tileset.customShader = marsShader(sun);
  applyAtmosphere(viewer.scene);
  applyPreset(viewer, tileset, "equilibrado", sun);

  resetView();

  // Ruta de prueba (FIXTURE, no es cálculo del motor): apoyada sobre el terreno.
  const positions = (fixtureRoute.coordinates as [number, number][]).map(([lon, lat]) =>
    Cesium.Cartesian3.fromDegrees(lon, lat, 0, Cesium.Ellipsoid.MARS),
  );
  viewer.entities.add({
    name: "Ruta de prueba (fixture)",
    polyline: {
      positions,
      width: 6,
      clampToGround: true,
      material: new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.25, color: Cesium.Color.fromCssColorString("#3ff0ff") }),
    },
  });

  // Controles mínimos
  document.querySelectorAll<HTMLButtonElement>("#hud button[data-preset]").forEach((btn) => {
    btn.onclick = () => {
      applyPreset(viewer, tileset, btn.dataset.preset as Preset, sun);
      document.querySelectorAll("#hud button[data-preset]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    };
  });
  document.getElementById("resetView")!.onclick = resetView;

  // Para depurar desde la consola del navegador
  Object.assign(window, { viewer, tileset, Cesium });
}

main().catch((err) => {
  console.error(err);
  alert("No se pudo cargar Cesium Mars: " + err.message);
});
