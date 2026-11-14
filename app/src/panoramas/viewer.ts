import { onLanguageChange, t } from "../i18n";
import { esc } from "../ui/format";
import { panoTitle, type Panorama } from "./panoramas";

/**
 * Viewer for a rover 360° panorama (a flat cylindrical mosaic, as NASA publishes it).
 *
 * - Drag (mouse or finger) to look around; the image wraps, since it covers 360°.
 * - Wheel, pinch or the +/− buttons zoom around the pointer; when zoomed, dragging also pans
 *   vertically.
 * - Black areas are parts the rover did not photograph. On load the viewer finds the horizontal
 *   band that is fully covered and shows only that; a button shows the whole mosaic. Nothing is
 *   filled in or invented.
 * - Compass: only when NASA gives the azimuth at the center of the image (Navcam pages). It
 *   assumes azimuth grows to the right, as in JPL cylindrical mosaics.
 * - The overview strip shows the whole panorama and the part on screen; clicking it jumps there.
 * - Keyboard: ←/→/↑/↓ pan, + / − zoom, 0 resets, F toggles full screen, Esc closes.
 */

const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
const ZOOM_STEP = 1.5;
/** Copies of the image side by side, so the wrap never shows a gap. */
const COPIES = 3;
/** A row counts as photographed when at least this share of its pixels is not black. */
const ROW_COVERED = 0.995;
/** The covered band is used only if it keeps at least this share of the image height. */
const MIN_BAND = 0.15;
/** Maximum height of the overview strip, in CSS pixels. */
const OVERVIEW_MAX_H = 90;

export interface PanoramaViewer {
  open(p: Panorama): void;
}

interface ImageAnalysis {
  /** Fully photographed band (fractions of the height), or null if there is nothing to crop. */
  band: [number, number] | null;
  /** Display stretch [low, high] in 0–1 when the image is dim, or null. */
  stretch: [number, number] | null;
}

/** A pixel this dark in every channel counts as "not photographed" (mosaics fill gaps with 0). */
const BLACK = 5;

/**
 * Reads the pixels once (downscaled) to find:
 * - the longest run of rows that are (almost) fully photographed;
 * - the 1st and 99th percentile of brightness of the photographed pixels, to stretch dim images
 *   (Navcam mosaics are published with a low stretch). The stretch is a display filter only.
 * Returns nulls if pixels cannot be read (CORS).
 */
function analyzeImage(img: HTMLImageElement): ImageAnalysis {
  try {
    const w = 1024;
    const h = Math.max(1, Math.round((w * img.naturalHeight) / img.naturalWidth));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext("2d", { willReadFrequently: true });
    if (!g) return { band: null, stretch: null };
    g.drawImage(img, 0, 0, w, h);
    const px = g.getImageData(0, 0, w, h).data;
    const hist = new Array<number>(256).fill(0);
    let photographed = 0;
    let best: [number, number] = [0, 0];
    let start = -1;
    for (let y = 0; y <= h; y++) {
      let covered = false;
      if (y < h) {
        let n = 0;
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          if (px[i] > BLACK || px[i + 1] > BLACK || px[i + 2] > BLACK) {
            n++;
            hist[Math.round(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2])]++;
          }
        }
        photographed += n;
        covered = n / w >= ROW_COVERED;
      }
      if (covered && start < 0) start = y;
      if (!covered && start >= 0) {
        if (y - start > best[1] - best[0]) best = [start, y];
        start = -1;
      }
    }
    const [b0, b1] = [best[0] / h, best[1] / h];
    const band: [number, number] | null = b1 - b0 < MIN_BAND || b1 - b0 > 0.97 ? null : [b0, b1];

    const percentile = (q: number) => {
      let acc = 0;
      for (let v = 0; v < 256; v++) {
        acc += hist[v];
        if (acc >= q * photographed) return v / 255;
      }
      return 1;
    };
    const lo = percentile(0.01);
    const hi = percentile(0.99);
    const stretch: [number, number] | null = photographed > 0 && hi - lo > 0.05 && hi - lo < 0.8 ? [lo, hi] : null;
    return { band, stretch };
  } catch {
    return { band: null, stretch: null }; // pixels not readable (CORS): show the mosaic as it is
  }
}

/**
 * CSS filter mapping brightness [lo, hi] to [0, 1]: brightness(1/(hi+lo)) then
 * contrast((hi+lo)/(hi-lo)) is exactly (x − lo)/(hi − lo), with no clipping in between.
 */
