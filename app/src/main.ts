import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { getLanguage, onLanguageChange, setLanguage, t, translateStaticDom, type Language, type MessageKey } from "./i18n";
import { applyAtmosphere, applyPreset, marsShader, sunDirectionWC } from "./look";
import "./style.css";
import { createMissionPanel, type PlanResponseEvent } from "./mission/panel";
import { createResultsPanel } from "./mission/results";
import { ConfigError, describeStartupError, missingTokenError } from "./ui/errors";
import { hideLoading, showError, showLoading, showToast, updateLoading } from "./ui/status";
import { createSourcesPanel } from "./provenance/panel";
import { installKeyboardMove, installOrbit, installWheelZoom, keepCameraAboveGround } from "./camera";
import { loadHiriseLayer } from "./hirise";
import { createLayersPanel } from "./ui/layers";
import { addPanoramas, PANORAMAS, panoramaForEntity, type PanoramaLayer } from "./panoramas/panoramas";
import { createPanoramaViewer } from "./panoramas/viewer";
import { createCursorReadout } from "./ui/readout";
import { ElevationGrid } from "./terrain/elevationGrid";
import { addParcelOutline } from "./terrain/parcel";
import { addThermalLayer, LEGEND_STYLE } from "./thermal/themis";
import { createEnvironmentLayer } from "./environment/layer";
import { esc } from "./ui/format";
import { createMissionContext, setUpInputModeMenu, setUpSettingsMenu } from "./ui/hud";
import type { PlanResponse } from "./mission/draft";
import { createSceneRoutes } from "./mission/sceneRoutes";
import { createScenePois } from "./mission/scenePois";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const CESIUM_MARS_ASSET_ID = 3644333; // Cesium Mars (3D Tiles) on Cesium ion
const GALE = { lon: 137.374, lat: -4.792 }; // near Curiosity's last position (sol 5073)
const SLOW_LOAD_MS = 20_000; // after this, warn that loading is slow

// Mars as the default body: every lat/lon conversion uses the Martian ellipsoid.
Cesium.Ellipsoid.default = Cesium.Ellipsoid.MARS;

