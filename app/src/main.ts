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
import { installWheelZoom, keepCameraAboveGround } from "./camera";
import { loadHiriseLayer } from "./hirise";
import { createLayersPanel } from "./ui/layers";
import { addPanoramas, PANORAMAS, panoramaForEntity, type PanoramaLayer } from "./panoramas/panoramas";
import { createPanoramaViewer } from "./panoramas/viewer";
import { createCursorReadout } from "./ui/readout";
import { ElevationGrid } from "./terrain/elevationGrid";
import { addParcelOutline } from "./terrain/parcel";
import { createMissionContext, setUpSettingsMenu } from "./ui/hud";

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

  // Parcel outline in red, moved like the HiRISE mesh (same shift as its metadata, if built).
  const parcelOutline = addParcelOutline(viewer, hirise?.metadata.horizontal_shift_m);

  // Top bar: mission context (center) and the "Layers" panel (left).
  let missionVisible = true;
  const panoViewer = createPanoramaViewer(document.getElementById("panoDialog") as HTMLDialogElement);
  let panoLayer: PanoramaLayer | null = null;
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
      id: "panoramas",
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
      dataClass: "mission",
      name: "layers.mission",
      origin: "Marswalk",
      sourceId: "navigation_draft",
      status: () => "pending",
      visibility: {
        get: () => missionVisible,
        set: (on) => {
          missionVisible = on;
          viewer.entities.show = on;
        },
      },
    },
  ]);
  const layersBtn = document.getElementById("toggleLayers") as HTMLButtonElement;
  layersBtn.onclick = () => layers.setOpen(!layers.isOpen());
  layersBtn.disabled = false;
  layers.onToggle((open) => {
    layersBtn.setAttribute("aria-expanded", String(open));
    layersBtn.classList.toggle("active", open);
  });
  document.addEventListener("plan-response", () => {
    layers.setOpen(false);
    if (window.matchMedia("(max-width: 900px)").matches) panel.setCollapsed(true);
  });

  await initialTiles;
  loadingKey = null;
  hideLoading();

  // Cursor readout: position, DTM elevation and slope (highlighted above the profile's maximum).
  const readout = createCursorReadout(viewer, await elevationGrid);
  panel.onChange((state) => readout.setSlopeLimit(panel.getSlopeLimit()));

  panoLayer = addPanoramas(viewer); // points appear on their own; does not delay the mission points
  layers.refresh();

  viewer.screenSpaceEventHandler.setInputAction((click: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
    const entity = pickEntity(click.position);
    if (!entity) return;
    const pano = panoramaForEntity(entity.id);
    if (pano) panoViewer.open(pano);
    else if (entity.id.startsWith("route:")) sources.open("navigation_draft");
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  showPointerOverClickables();

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

/** Hand cursor over what a click acts on (points of interest, panoramas, routes). Picks once per frame at most. */
function showPointerOverClickables() {
  const canvas = viewer.scene.canvas;
  const handler = new Cesium.ScreenSpaceEventHandler(canvas);
  let pending: Cesium.Cartesian2 | null = null;
  handler.setInputAction((move: Cesium.ScreenSpaceEventHandler.MotionEvent) => {
    if (!pending) {
      requestAnimationFrame(() => {
        const id = pending ? pickEntity(pending)?.id ?? "" : "";
        canvas.style.cursor = /^(pano:|route:)/.test(id) ? "pointer" : "";
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
for (const id of ["toggleLayers", "resetView", "settingsBtn"]) {
  (document.getElementById(id) as HTMLButtonElement).disabled = true;
}
// Planning works independently of ion/terrain availability.
const sources = createSourcesPanel(document.getElementById("sourcesDialog") as HTMLDialogElement);
document.getElementById("openSources")!.onclick = () => sources.open();
const panel = createMissionPanel(document.getElementById("missionPanel")!);
const results = createResultsPanel(document.getElementById("resultsPanel")!);
const context = createMissionContext(document.getElementById("hudContext")!);
panel.onChange((request) => context.update(request));
panel.onStale(() => results.clear());
document.addEventListener("plan-response", (event) => results.show((event as CustomEvent<PlanResponseEvent>).detail.response));
main().catch((err) => {
  console.error(err);
  loadingKey = null;
  showError(describeStartupError(err, CESIUM_MARS_ASSET_ID));
  // The error screen is re-written in the new language too.
  onLanguageChange(() => showError(describeStartupError(err, CESIUM_MARS_ASSET_ID)));
});