const stretchFilter = ([lo, hi]: [number, number]) =>
  `brightness(${(1 / (hi + lo)).toFixed(4)}) contrast(${((hi + lo) / (hi - lo)).toFixed(4)})`;

export function createPanoramaViewer(dialog: HTMLDialogElement): PanoramaViewer {
  const img = '<img draggable="false" alt="" crossorigin="anonymous" />';
  dialog.innerHTML = `
    <div class="pano-head">
      <h2 class="pano-title"></h2>
      <div class="pano-tools">
        <button type="button" data-act="crop">⇕</button>
        <button type="button" data-act="zoom-out">−</button>
        <button type="button" data-act="zoom-in">+</button>
        <button type="button" data-act="reset">⟲</button>
        <button type="button" data-act="max">⤢</button>
        <button type="button" data-act="close">✕</button>
      </div>
    </div>
    <div class="pano-stage" tabindex="0" role="img">
      <div class="pano-track">${img.repeat(COPIES)}</div>
      <div class="pano-compass" aria-hidden="true"></div>
      <div class="pano-heading"></div>
      <div class="pano-state" aria-live="polite"></div>
      <div class="pano-hint"></div>
    </div>
    <div class="pano-overview" role="button" tabindex="0">
      <div class="pano-overview-frame">
        ${img}
        <span class="pano-window"></span><span class="pano-window"></span>
      </div>
    </div>
    <p class="pano-meta"></p>`;

  const q = <T extends Element>(sel: string) => dialog.querySelector<T>(sel)!;
  const stage = q<HTMLDivElement>(".pano-stage");
  const track = q<HTMLDivElement>(".pano-track");
  const copies = Array.from(track.querySelectorAll<HTMLImageElement>("img"));
  const compass = q<HTMLDivElement>(".pano-compass");
  const heading = q<HTMLDivElement>(".pano-heading");
  const stateEl = q<HTMLDivElement>(".pano-state");
  const hint = q<HTMLDivElement>(".pano-hint");
  const overview = q<HTMLDivElement>(".pano-overview");
  const frame = q<HTMLDivElement>(".pano-overview-frame");
  const overviewImg = frame.querySelector("img")!;
  const windows = Array.from(frame.querySelectorAll<HTMLSpanElement>(".pano-window"));
  const cropBtn = q<HTMLButtonElement>('[data-act="crop"]');

  let current: Panorama | null = null;
  let loadState: "loading" | "ready" | "error" = "loading";
  let aspect = 4; // width / height of the whole mosaic, replaced by the real one on load
  /** Fully photographed band (fractions of the height), or null if there is none to crop to. */
  let band: [number, number] | null = null;
  /** Display contrast stretch for dim images (null = shown as published). */
  let stretch: [number, number] | null = null;
  let cropped = true;
  let zoom = MIN_ZOOM;
  /** Left edge of the view as a fraction of the panorama width, in [0, 1). */
  let u = 0;
  /** Vertical center of the view as a fraction of the whole mosaic height. */
  let v = 0.5;
  let maximized = false;
  let loadToken = 0;

  // ---------------------------------------------------------------------------
  // Layout
  // ---------------------------------------------------------------------------
  const wrap = (x: number) => ((x % 1) + 1) % 1;
  /** Vertical range shown: the covered band when cropping, else the whole mosaic. */
  const range = (): [number, number] => (cropped && band ? band : [0, 1]);
  /** Size of the WHOLE mosaic on screen; at zoom 1 the shown range fills the stage height. */
  const size = () => {
    const [r0, r1] = range();
    const h = (stage.clientHeight * zoom) / (r1 - r0);
    return { w: h * aspect, h };
  };

  function layout() {
    if (loadState !== "ready") return;
    const { w, h } = size();
    const sw = stage.clientWidth;
    const sh = stage.clientHeight;
    const [r0, r1] = range();
    const half = sh / (2 * h);
    v = r1 - r0 <= 2 * half ? (r0 + r1) / 2 : Math.min(r1 - half, Math.max(r0 + half, v));
    const top = sh / 2 - v * h;
    const left = -u * w;
    copies.forEach((el, i) => {
      el.style.height = `${h}px`;
      el.style.width = `${w}px`;
      el.style.transform = `translate(${left + (i - 1) * w}px, ${top}px)`;
    });

    // Overview shows the same vertical range; the boxes mark the part on screen (two at the seam).
    const span = r1 - r0;
    frame.style.aspectRatio = String(aspect / span);
    frame.style.width = `min(100%, ${Math.round((OVERVIEW_MAX_H * aspect) / span)}px)`; // at most this tall
    overviewImg.style.height = `${100 / span}%`;
    overviewImg.style.top = `${(-r0 / span) * 100}%`;
    const vw = Math.min(1, sw / w);
    const vh = Math.min(span, sh / h);
    const vt = Math.max(r0, v - vh / 2);
    const first = Math.min(vw, 1 - u);
    setWindow(windows[0], u, first, (vt - r0) / span, vh / span);
    setWindow(windows[1], 0, vw - first, (vt - r0) / span, vh / span);

    drawCompass(w, sw);
  }

  function setWindow(el: HTMLElement, x: number, w: number, y: number, h: number) {
    el.hidden = w <= 0.0005;
    el.style.left = `${x * 100}%`;
    el.style.width = `${w * 100}%`;
    el.style.top = `${y * 100}%`;
    el.style.height = `${h * 100}%`;
  }

  /** Azimuth (degrees from north, clockwise) at a horizontal fraction of the mosaic. */
  const azimuthAt = (x: number, center: number) => (((center + (x - 0.5) * 360) % 360) + 360) % 360;

  function drawCompass(w: number, sw: number) {
    const center = current?.azimuthCenterDeg;
    compass.hidden = heading.hidden = center == null;
    if (center == null) return;
    const names = t("pano.cardinals").split(",");
    const marks: string[] = [];
    for (let k = 0; k < 8; k++) {
      const az = k * 45;
      const x = wrap(0.5 + (az - center) / 360); // fraction of the mosaic where this azimuth is
      for (let copy = -1; copy <= 1; copy++) {
        const sx = (x - u + copy) * w;
        if (sx < -20 || sx > sw + 20) continue;
        marks.push(`<span class="${k % 2 ? "minor" : "major"}" style="left:${sx.toFixed(1)}px">${esc(names[k] ?? "")}</span>`);
      }
    }
    compass.innerHTML = marks.join("");
    const az = Math.round(azimuthAt(u + sw / (2 * w), center)) % 360;
    heading.textContent = t("pano.heading", { deg: String(az), dir: names[Math.round(az / 45) % 8] ?? "" });
  }

  /** Moves the view by screen pixels. */
  function panBy(dx: number, dy: number) {
    const { w, h } = size();
    u = wrap(u - dx / w);
    v -= dy / h;
    layout();
  }

  /** Zooms by `factor` keeping the image point under (px, py) in place (stage coordinates). */
  function zoomAt(factor: number, px = stage.clientWidth / 2, py = stage.clientHeight / 2) {
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor));
    if (next === zoom) return;
    const before = size();
    const ix = u + px / before.w;
    const iy = v + (py - stage.clientHeight / 2) / before.h;
    zoom = next;
    const after = size();
    u = wrap(ix - px / after.w);
    v = iy - (py - stage.clientHeight / 2) / after.h;
    layout();
  }

  /** Puts the center of the mosaic (NASA's stated azimuth, when given) in the middle of the screen. */
  function centerHorizontally() {
    u = wrap(0.5 - stage.clientWidth / (2 * size().w));
    layout();
  }

  function reset() {
    zoom = MIN_ZOOM;
    v = band ? (band[0] + band[1]) / 2 : 0.5;
    centerHorizontally();
  }

  function setCropped(on: boolean) {
    // Keep looking the same way: the mosaic column at the middle of the screen stays there.
    const middle = u + stage.clientWidth / (2 * size().w);
    cropped = on;
    zoom = MIN_ZOOM;
    u = wrap(middle - stage.clientWidth / (2 * size().w));
    relabel();
    layout();
  }

  function setMaximized(on: boolean) {
    maximized = on;
    dialog.classList.toggle("max", on);
    relabel();
    requestAnimationFrame(layout);
  }

  new ResizeObserver(layout).observe(stage);

  // ---------------------------------------------------------------------------
  // Pointer: drag with inertia, pinch to zoom
  // ---------------------------------------------------------------------------
  const pointers = new Map<number, { x: number; y: number }>();
  let pinchDist = 0;
  let velocity = 0;
  let lastMove = 0;
  let inertia = 0;

  function dismissHint() {
    hint.classList.add("gone");
  }

  stage.addEventListener("pointerdown", (e) => {
    if (loadState !== "ready") return;
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    cancelAnimationFrame(inertia);
    velocity = 0;
    lastMove = performance.now();
    stage.classList.add("dragging");
    dismissHint();
    if (pointers.size === 2) pinchDist = distance();
  });

  stage.addEventListener("pointermove", (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const now = { x: e.clientX, y: e.clientY };
    if (pointers.size === 2) {
      pointers.set(e.pointerId, now);
      const d = distance();
      const [a, b] = [...pointers.values()];
      const r = stage.getBoundingClientRect();
      if (pinchDist > 0) zoomAt(d / pinchDist, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      pinchDist = d;
      return;
    }
    const dx = now.x - prev.x;
    pointers.set(e.pointerId, now);
    const time = performance.now();
    velocity = dx / Math.max(1, time - lastMove);
    lastMove = time;
    panBy(dx, now.y - prev.y);
  });

  function endPointer(e: PointerEvent) {
    if (!pointers.delete(e.pointerId)) return;
    pinchDist = 0;
    if (pointers.size > 0) return;
    stage.classList.remove("dragging");
    // Inertia only for a horizontal flick that was still moving when released.
    if (performance.now() - lastMove > 80 || Math.abs(velocity) < 0.05) return;
    let vel = velocity * 16;
    const step = () => {
      vel *= 0.92;
      if (Math.abs(vel) < 0.3) return;
      panBy(vel, 0);
      inertia = requestAnimationFrame(step);
    };
    inertia = requestAnimationFrame(step);
  }
  stage.addEventListener("pointerup", endPointer);
  stage.addEventListener("pointercancel", endPointer);

  function distance() {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  stage.addEventListener(
    "wheel",
    (e) => {
      if (loadState !== "ready") return;
      e.preventDefault();
      dismissHint();
      // Horizontal trackpad swipe pans; vertical wheel (or pinch, sent as ctrl+wheel) zooms.
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && !e.ctrlKey) {
        panBy(-e.deltaX, 0);
        return;
      }
      const r = stage.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002)), e.clientX - r.left, e.clientY - r.top);
    },
    { passive: false },
  );

  // ---------------------------------------------------------------------------
  // Overview, buttons and keyboard
  // ---------------------------------------------------------------------------
  function jumpTo(fx: number, fy: number) {
    const { w } = size();
    u = wrap(fx - stage.clientWidth / (2 * w));
    v = fy;
    layout();
  }

  overview.addEventListener("click", (e) => {
    if (loadState !== "ready") return;
    const r = frame.getBoundingClientRect();
    const [r0, r1] = range();
    jumpTo((e.clientX - r.left) / r.width, r0 + ((e.clientY - r.top) / r.height) * (r1 - r0));
    dismissHint();
  });
  overview.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      jumpTo(u + 0.5, v); // next half turn
    }
  });

  dialog.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    if (target === dialog) return dialog.close();
    const act = target.closest<HTMLButtonElement>("[data-act]")?.dataset.act;
    if (act === "close") dialog.close();
    else if (act === "zoom-in") zoomAt(ZOOM_STEP);
    else if (act === "zoom-out") zoomAt(1 / ZOOM_STEP);
    else if (act === "reset") reset();
    else if (act === "max") setMaximized(!maximized);
    else if (act === "crop") setCropped(!cropped);
  });

  dialog.addEventListener("keydown", (e) => {
    if (loadState !== "ready" || (e.target as HTMLElement).tagName === "A") return;
    const step = stage.clientWidth * 0.1;
    const keys: Record<string, () => void> = {
      ArrowLeft: () => panBy(step, 0),
      ArrowRight: () => panBy(-step, 0),
      ArrowUp: () => panBy(0, step),
      ArrowDown: () => panBy(0, -step),
      "+": () => zoomAt(ZOOM_STEP),
      "=": () => zoomAt(ZOOM_STEP),
      "-": () => zoomAt(1 / ZOOM_STEP),
      "0": reset,
      f: () => setMaximized(!maximized),
      F: () => setMaximized(!maximized),
    };
    const run = keys[e.key];
    if (!run) return;
    e.preventDefault();
    dismissHint();
    run();
  });

  dialog.addEventListener("close", () => {
    cancelAnimationFrame(inertia);
    pointers.clear();
    setMaximized(false);
  });

  // ---------------------------------------------------------------------------
  // Texts (re-written on language change, keeping the view)
  // ---------------------------------------------------------------------------
  function relabel() {
    const p = current;
    if (!p) return;
    const title = panoTitle(p);
    q(".pano-title").textContent = title;
    const label = (act: string, key: Parameters<typeof t>[0]) => {
      const b = q<HTMLButtonElement>(`[data-act="${act}"]`);
      b.setAttribute("aria-label", t(key));
      b.title = t(key);
    };
    label("crop", cropped ? "pano.showFull" : "pano.cropToCovered");
    cropBtn.hidden = !band;
    cropBtn.setAttribute("aria-pressed", String(!cropped));
    label("zoom-out", "pano.zoomOut");
    label("zoom-in", "pano.zoomIn");
    label("reset", "pano.reset");
    label("max", maximized ? "pano.restore" : "pano.maximize");
    label("close", "pano.close");
    stage.setAttribute("aria-label", t("pano.alt", { title }));
    overview.setAttribute("aria-label", t("pano.overview"));
    overview.title = t("pano.overview");
    hint.textContent = t("pano.hint");
    stateEl.textContent =
      loadState === "loading"
        ? p.imageMb
          ? t("pano.loading", { mb: String(p.imageMb) })
          : t("pano.loadingNoSize")
        : loadState === "error"
          ? t("pano.error")
          : "";
    const sols = p.solStart === p.solEnd ? String(p.solStart) : `${p.solStart}–${p.solEnd}`;
    const dates =
      p.dateStart && p.dateEnd && p.dateStart !== p.dateEnd
        ? t("pano.dateRange", { start: p.dateStart, end: p.dateEnd })
        : (p.dateStart ?? "");
    const parts = [
      t("pano.metaSol", { sols }) + (dates ? ` (${dates})` : ""),
      p.images ? t("pano.metaImages", { images: String(p.images), instrument: p.instrument }) : p.instrument,
      p.azimuthCenterDeg != null ? t("pano.metaAzimuth", { az: String(p.azimuthCenterDeg) }) : null,
      p.lmst ? t("pano.metaLmst", { lmst: p.lmst }) : null,
      band && cropped ? t("pano.metaCropped") : null,
      stretch ? t("pano.metaStretched") : null,
      t("pano.metaObserved"),
      p.credit,
    ].filter((x): x is string => Boolean(x));
    q(".pano-meta").innerHTML =
      `${parts.map(esc).join(" · ")} · <a href="${esc(p.pageUrl)}" target="_blank" rel="noopener">${esc(t("pano.source"))}</a>`;
  }
  onLanguageChange(() => {
    relabel();
    layout(); // compass letters
  });

  function setLoadState(s: typeof loadState) {
    loadState = s;
    dialog.dataset.state = s;
    relabel();
    layout();
  }

  return {
    open(p) {
      const same = current?.id === p.id && loadState === "ready";
      current = p;
      if (!same) {
        const token = ++loadToken;
        hint.classList.remove("gone");
        copies.forEach((el) => el.removeAttribute("src"));
        overviewImg.removeAttribute("src");
        band = null;
        stretch = null;
        cropped = true;
        setLoadState("loading");
        zoom = MIN_ZOOM;
        u = 0;
        v = 0.5;
        const loader = new Image();
        loader.crossOrigin = "anonymous"; // same mode as the shown copies, so the download is reused
        loader.onload = () => {
          if (token !== loadToken) return; // another panorama was opened meanwhile
          aspect = loader.naturalWidth / loader.naturalHeight;
          ({ band, stretch } = analyzeImage(loader));
          if (band) v = (band[0] + band[1]) / 2;
          const filter = stretch ? stretchFilter(stretch) : "";
          [...copies, overviewImg].forEach((el) => {
            el.src = p.imageUrl;
            el.style.filter = filter;
          });
          setLoadState("ready");
          requestAnimationFrame(centerHorizontally); // after the dialog has its size
        };
        loader.onerror = () => token === loadToken && setLoadState("error");
        loader.src = p.imageUrl;
      } else {
        relabel();
      }
      if (!dialog.open) dialog.showModal();
      stage.focus();
      requestAnimationFrame(layout);
    },
  };
}
