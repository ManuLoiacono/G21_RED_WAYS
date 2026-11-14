import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { applyAtmosphere, applyPreset, marsShader, sunDirectionWC, type Preset } from "./look";
import fixtureRoute from "./fixture_route.json";
import poiFixture from "./fixtures/poi.fixture.json";
import "./style.css";
import { createMissionPanel, type PlanResponseEvent } from "./mission/panel";
import { createResultsPanel } from "./mission/results";
import { RouteLayer } from "./mission/routes";
import { parsePois } from "./mission/pois";
import type { Poi } from "./mission/types";

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------
const CESIUM_MARS_ASSET_ID = 3644333; // Cesium Mars (3D Tiles), en Cesium ion
const GALE = { lon: 137.374, lat: -4.792 }; // cerca de la última posición de Curiosity (sol 5073)
const PARCEL_ID = "gale_demo_v1"; // fixture del contrato; cambiar cuando P3-02 publique la parcela real

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
  const fixtureRouteEntity = viewer.entities.add({
    name: "Ruta de prueba (fixture)",
    polyline: {
      positions,
      width: 6,
      clampToGround: true,
      material: new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.25, color: Cesium.Color.fromCssColorString("#3ff0ff") }),
    },
  });

  // Base y destinos (FIXTURE hasta P3-05) + panel de preparación de misión (P1-02)
  const pois = parsePois(poiFixture);
  const panel = createMissionPanel(document.getElementById("missionPanel")!, pois, PARCEL_ID);
  // Resultados y comparación (P1-03): tarjetas + rutas en el mapa, sincronizadas por selección.
  const results = createResultsPanel(document.getElementById("resultsPanel")!);
  const routes = new RouteLayer(viewer);
  results.onSelect((altId) => routes.select(altId));
  document.addEventListener("plan-response", (e) => {
    const { response, simulated } = (e as CustomEvent<PlanResponseEvent>).detail;
    fixtureRouteEntity.show = false; // la ruta de prueba inicial ya no aporta
    routes.show(response);
    results.show(response, simulated);
    // En pantallas angostas (tablet vertical) el formulario se pliega para dejar ver mapa y resultados.
    if (window.matchMedia("(max-width: 900px)").matches) panel.setCollapsed(true);
  });

  const poiEntities = await addPois(pois);
  panel.onDestinationChange((id) => {
    highlightDestination(poiEntities, id);
    // Cambiar de destino invalida el resultado anterior.
    routes.clear();
    results.clear();
  });

  viewer.screenSpaceEventHandler.setInputAction((click: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
    const picked = viewer.scene.pick(click.position);
    const entity = Cesium.defined(picked) ? picked.id : undefined;
    if (entity instanceof Cesium.Entity && entity.id.startsWith("poi:")) {
      panel.selectDestination(entity.id.slice(4));
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

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

// ---------------------------------------------------------------------------
// Puntos de interés
// ---------------------------------------------------------------------------
const POI_COLOR = { base: "#ffd166", destino: "#e8e8ee", selected: "#3ff0ff" };

/**
 * Dibuja base y destinos. Con el globo oculto, `HeightReference.CLAMP_TO_GROUND` no apoya puntos
 * ni etiquetas sobre el tileset (las polilíneas sí), así que se muestrea la altura de Cesium en
 * cada punto. Esa altura es SOLO para dibujar: no se mezcla con las del DTM (desfase ~71 m).
 */
async function addPois(pois: Poi[]): Promise<Map<string, Cesium.Entity>> {
  const cartos = pois.map((p) => Cesium.Cartographic.fromDegrees(p.lonlat[0], p.lonlat[1]));
  const sampled = await viewer.scene.sampleHeightMostDetailed(cartos);
  const entities = new Map<string, Cesium.Entity>();
  pois.forEach((p, i) => {
    const c = sampled[i] ?? cartos[i];
    const entity = viewer.entities.add({
      id: `poi:${p.id}`,
      name: p.title,
      position: Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, c.height ?? 0, Cesium.Ellipsoid.MARS),
      point: {
        pixelSize: p.role === "base" ? 13 : 11,
        color: Cesium.Color.fromCssColorString(POI_COLOR[p.role]),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: p.title,
        font: "13px system-ui, sans-serif",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -20),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
    entities.set(p.id, entity);
  });
  return entities;
}

function highlightDestination(entities: Map<string, Cesium.Entity>, selectedId: string) {
  for (const [id, entity] of entities) {
    if (id === "poi_base" || !entity.point) continue;
    const selected = id === selectedId;
    entity.point.color = new Cesium.ConstantProperty(
      Cesium.Color.fromCssColorString(selected ? POI_COLOR.selected : POI_COLOR.destino),
    );
    entity.point.pixelSize = new Cesium.ConstantProperty(selected ? 15 : 11);
  }
}

main().catch((err) => {
  console.error(err);
  alert("No se pudo cargar Cesium Mars: " + err.message);
});