// ---------------------------------------------------------------------------
// Viewer
// ---------------------------------------------------------------------------
let viewer!: Cesium.Viewer;
let sceneRoutes: ReturnType<typeof createSceneRoutes> | null = null;
let activeResponse: PlanResponse | null = null;
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
  const orbit = installOrbit(viewer);
  installWheelZoom(viewer, { orbit, inputMode: setUpInputModeMenu() });
  installKeyboardMove(viewer, orbit);
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

  const parcelOutline = addParcelOutline(viewer, panel.getParcel());
  let parcelIdentity = "";
  panel.onChange(() => {
    const p = panel.getParcel();
    const identity = p ? `${p.id}/${p.version}` : "";
    if (identity !== parcelIdentity) { parcelIdentity = identity; parcelOutline.setParcel(p); }
  });

  // Loose-material warning (THEMIS night IR, qualitative), moved by the parcel's display shift
  // once the service reports it. Off by default.
  const thermal = addThermalLayer(viewer, panel.getParcel()?.geographic_adapter?.horizontal_shift_m);
  panel.onChange(() => thermal.setShift(panel.getParcel()?.geographic_adapter?.horizontal_shift_m));
  // Environment of the chosen sol: REMS report for the departure date (historical, observed).
  const environment = createEnvironmentLayer(viewer);
  panel.onChange((request) => environment.setDeparture(request.mission.departure_utc));

  // Top bar: mission context (center) and the "Layers" panel (left).
  let missionVisible = true;
  const panoViewer = createPanoramaViewer(document.getElementById("panoDialog") as HTMLDialogElement);
  let panoLayer: PanoramaLayer | null = null;
  const layers = createLayersPanel(document.getElementById("layersPanel")!, [
    {
      id: "visual_terrain",
      section: "terrain",
      dataClass: "optica",
      name: "layers.visualTerrain",
      origin: "Cesium Mars · ion",
      sourceId: "visual_terrain",
      status: () => "streaming",
      lockedKey: "layers.locked",
    },
    {
      id: "hirise",
      section: "terrain",
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
      id: "rems",
      section: "observations",
      summary: () => environment.summary(),
      dataClass: "atmosferica",
      name: "layers.rems",
      origin: "MSL · REMS",
      sourceId: "rems",
      status: () => environment.status(),
      visibility: { get: () => environment.isVisible(), set: (on) => environment.setVisible(on) },
      legend: () => environment.legend(),
    },
    {
      id: "themis",
      section: "analysis",
      dataClass: "termica",
      name: "layers.themis",
      origin: "Mars Odyssey · THEMIS",
      sourceId: "themis_nir",
      status: () => "loaded",
      visibility: { get: () => thermal.isVisible(), set: (on) => thermal.setVisible(on) },
      legend: () =>
        `<div class="ly-ramp"><span style="${LEGEND_STYLE}"></span></div>
         <div class="ly-ramp-labels"><span>${esc(t("layers.themis.looser"))}</span><span>${esc(t("layers.themis.firmer"))}</span></div>
         <p class="ly-note">${esc(t("layers.themis.note"))}</p>`,
    },
    {
      id: "parcel",
      section: "terrain",
      pendingKey: "layers.parcel.pending",
      dataClass: "mission",
      name: "layers.parcel",
      origin: "HiRISE · analytical bounds",
      status: () => panel.getParcel()?.geographic_adapter ? "loaded" : "pending",
      visibility: {
        get: () => parcelOutline.isVisible(),
        set: (on) => parcelOutline.setVisible(on),
      },
    },
    {
      id: "panoramas",
      section: "observations",
      pendingKey: "layers.panoramas.pending",
      dataClass: "optica",
      name: "layers.panoramas",
      origin: "MSL · Mastcam · Navcam",
      sourceId: "rover_panoramas",
      action: { label: "layers.panoramas.view", run: () => panoViewer.open(PANORAMAS[0]) },
      status: () => (panoLayer ? "streaming" : "pending"),
      visibility: { get: () => panoLayer?.isVisible() ?? true, set: (on) => panoLayer?.setVisible(on) },
    },
    {
      id: "mission",
      section: "analysis",
      pendingKey: "layers.mission.pending",
      dataClass: "mission",
      name: "layers.mission",
      origin: "RedWays",
      sourceId: "navigation_draft",
      status: () => activeResponse?.geographic_adapter ? "loaded" : "pending",
      visibility: {
        get: () => missionVisible,
        set: (on) => {
          missionVisible = on;
          sceneRoutes?.setVisible(on);
        },
      },
    },
  ]);
  environment.onUpdate(() => layers.refresh());
  // The Layers panel opens and closes from its own header / collapsed pill (no HUD button).
  document.addEventListener("plan-response", () => {
    layers.refresh();
    layers.setOpen(false);
    if (window.matchMedia("(max-width: 900px)").matches) panel.setCollapsed(true);
  });

  await initialTiles;
  loadingKey = null;
  hideLoading();
  sceneRoutes = createSceneRoutes(viewer);
  sceneRoutes.setVisible(missionVisible);
  if (activeResponse) void showSceneResponse(activeResponse);
  Object.assign(window, { missionRoutes: sceneRoutes });
  panel.onChange(() => layers.refresh());

  // Registered points are shown while the mission wizard is on its Mission step.
  const scenePois = createScenePois(viewer);
  let pointsVisible = false;
  const refreshPoints = () => void scenePois.update(pointsVisible, panel.getParcel(), panel.getRequest());
  panel.onPointsPreview((visible) => { pointsVisible = visible; refreshPoints(); });
  panel.onChange(() => { if (pointsVisible) refreshPoints(); });

  // Cursor readout: position, DTM elevation and slope (highlighted above the profile's maximum).
  const readout = createCursorReadout(viewer, await elevationGrid, (lon, lat) =>
    thermal.isVisible() ? thermal.sample(lon, lat) : null,
  );
  panel.onChange(() => readout.setSlopeLimit(panel.getSlopeLimit()));

  panoLayer = addPanoramas(viewer); // points appear on their own; does not delay the mission points
  layers.refresh();

  viewer.screenSpaceEventHandler.setInputAction((click: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
    const entity = pickEntity(click.position);
    if (!entity) return;
    const pano = panoramaForEntity(entity.id);
    if (pano) panoViewer.open(pano);
    else if (entity.id.startsWith("route:")) sources.open("navigation_draft");
    else if (entity.id.startsWith("rems:")) sources.open("rems");
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  showPointerOverClickables((id) => panoLayer?.setHover(id.startsWith("pano:") ? id : null));

  setUpSettingsMenu((preset) => applyPreset(viewer, tilesets, preset, sun));
  document.getElementById("resetView")!.onclick = resetView;
  (document.getElementById("resetView") as HTMLButtonElement).disabled = false;
  (document.getElementById("settingsBtn") as HTMLButtonElement).disabled = false;
}

/** Entity under a screen position, with a few pixels of tolerance so small points are easy to hit. */
function pickEntity(position: Cesium.Cartesian2): Cesium.Entity | undefined {
  const picked = viewer.scene.pick(position, 9, 9);
  const entity = Cesium.defined(picked) ? picked.id : undefined;
  return entity instanceof Cesium.Entity ? entity : undefined;
}

/**
 * Hand cursor over what a click acts on (panoramas, routes, REMS marker), and `onHover` with the
 * entity id under the pointer ("" for none). Picks once per frame at most.
 */
function showPointerOverClickables(onHover: (entityId: string) => void) {
  const canvas = viewer.scene.canvas;
  const handler = new Cesium.ScreenSpaceEventHandler(canvas);
  let pending: Cesium.Cartesian2 | null = null;
  handler.setInputAction((move: Cesium.ScreenSpaceEventHandler.MotionEvent) => {
    if (!pending) {
      requestAnimationFrame(() => {
        const id = pending ? pickEntity(pending)?.id ?? "" : "";
        canvas.style.cursor = /^(pano:|route:|rems:)/.test(id) ? "pointer" : "";
        onHover(id);
        pending = null;
      });
    }
    pending = Cesium.Cartesian2.clone(move.endPosition);
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
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
for (const id of ["resetView", "settingsBtn"]) {
  (document.getElementById(id) as HTMLButtonElement).disabled = true;
}
// Planning works independently of ion/terrain availability.
const sources = createSourcesPanel(document.getElementById("sourcesDialog") as HTMLDialogElement);
document.getElementById("openSources")!.onclick = () => sources.open();
const panel = createMissionPanel(document.getElementById("missionPanel")!);
const results = createResultsPanel(document.getElementById("resultsPanel")!);
const context = createMissionContext(document.getElementById("hudContext")!);
panel.onChange((request) => context.update(request));
panel.onStale(() => { activeResponse = null; results.clear(); sceneRoutes?.clear(); });
async function showSceneResponse(response: PlanResponse) {
  try { await sceneRoutes?.show(response, panel.getParcel()); }
  catch (error) { console.error(error); showToast(t("nav.sceneMismatch")); }
}
document.addEventListener("plan-response", (event) => {
  activeResponse = (event as CustomEvent<PlanResponseEvent>).detail.response;
  results.show(activeResponse);
  void showSceneResponse(activeResponse);
});
document.addEventListener("focus-calculated-route", () => { void sceneRoutes?.focus(); });
main().catch((err) => {
  console.error(err);
  loadingKey = null;
  showError(describeStartupError(err, CESIUM_MARS_ASSET_ID));
  // The error screen is re-written in the new language too.
  onLanguageChange(() => showError(describeStartupError(err, CESIUM_MARS_ASSET_ID)));
});
