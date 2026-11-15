import * as Cesium from "cesium";
import { getLanguage, onLanguageChange, t } from "../i18n";
import { esc } from "./format";
import type { Pair, Parcel, PlanResponse } from "../mission/draft";
import { metricToScene } from "../mission/geography";
import { duration } from "../mission/results";
import type { ElevationGrid } from "../terrain/elevationGrid";

/**
 * Elevation profile of the calculated route (display only), docked at the bottom of the screen.
 * X axis: horizontal distance along the calculated vertices (outbound, then return); the destination
 * (tasks) is marked between them. Y axis: DTM elevation sampled from the local HiRISE 1 m grid
 * ("derived"). Hovering the chart moves a marker along the route on the scene. The engine returns no
 * per-vertex time, so only each leg's total time is shown.
 */
interface ProfilePoint { d: number; z: number | null; xy: Pair; leg: "outbound" | "return" }

const W = 1000;
const H = 150;

export function createRouteProfile(viewer: Cesium.Viewer, grid: ElevationGrid | undefined) {
  const root = document.createElement("section");
  root.id = "routeProfile";
  root.hidden = true;
  document.body.appendChild(root);
  const source = new Cesium.CustomDataSource("route-profile-cursor");
  void viewer.dataSources.add(source);
  const cursor = source.entities.add({
    show: false,
    point: { pixelSize: 12, color: Cesium.Color.WHITE, outlineColor: Cesium.Color.fromCssColorString("#e8834f"), outlineWidth: 3,
      disableDepthTestDistance: Number.POSITIVE_INFINITY },
  });

  let response: PlanResponse | null = null;
  let parcel: Parcel | null = null;
  let points: ProfilePoint[] = [];
  let collapsed = false;
  let selectedId: string | null = null;
  const pick = (r: PlanResponse) => r.alternatives.find((a) => a.id === selectedId) ?? r.alternatives[0];
  /** Return leg may come from another alternative while the simulated tracking follows a combination. */
  let returnId: string | null = null;
  const pickBack = (r: PlanResponse) => r.alternatives.find((a) => a.id === returnId) ?? pick(r);
  let zMin = 0, zMax = 1, dTotal = 1, dOut = 0;
  /** Simulated-tracking position along the profile (metres), drawn as a moving line; null hides it. */
  let progressD: number | null = null;
  /** Extra controls (simulated tracking) kept below the chart across re-renders. */
  const slot = document.createElement("div");
  slot.className = "rp-slot";

  const lang = () => getLanguage();
  const m = (v: number) => `${Math.round(v).toLocaleString(lang())} m`;
  const xOf = (d: number) => (d / dTotal) * W;
  const yOf = (z: number) => H - 8 - ((z - zMin) / Math.max(zMax - zMin, 1)) * (H - 22);

  function build(r: PlanResponse) {
    points = [];
    const alt = pick(r), back = pickBack(r);
    if (!alt || !grid) return;
    let d = 0;
    for (const leg of ["outbound", "return"] as const) {
      const source = leg === "outbound" ? alt : back;
      const xy = source[leg].status === "found" ? source[leg].xy_m : [];
      xy.forEach((p, i) => {
        if (i > 0) d += Math.hypot(p[0] - xy[i - 1][0], p[1] - xy[i - 1][1]);
        points.push({ d, z: grid.sampleMetric(p[0], p[1])?.elevation_m ?? null, xy: p, leg });
      });
      if (leg === "outbound") dOut = d;
    }
    const zs = points.flatMap((p) => (p.z === null ? [] : [p.z]));
    dTotal = Math.max(d, 1);
    zMin = zs.length ? Math.min(...zs) : 0;
    zMax = zs.length ? Math.max(...zs) : 1;
    const pad = Math.max((zMax - zMin) * 0.12, 2);
    zMin -= pad; zMax += pad;
  }

  function path(leg: ProfilePoint["leg"], area: boolean) {
    const pts = points.filter((p) => p.leg === leg && p.z !== null);
    if (pts.length < 2) return "";
    const line = pts.map((p, i) => `${i ? "L" : "M"}${xOf(p.d).toFixed(1)},${yOf(p.z!).toFixed(1)}`).join(" ");
    return area ? `${line} L${xOf(pts[pts.length - 1].d).toFixed(1)},${H} L${xOf(pts[0].d).toFixed(1)},${H} Z` : line;
  }

  function render() {
    draw();
    if (response) root.appendChild(slot);
    drawProgress();
  }
  function drawProgress() {
    const line = root.querySelector<SVGLineElement>(".rp-progress");
    if (!line) return;
    const visible = progressD !== null && points.length > 1;
    line.setAttribute("visibility", visible ? "visible" : "hidden");
    if (visible) { const x = xOf(Math.min(Math.max(progressD!, 0), dTotal)).toFixed(1); line.setAttribute("x1", x); line.setAttribute("x2", x); }
  }
  function draw() {
    root.hidden = !response;
    root.classList.toggle("collapsed", collapsed);
    if (!response) { root.innerHTML = ""; return; }
    const alt = pick(response), back = pickBack(response);
    const head = `<header class="rp-head">
        <h2>${esc(t("profile.title"))} <span class="wz-tag" data-kind="derived">${esc(t("wizard.tag.derived"))}</span></h2>
        ${alt ? `<span class="rp-legs">
          <span class="rp-leg rp-out">${esc(t("nav.outbound"))} ${esc(duration(alt.metrics.outbound_s))} · ${esc(alt.outbound.horizontal_distance_m === null ? "—" : m(alt.outbound.horizontal_distance_m))}
            · ↑${esc(alt.outbound.ascent_m === null ? "—" : m(alt.outbound.ascent_m))} ↓${esc(alt.outbound.descent_m === null ? "—" : m(alt.outbound.descent_m))}</span>
          <span class="rp-leg rp-ret">${esc(t("nav.return"))} ${esc(duration(back.metrics.return_s))} · ${esc(back.return.horizontal_distance_m === null ? "—" : m(back.return.horizontal_distance_m))}
            · ↑${esc(back.return.ascent_m === null ? "—" : m(back.return.ascent_m))} ↓${esc(back.return.descent_m === null ? "—" : m(back.return.descent_m))}</span></span>` : ""}
        <button type="button" data-act="collapse" aria-expanded="${!collapsed}" aria-label="${esc(t(collapsed ? "profile.show" : "profile.hide"))}">${collapsed ? "+" : "−"}</button>
      </header>`;
    if (!grid || points.filter((p) => p.z !== null).length < 2) {
      root.innerHTML = `${head}<p class="rp-empty">${esc(t(grid ? "profile.noRoute" : "profile.noGrid"))}</p>`;
      return;
    }
    const tasks = alt ? duration(alt.metrics.tasks_s) : "";
    root.innerHTML = `${head}
      <div class="rp-chart">
        <div class="rp-y"><span>${esc(m(zMax))}</span><span>${esc(m(zMin))}</span></div>
        <div class="rp-plot">
          <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(t("profile.title"))}">
            <defs>
              <linearGradient id="rpOut" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3ff0ff" stop-opacity=".35"/><stop offset="1" stop-color="#3ff0ff" stop-opacity="0"/></linearGradient>
              <linearGradient id="rpRet" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb347" stop-opacity=".3"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></linearGradient>
            </defs>
            ${[0.25, 0.5, 0.75].map((f) => `<line x1="0" x2="${W}" y1="${(H * f).toFixed(1)}" y2="${(H * f).toFixed(1)}" class="rp-gridline"/>`).join("")}
            <path d="${path("outbound", true)}" fill="url(#rpOut)"/><path d="${path("return", true)}" fill="url(#rpRet)"/>
            <path d="${path("outbound", false)}" class="rp-line rp-line-out"/><path d="${path("return", false)}" class="rp-line rp-line-ret"/>
            <line x1="${xOf(dOut).toFixed(1)}" x2="${xOf(dOut).toFixed(1)}" y1="0" y2="${H}" class="rp-dest"/>
            <line class="rp-hover" x1="0" x2="0" y1="0" y2="${H}" visibility="hidden"/>
            <line class="rp-progress" x1="0" x2="0" y1="0" y2="${H}" visibility="hidden"/>
          </svg>
          <span class="rp-dest-label" style="left:${(100 * dOut / dTotal).toFixed(2)}%">${esc(t("profile.destination", { t: tasks }))}</span>
          <span class="rp-tip" hidden></span>
        </div>
      </div>
      <div class="rp-x"><span>0 m</span><span style="left:${(100 * dOut / dTotal).toFixed(2)}%">${esc(m(dOut))}</span><span>${esc(m(dTotal))}</span></div>`;
  }

  function hover(clientX: number) {
    const plot = root.querySelector<HTMLElement>(".rp-plot");
    if (!plot || !points.length || !parcel?.geographic_adapter) return;
    const rect = plot.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const d = frac * dTotal;
    let best = points[0];
    for (const p of points) if (Math.abs(p.d - d) < Math.abs(best.d - d)) best = p;
    const line = root.querySelector<SVGLineElement>(".rp-hover");
    line?.setAttribute("x1", String(xOf(best.d))); line?.setAttribute("x2", String(xOf(best.d)));
    line?.setAttribute("visibility", "visible");
    const tip = root.querySelector<HTMLElement>(".rp-tip");
    if (tip) {
      tip.hidden = false;
      tip.style.left = `${(100 * best.d / dTotal).toFixed(2)}%`;
      tip.textContent = `${t(best.leg === "outbound" ? "nav.outbound" : "nav.return")} · ${m(best.d)} · ${best.z === null ? "—" : m(best.z)}`;
    }
    const a = parcel.geographic_adapter;
    const [lon, lat] = metricToScene(best.xy, a);
    const h = (best.z ?? 0) + a.vertical_offset_m;
    cursor.position = new Cesium.ConstantPositionProperty(Cesium.Cartesian3.fromDegrees(lon, lat, h, Cesium.Ellipsoid.MARS));
    cursor.show = best.z !== null;
  }
  function leave() {
    root.querySelector(".rp-hover")?.setAttribute("visibility", "hidden");
    const tip = root.querySelector<HTMLElement>(".rp-tip"); if (tip) tip.hidden = true;
    cursor.show = false;
  }

  /**
   * Centre the dock in the free part of the map: between the left results column and the right edge,
   * at most MAX_WIDTH wide. Narrow screens keep the full-width CSS layout.
   */
  const MAX_WIDTH = 860;
  function place() {
    if (root.hidden) return;
    if (window.matchMedia("(max-width: 900px)").matches) { root.style.left = ""; root.style.width = ""; root.style.right = ""; return; }
    const results = document.getElementById("resultsPanel");
    const rect = results && !results.hidden ? results.getBoundingClientRect() : null;
    const from = rect && rect.width > 0 ? rect.right + 16 : 12;
    const to = window.innerWidth - 12;
    const width = Math.max(320, Math.min(MAX_WIDTH, to - from));
    root.style.right = "auto";
    root.style.width = `${width}px`;
    root.style.left = `${Math.max(from, from + (to - from - width) / 2)}px`;
  }
  window.addEventListener("resize", place);
  const resultsEl = document.getElementById("resultsPanel");
  if (resultsEl) {
    new ResizeObserver(place).observe(resultsEl);
    new MutationObserver(place).observe(resultsEl, { attributes: true, attributeFilter: ["hidden", "class"] });
  }

  root.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest('[data-act="collapse"]')) { collapsed = !collapsed; render(); }
  });
  root.addEventListener("pointermove", (e) => { if ((e.target as HTMLElement).closest(".rp-plot")) hover(e.clientX); else leave(); });
  root.addEventListener("pointerleave", leave);
  onLanguageChange(render);

  return {
    show(r: PlanResponse, p: Parcel | null, selected: string | null = null) {
      selectedId = selected; returnId = null;
      response = r.geographic_adapter && r.alternatives.length ? r : null;
      parcel = p;
      if (response) build(response);
      collapsed = false; progressD = null;
      render();
      place();
    },
    clear() { response = null; points = []; progressD = null; cursor.show = false; render(); },
    /** Container for the simulated-tracking controls (lives inside the dock). */
    slot,
    /** Show the outbound of one alternative and the return of another (simulated tracking choice). */
    setLegs(outboundId: string, backId: string) {
      if (!response) return;
      selectedId = outboundId; returnId = backId; progressD = null;
      build(response); render();
    },
    setProgress(d: number | null) { progressD = d; drawProgress(); },
  };
}
