import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { getLanguage, onLanguageChange, setLanguage, t, translateStaticDom, type Language, type MessageKey } from "./i18n";
import { applyAtmosphere, applyPreset, marsShader, sunDirectionWC } from "./look";
import fixtureRoute from "./fixture_route.json";
import poiFixture from "./fixtures/poi.fixture.json";
import "./style.css";
import { createMissionPanel, type PlanResponseEvent } from "./mission/panel";
import { createResultsPanel } from "./mission/results";
import { RouteLayer } from "./mission/routes";
import { parsePois, poiTitle } from "./mission/pois";
import { simulatedResponse } from "./fixtures/plan_responses.fixture";
import type { PlanResponse } from "./mission/response";
import type { Poi } from "./mission/types";
import { ConfigError, describeStartupError, missingTokenError } from "./ui/errors";
import { hideLoading, showError, showLoading, showToast, updateLoading } from "./ui/status";
import { createSourcesPanel } from "./provenance/panel";
import { installWheelZoom, keepCameraAboveGround } from "./camera";
import { loadHiriseLayer } from "./hirise";
import { createLayersPanel } from "./ui/layers";
import { createCursorReadout } from "./ui/readout";
import { ElevationGrid } from "./terrain/elevationGrid";
import { addParcelOutline } from "./terrain/parcel";
import { createMissionContext, setUpSettingsMenu } from "./ui/hud";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const CESIUM_MARS_ASSET_ID = 3644333; // Cesium Mars (3D Tiles) on Cesium ion
const GALE = { lon: 137.374, lat: -4.792 }; // near Curiosity's last position (sol 5073)
const PARCEL_ID = "gale_demo_v1"; // contract fixture; change when P3-02 publishes the real parcel
const SLOW_LOAD_MS = 20_000; // after this, warn that loading is slow

// Mars as the default body: every lat/lon conversion uses the Martian ellipsoid.
Cesium.Ellipsoid.default = Cesium.Ellipsoid.MARS;

// ---------------------------------------------------------------------------
// Viewer
// ---------------------------------------------------------------------------
let viewer!: Cesium.Viewer;
/** Loading message on screen (re-translated on a language switch); null once loaded. */
let loadingKey: MessageKey | null = null;

function createViewer(): Cesium.Viewer {
  const v = new Cesium.Viewer("cesiumContainer", {
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
  // The terrain comes from the 3D tileset; the empty globe is hidden.
  v.scene.globe.show = false;
  return v;
}

function resetView() {
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(GALE.lon, GALE.lat, -2700, Cesium.Ellipsoid.MARS),
    orientation: { heading: Cesium.Math.toRadians(160), pitch: Cesium.Math.toRadians(-9), roll: 0 },
  });
}

/** Waits for the first tiles to load; warns if it is slow or if tiles fail. */
function waitForInitialTiles(tileset: Cesium.Cesium3DTileset): Promise<void> {
  let failed = 0;
  tileset.tileFailed.addEventListener(() => {
    failed += 1;
    if (failed === 5) showToast(t("load.tilesFailed"));
  });
  return new Promise((resolve) => {
    const slow = window.setTimeout(() => {
      loadingKey = "load.slow";
      updateLoading(t(loadingKey));
    }, SLOW_LOAD_MS);
    const done = () => {
      window.clearTimeout(slow);
      resolve();
    };
    // initialTilesLoaded is the expected event; allTilesLoaded is a fallback in case it does not fire.
    tileset.initialTilesLoaded.addEventListener(done);
    tileset.allTilesLoaded.addEventListener(done);
  });
}

/**
 * Static HUD text and the ES | EN switch, which highlights the language on screen.
 * Switching translates in place (no reload); each panel re-renders its own text.
 * Works even if the scene fails to start.
 */
function setUpLanguage() {
  const buttons = document.querySelectorAll<HTMLButtonElement>("#languageSwitch button[data-lang]");
  const markActive = () =>
    buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === getLanguage())));
  buttons.forEach((b) => (b.onclick = () => setLanguage(b.dataset.lang as Language)));
  translateStaticDom();
  markActive();
  onLanguageChange(() => {
    markActive();
    if (loadingKey) updateLoading(t(loadingKey));
  });
}

async function main() {
  loadingKey = "load.terrain";
  showLoading(t(loadingKey));

  const token = import.meta.env.VITE_CESIUM_ION_TOKEN?.trim();
  if (!token) throw new ConfigError(missingTokenError);
  Cesium.Ion.defaultAccessToken = token;

  viewer = createViewer();
  // Do not use { enableCollision: true }: with this tileset it stalls tile loading (measured).
  // The camera stays above the terrain with installWheelZoom + keepCameraAboveGround.
  const tileset = await Cesium.Cesium3DTileset.fromIonAssetId(CESIUM_MARS_ASSET_ID);
  viewer.scene.primitives.add(tileset);
  installWheelZoom(viewer);
  keepCameraAboveGround(viewer);
  // For debugging from the browser console (available even if loading never finishes).
  Object.assign(window, { viewer, tileset, Cesium });
  const initialTiles = waitForInitialTiles(tileset);
  // DTM grid for the cursor readout (optional, built with the HiRISE mesh); loads in parallel.
  const elevationGrid = ElevationGrid.load();

  // Look: low sun from the west (azimuth 280°, elevation 8°). It is an aesthetic value,
  // not a computed solar position: the real daylight window comes from REMS/Horizons.
  const sun = sunDirectionWC(GALE.lon, GALE.lat, 280, 8);
  tileset.customShader = marsShader(sun);
  applyAtmosphere(viewer.scene);

  // 1 m HiRISE mesh inside the parcel (if it has been built; see app/src/hirise.ts).
  const hirise = await loadHiriseLayer(viewer, tileset).catch((err) => {
    console.warn("Could not load the HiRISE mesh; continuing with Cesium Mars.", err);
    return undefined;
  });
  if (hirise) hirise.tileset.customShader = marsShader(sun);
  const tilesets = hirise ? [tileset, hirise.tileset] : [tileset];
  Object.assign(window, { hirise });
  applyPreset(viewer, tilesets, "balanced", sun);

  resetView();

  // Test route (FIXTURE, not an engine result): draped on the terrain.
  const positions = (fixtureRoute.coordinates as [number, number][]).map(([lon, lat]) =>
    Cesium.Cartesian3.fromDegrees(lon, lat, 0, Cesium.Ellipsoid.MARS),
  );
  const fixtureRouteEntity = viewer.entities.add({
    id: "test_route",
    name: "Test route (fixture)",
    polyline: {
      positions,
      width: 6,
      clampToGround: true,
      material: new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.25, color: Cesium.Color.fromCssColorString("#3ff0ff") }),
    },
  });

  // On-demand provenance (P1-05): "Sources" panel + ⓘ buttons (data-source).
  const sources = createSourcesPanel(document.getElementById("sourcesDialog") as HTMLDialogElement);
  document.getElementById("openSources")!.onclick = () => sources.open();

  // Base and destinations (FIXTURE until P3-05) + mission planning panel (P1-02)
  const pois = parsePois(poiFixture);
  const panel = createMissionPanel(document.getElementById("missionPanel")!, pois, PARCEL_ID);
  // Results and comparison (P1-03): cards + routes on the map, kept in sync by selection.
  const results = createResultsPanel(document.getElementById("resultsPanel")!);
  const routes = new RouteLayer(viewer);
  results.onSelect((altId) => routes.select(altId));

  // Parcel outline in red, moved like the HiRISE mesh (same shift as its metadata, if built).
  const parcelOutline = addParcelOutline(viewer, hirise?.metadata.horizontal_shift_m);

  // Top bar: mission context (center) and the "Layers" panel (left).
  const context = createMissionContext(document.getElementById("hudContext")!, pois);
  panel.onChange((state) => context.update(state));
  let missionVisible = true;
  const layers = createLayersPanel(document.getElementById("layersPanel")!, [
    {
      id: "hirise",
      dataClass: "topografica",
      name: "layers.hirise",
      origin: "MRO · HiRISE",
      sourceId: "hirise_mesh",
      status: () => (hirise ? "loaded" : "missing"),
      visibility: hirise && {
        get: () => hirise.tileset.show,
        set: (on) => hirise.setVisible(on),
      },
    },
    {
      id: "visual_terrain",
      dataClass: "optica",
      name: "layers.visualTerrain",
      origin: "Cesium Mars · ion",
      sourceId: "visual_terrain",
      status: () => "streaming",
      lockedKey: "layers.locked",
    },
    {
      id: "rems",
      dataClass: "atmosferica",
      name: "layers.rems",
      origin: "MSL · REMS",
      sourceId: "rems",
      status: () => "pending",
    },
    {
      id: "themis",
      dataClass: "termica",
      name: "layers.themis",
      origin: "Mars Odyssey · THEMIS",
      status: () => "pending",
    },
    {
      id: "parcel",
      dataClass: "mission",
      name: "layers.parcel",
      origin: "gale_demo_v1",
      status: () => "fixture",
      visibility: {
        get: () => parcelOutline.isVisible(),
        set: (on) => parcelOutline.setVisible(on),
      },
    },
    {
      id: "mission",
      dataClass: "mission",
      name: "layers.mission",
      origin: "Marswalk",
      sourceId: "fixture_pois",
      status: () => "fixture",
      visibility: {
        get: () => missionVisible,
        set: (on) => {
          missionVisible = on;
          viewer.entities.show = on;
          routes.setVisible(on);
        },
      },
    },
  ]);
  const layersBtn = document.getElementById("toggleLayers") as HTMLButtonElement;
  layersBtn.onclick = () => layers.setOpen(!layers.isOpen());
  layers.onToggle((open) => {
    layersBtn.setAttribute("aria-expanded", String(open));
    layersBtn.classList.toggle("active", open);
  });
  let lastResponseSimulated = false;
  let lastResponse: PlanResponse | null = null;
  document.addEventListener("plan-response", (e) => {
    const { response, simulated } = (e as CustomEvent<PlanResponseEvent>).detail;
    lastResponseSimulated = simulated || response.fixture === true;
    lastResponse = response;
    fixtureRouteEntity.show = false; // the initial test route no longer adds anything
    layers.setOpen(false); // make room for the results in the left column
    routes.show(response);
    results.show(response, simulated);
    // On narrow screens (portrait tablet) the form collapses so the map and results are visible.
    if (window.matchMedia("(max-width: 900px)").matches) panel.setCollapsed(true);
  });

  // A simulated response is our own fixture: rebuild it in the new language. Engine responses
  // are shown as they came (their texts are the engine's).
  onLanguageChange(() => {
    const dest = lastResponse?.request_echo?.destination_poi;
    if (!lastResponseSimulated || !lastResponse || !dest) return;
    const fresh = simulatedResponse(dest);
    if (fresh) results.replace({ ...fresh, request_echo: lastResponse.request_echo });
  });

  await initialTiles;
  loadingKey = null;
  hideLoading();

  // Cursor readout: position, DTM elevation and slope (highlighted above the profile's maximum).
  const readout = createCursorReadout(viewer, await elevationGrid);
  panel.onChange((state) => readout.setSlopeLimit(state.profile.max_slope_deg));

  const poiEntities = await addPois(pois);
  onLanguageChange(() => {
    for (const p of pois) {
      const entity = poiEntities.get(p.id);
      if (!entity) continue;
      entity.name = poiTitle(p);
      if (entity.label) entity.label.text = new Cesium.ConstantProperty(poiTitle(p));
    }
  });
  panel.onDestinationChange((id) => {
    highlightDestination(poiEntities, id);
    // Changing the destination invalidates the previous result.
    routes.clear();
    results.clear();
  });

  viewer.screenSpaceEventHandler.setInputAction((click: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
    const picked = viewer.scene.pick(click.position);
    const entity = Cesium.defined(picked) ? picked.id : undefined;
    if (!(entity instanceof Cesium.Entity)) return;
    if (entity.id.startsWith("poi:")) panel.selectDestination(entity.id.slice(4));
    // Click on a route: opens its source (on-demand provenance, P1-05).
    else if (entity.id === "test_route") sources.open("test_route");
    else if (entity.id.startsWith("route:")) sources.open(lastResponseSimulated ? "simulated_response" : "hirise_dtm");
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  setUpSettingsMenu((preset) => applyPreset(viewer, tilesets, preset, sun));
  document.getElementById("resetView")!.onclick = resetView;
}

// ---------------------------------------------------------------------------
// Points of interest
// ---------------------------------------------------------------------------
/** Colors by contract role ("destino" = destination). */
const POI_COLOR = { base: "#ffd166", destino: "#e8e8ee", selected: "#3ff0ff" };

/**
 * Draws the base and destinations. With the globe hidden, `HeightReference.CLAMP_TO_GROUND` does
 * not drape points or labels on the tileset (polylines do), so the Cesium height is sampled at
 * each point. That height is ONLY for drawing: it is never mixed with DTM heights (~71 m offset).
 */
async function addPois(pois: Poi[]): Promise<Map<string, Cesium.Entity>> {
  const cartos = pois.map((p) => Cesium.Cartographic.fromDegrees(p.lonlat[0], p.lonlat[1]));
  const sampled = await viewer.scene.sampleHeightMostDetailed(cartos);
  const entities = new Map<string, Cesium.Entity>();
  pois.forEach((p, i) => {
    const c = sampled[i] ?? cartos[i];
    const entity = viewer.entities.add({
      id: `poi:${p.id}`,
      name: poiTitle(p),
      position: Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, c.height ?? 0, Cesium.Ellipsoid.MARS),
      point: {
        pixelSize: p.role === "base" ? 13 : 11,
        color: Cesium.Color.fromCssColorString(POI_COLOR[p.role]),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: poiTitle(p),
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

/**
 * Keeps --hud-bottom (bottom edge of the top bar) and --layers-bottom (bottom edge of the left
 * column's "Layers" panel, or the bar if it is closed) in sync, so panels stack at any width.
 */
function trackHudHeight() {
  const hud = document.getElementById("hud")!;
  const layers = document.getElementById("layersPanel")!;
  const root = document.documentElement.style;
  const update = () => {
    const hudBottom = Math.ceil(hud.getBoundingClientRect().bottom) + 8;
    const layersBottom = layers.hidden ? hudBottom : Math.ceil(layers.getBoundingClientRect().bottom) + 8;
    root.setProperty("--hud-bottom", `${hudBottom}px`);
    root.setProperty("--layers-bottom", `${Math.max(hudBottom, layersBottom)}px`);
  };
  const observer = new ResizeObserver(update);
  observer.observe(hud);
  observer.observe(layers);
  update();
}

setUpLanguage();
trackHudHeight();
main().catch((err) => {
  console.error(err);
  loadingKey = null;
  showError(describeStartupError(err, CESIUM_MARS_ASSET_ID));
  // The error screen is re-written in the new language too.
  onLanguageChange(() => showError(describeStartupError(err, CESIUM_MARS_ASSET_ID)));
});
