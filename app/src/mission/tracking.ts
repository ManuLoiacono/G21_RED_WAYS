import { simulationEnvironment } from "./simulationEnvironment";
import * as Cesium from "cesium";
import { onLanguageChange, t, tOr } from "../i18n";
import { esc } from "../ui/format";
import type { ElevationGrid } from "../terrain/elevationGrid";
import { requestReevaluation } from "./api";
import type { Alternative, Pair, Parcel, PlanResponse, ProgressPhase, ProgressResponse } from "./draft";
import { metricToScene } from "./geography";
import { duration, statusLabel } from "./results";

/**
 * Simulated tracking (P1-09): a marker walks the calculated route on a simulated clock.
 * Positions are simulated (no localization). Inside each leg the marker moves at the leg's
 * average pace (the engine returns only per-leg durations), so it reaches the destination and
 * the base exactly at the calculated times. A delay event asks the engine (POST /reevaluate,
 * P2-11) to evaluate continuing versus returning now, with unchanged limits; the user decides.
 */
type Move = { kind: "move"; leg: "outbound" | "return" | "return_now"; xy: Pair[]; cum: number[]; dur: number };
type Tasks = { kind: "tasks"; dur: number };
type Segment = (Move | Tasks) & { start: number };
interface State { phase: ProgressPhase; seg: Segment; vertex: number; xy: Pair; tasksDone: number; profileD: number | null; done: boolean }

const SPEEDS = [30, 60, 120, 300];
const DELAYS_MIN = [5, 15, 30, 60];

function moveOf(leg: Move["leg"], xy: Pair[], dur: number): Move {
  const cum = [0];
  for (let i = 1; i < xy.length; i++) cum.push(cum[i - 1] + Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]));
  return { kind: "move", leg, xy, cum, dur };
}

export function createTracking(viewer: Cesium.Viewer, mount: HTMLElement, grid: ElevationGrid | undefined,
  hooks: { getParcel: () => Parcel | null; setProfileProgress: (d: number | null) => void;
    /** The followed outbound/return alternatives changed (the profile shows exactly these legs). */
    onLegs?: (outboundId: string, returnId: string) => void }) {
  const root = document.createElement("div");
  root.className = "tk";
  mount.appendChild(root);
  const source = new Cesium.CustomDataSource("simulated-tracking");
  void viewer.dataSources.add(source);
  const marker = source.entities.add({
    id: "tracking:marker", show: false,
    point: { pixelSize: 15, color: Cesium.Color.fromCssColorString("#ffd166"), outlineColor: Cesium.Color.fromCssColorString("#1a1206"),
      outlineWidth: 3, disableDepthTestDistance: Number.POSITIVE_INFINITY },
    label: { text: "", font: "600 12px system-ui, sans-serif", fillColor: Cesium.Color.fromCssColorString("#ffd166"), style: Cesium.LabelStyle.FILL,
      showBackground: true, backgroundColor: Cesium.Color.fromCssColorString("rgba(14, 14, 18, 0.85)"), backgroundPadding: new Cesium.Cartesian2(8, 5),
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM, pixelOffset: new Cesium.Cartesian2(0, -14), disableDepthTestDistance: Number.POSITIVE_INFINITY },
  });

  let response: PlanResponse | null = null;
  let alt: Alternative | null = null; // outbound (and tasks) come from this alternative
  let back: Alternative | null = null; // return leg comes from this one (may differ)
  /** Engine evaluation of an outbound/return combination of two different alternatives. */
  let combo: ProgressResponse | null = null;
  let comboBusy = false;
  let follow = false;
  let heading: number | null = null;
  let plan: Segment[] = [];
  let abort: { at: number; seg: Segment } | null = null;
  let delays: { at: number; dur: number }[] = [];
  let t0 = 0; // simulated seconds since departure
  let playing = false;
  let open = false;
  let speed = 60;
  let delayMin = 15;
  let busy = false;
  let pending: ProgressResponse | null = null;
  let error = "";
  let lastFrame = 0;
  let sequence = 0;
  let dOutProfile = 0;

  const totalDelay = () => delays.reduce((s, d) => s + d.dur, 0);
  const segments = () => abort ? [...plan.filter((s) => s.start < abort!.at), abort.seg] : plan;
  const planEnd = () => { const segs = segments(); const last = segs[segs.length - 1]; return last ? last.start + last.dur : 0; };
  const simEnd = () => planEnd() + totalDelay();

  /** Simulated clock → plan time (plan time stops while a delay is running). */
  function planTime(sim: number) {
    let shift = 0;
    for (const d of [...delays].sort((a, b) => a.at - b.at)) {
      if (sim - shift <= d.at) break;
      if (sim - shift < d.at + d.dur) return { p: d.at, delayed: true };
      shift += d.dur;
    }
    return { p: Math.min(sim - shift, planEnd()), delayed: false };
  }

  function stateAt(p: number): State | null {
    const segs = segments();
    if (!segs.length) return null;
    const seg = segs.find((s) => p < s.start + s.dur) ?? segs[segs.length - 1];
    const into = Math.min(Math.max(p - seg.start, 0), seg.dur);
    const done = p >= planEnd() - 1e-9;
    if (seg.kind === "tasks") {
      const last = (plan[0] as Move).xy[(plan[0] as Move).xy.length - 1];
      return { phase: "tasks", seg, vertex: 0, xy: last, tasksDone: into, profileD: dOutProfile, done };
    }
    const target = seg.dur > 0 ? (into / seg.dur) * seg.cum[seg.cum.length - 1] : seg.cum[seg.cum.length - 1];
    let i = 0;
    while (i < seg.cum.length - 2 && seg.cum[i + 1] <= target) i++;
    const span = seg.cum[i + 1] - seg.cum[i];
    const f = span > 0 && i + 1 < seg.xy.length ? Math.min(Math.max((target - seg.cum[i]) / span, 0), 1) : 0;
    const a = seg.xy[i], b = seg.xy[Math.min(i + 1, seg.xy.length - 1)];
    const xy: Pair = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    const tasksTotal = alt?.metrics.tasks_s ?? 0;
    const profileD = seg.leg === "outbound" ? target : seg.leg === "return" ? dOutProfile + target : null;
    return { phase: seg.leg === "outbound" ? "outbound" : "return", seg, vertex: i, xy,
      tasksDone: seg.leg === "outbound" ? 0 : seg.leg === "return" ? tasksTotal : (abortTasksDone ?? 0), profileD, done };
  }
  let abortTasksDone: number | null = null;

  function place(state: State | null) {
    const a = hooks.getParcel()?.geographic_adapter;
    if (!state || !a || !open) { marker.show = false; hooks.setProfileProgress(null); release(); return; }
    const [lon, lat] = metricToScene(state.xy, a);
    const z = grid?.sampleMetric(state.xy[0], state.xy[1])?.elevation_m ?? response?.locations.origin.effective_elevation_m ?? 0;
    const position = Cesium.Cartesian3.fromDegrees(lon, lat, z + a.vertical_offset_m, Cesium.Ellipsoid.MARS);
    marker.position = new Cesium.ConstantPositionProperty(position);
    marker.show = true;
    hooks.setProfileProgress(state.profileD);
    if (follow) chase(state, position);
  }

  /**
   * POV follow camera ("navigation" view): behind the simulated position, tilted down, looking
   * along the direction of travel. Heading = direction to a point ~25 m ahead on the current
   * path (east/north metric frame), smoothed so 45° grid steps do not shake the view.
   */
  function chase(state: State, position: Cesium.Cartesian3) {
    if (state.seg.kind === "move") {
      const seg = state.seg;
      const here = seg.cum[state.vertex] ?? 0;
      let j = state.vertex;
      while (j < seg.xy.length - 1 && seg.cum[j] - here < 25) j++;
      const dx = seg.xy[j][0] - state.xy[0], dy = seg.xy[j][1] - state.xy[1];
      if (Math.hypot(dx, dy) > 0.5) {
        const target = Math.atan2(dx, dy);
        if (heading === null) heading = target;
        else { const diff = Math.atan2(Math.sin(target - heading), Math.cos(target - heading)); heading += diff * 0.12; }
      }
    }
    viewer.camera.lookAt(position, new Cesium.HeadingPitchRange(heading ?? 0, Cesium.Math.toRadians(-22), 70));
    viewer.scene.requestRender();
  }
  function release() {
    if (!Cesium.Matrix4.equals(viewer.camera.transform, Cesium.Matrix4.IDENTITY)) viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
  }

  function frame(now: number) {
    if (!playing) return;
    const dt = lastFrame ? (now - lastFrame) / 1000 : 0;
    lastFrame = now;
    t0 = Math.min(t0 + dt * speed, simEnd());
    if (t0 >= simEnd()) playing = false;
    update();
    if (playing) requestAnimationFrame(frame);
  }
  function play() { if (!alt || busy || pending || comboBusy || (combo === null && back !== alt)) return; if (t0 >= simEnd()) restart(false); playing = true; lastFrame = 0; requestAnimationFrame(frame); render(); }
  function pause() { playing = false; render(); }
  function restart(draw = true) {
    playing = false; t0 = 0; delays = []; abort = null; abortTasksDone = null; pending = null; pendingAt = null; decided = null;
    error = ""; busy = false; heading = null; sequence += 1; drawAbort(); if (draw) update();
  }

  const phaseLabel = (s: State) => s.done ? t("tk.phase.arrived") : planTime(t0).delayed ? t("tk.phase.delayed")
    : s.seg.kind === "move" && s.seg.leg === "return_now" ? t("tk.phase.returnNow") : t(`tk.phase.${s.phase}`);

  /** Cheap per-frame update of the moving parts; full render only when structure changes. */
  function update() {
    const { p } = planTime(t0);
    const state = stateAt(p);
    place(state);
    const bar = root.querySelector<HTMLElement>(".tk-bar i");
    if (bar) bar.style.width = `${(100 * t0 / Math.max(simEnd(), 1)).toFixed(2)}%`;
    const environment = root.querySelector<HTMLElement>(".tk-environment");
    if (environment && response && alt) {
      const html = simulationEnvironment(alt, response, t0);
      if (environment.dataset.html !== html) {
        const opened = environment.querySelector("details")?.open;
        environment.innerHTML = html; environment.dataset.html = html;
        const details = environment.querySelector("details"); if (details && opened) details.open = true;
      }
      environment.classList.toggle("demo-playing", playing);
    }
    const clock = root.querySelector(".tk-clock");
    if (clock) clock.textContent = `T+${hms(t0)} / ${hms(simEnd())}`;
    const phase = root.querySelector(".tk-phase");
    if (phase && state) phase.textContent = phaseLabel(state);
    if (!playing && root.querySelector('[data-act="pause"]')) render();
  }
  const hms = (s: number) => { const v = Math.max(0, Math.round(s)); return `${String(Math.floor(v / 3600)).padStart(2, "0")}:${String(Math.floor(v % 3600 / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`; };

  async function delayEvent() {
    if (!response || !alt || !back || busy) return;
    const { p } = planTime(t0);
    const state = stateAt(p);
    if (!state || state.done) return;
    if (abort) { error = t("tk.err.returning"); render(); return; }
    playing = false;
    const leg = state.phase === "return" ? back.return : alt.outbound;
    const cell = state.phase === "tasks" ? alt.outbound.cells[alt.outbound.cells.length - 1] : leg.cells[state.vertex];
    const added = delayMin * 60;
    busy = true; error = ""; pending = null; render();
    const mine = ++sequence;
    const result = await requestReevaluation({ schema_version: "p2-progress-1", request: response.request_echo, alternative_id: alt.id,
      return_alternative_id: back.id,
      progress: { phase: state.phase, vertex_index: state.phase === "tasks" ? 0 : state.vertex, cell,
        tasks_done_s: state.phase === "tasks" ? state.tasksDone : state.phase === "return" ? alt.metrics.tasks_s : 0, delay_s: totalDelay() + added } });
    if (mine !== sequence) return;
    busy = false;
    if (!result.ok) { error = result.error; render(); return; }
    if (result.data.alternative_id !== alt.id || result.data.request_echo.request_id !== response.request_echo.request_id) { error = t("mp.status.discarded"); render(); return; }
    pending = result.data;
    pendingAt = { p, added, tasksDone: state.tasksDone };
    render();
  }
  let pendingAt: { p: number; added: number; tasksDone: number } | null = null;

  function decide(id: "continue" | "return_now") {
    if (!pending || !pendingAt) return;
    const option = pending.options.find((o) => o.id === id);
    if (!option) return;
    delays.push({ at: pendingAt.p, dur: pendingAt.added });
    if (id === "return_now" && option.return.xy_m.length && option.metrics.return_s !== null) {
      abort = { at: pendingAt.p, seg: { ...moveOf("return_now", option.return.xy_m, option.metrics.return_s), start: pendingAt.p } };
      abortTasksDone = pendingAt.tasksDone;
      drawAbort();
    }
    decided = { id, response: pending };
    pending = null; pendingAt = null;
    // Resume from the event point: the delay runs first on the simulated clock.
    play();
  }
  let decided: { id: "continue" | "return_now"; response: ProgressResponse } | null = null;

  /** Ask the engine to evaluate an outbound/return pair of different alternatives (never computed by /plan). */
  async function evaluateCombo() {
    combo = null;
    if (!response || !alt || !back || back === alt) { render(); return; }
    comboBusy = true; error = ""; render();
    const mine = ++sequence;
    const result = await requestReevaluation({ schema_version: "p2-progress-1", request: response.request_echo, alternative_id: alt.id,
      return_alternative_id: back.id, progress: { phase: "outbound", vertex_index: 0, cell: alt.outbound.cells[0], tasks_done_s: 0, delay_s: 0 } });
    if (mine !== sequence) return;
    comboBusy = false;
    if (!result.ok) error = result.error;
    else if (result.data.request_echo.request_id !== response.request_echo.request_id) error = t("mp.status.discarded");
    else combo = result.data;
    render();
  }
  const shortName = (a: Alternative) => tOr(`nav.criterion.${(a.criteria ?? [a.criterion])[0]}`, a.criterion).split(" · ")[0];
  function legPicker(kind: "outbound" | "return") {
    const current = kind === "outbound" ? alt : back;
    const locked = t0 > 0;
    return `<label class="tk-select">${esc(t(kind === "outbound" ? "tk.legOut" : "tk.legBack"))}
      <select data-act="leg-${kind}" ${locked || busy || comboBusy ? "disabled" : ""}>${response!.alternatives.map((a) =>
        `<option value="${esc(a.id)}" ${a === current ? "selected" : ""}>${esc(shortName(a))} · ${esc(duration(kind === "outbound" ? a.metrics.outbound_s : a.metrics.return_s))}</option>`).join("")}</select></label>`;
  }
  function comboNote() {
    if (!alt || !back || back === alt) return "";
    if (comboBusy) return `<small class="tk-combo">${esc(t("tk.comboEvaluating"))}</small>`;
    if (!combo) return "";
    const m = combo.planned.metrics;
    return `<small class="tk-combo">${esc(t("tk.comboResult"))} <span class="rs-badge" data-status="${esc(combo.planned.assessment ?? "")}">${esc(statusLabel(combo.planned.assessment))}</span>
      · ${esc(t("tk.reservedTotal"))} ${esc(duration(m?.reserved_total_s ?? null))} · ${esc(t("tk.margin"))} ${esc(duration(m?.mission_margin_s ?? null))}</small>`;
  }

  function drawAbort() {
    source.entities.removeById("tracking:return-now");
    const a = hooks.getParcel()?.geographic_adapter;
    if (!abort || !a || abort.seg.kind !== "move") return;
    const positions = abort.seg.xy.map((xy) => { const [lon, lat] = metricToScene(xy, a); return Cesium.Cartesian3.fromDegrees(lon, lat, 0, Cesium.Ellipsoid.MARS); });
    source.entities.add({ id: "tracking:return-now", polyline: { positions, width: 5, clampToGround: true,
      material: new Cesium.PolylineDashMaterialProperty({ color: Cesium.Color.fromCssColorString("#ffd166"), dashLength: 14 }) } });
  }

  function optionCard(o: ProgressResponse["options"][number], recommended: boolean) {
    const m = o.metrics;
    return `<article class="tk-option ${recommended ? "is-rec" : ""}">
      <header><strong>${esc(t(`tk.option.${o.id}`))}</strong>${o.id === "return_now" ? `<small>${esc(t("tk.returnNowFastest"))}</small>` : ""}${recommended ? `<span class="tk-rec">${esc(t("tk.recommended"))}</span>` : ""}</header>
      <span class="rs-badge" data-status="${esc(o.assessment ?? o.search_status)}">${esc(statusLabel(o.assessment))}</span>
      <dl><div><dt>${esc(t("tk.reservedTotal"))}</dt><dd>${esc(duration(m.reserved_total_s))}</dd></div>
        <div><dt>${esc(t("tk.margin"))}</dt><dd class="${m.mission_margin_s !== null && m.mission_margin_s < 0 ? "rs-neg" : ""}">${esc(duration(m.mission_margin_s))}</dd></div>
        <div><dt>${esc(t("tk.daylight"))}</dt><dd class="${m.daylight_reserved_return_margin_s !== null && m.daylight_reserved_return_margin_s < 0 ? "rs-neg" : ""}">${esc(duration(m.daylight_reserved_return_margin_s))}</dd></div></dl>
      ${o.completes_tasks ? "" : `<p class="tk-note">${esc(t("tk.tasksSkipped"))}</p>`}
      <button type="button" data-decide="${o.id}">${esc(t(`tk.choose.${o.id}`))}</button>
    </article>`;
  }

  function render() {
    if (!response || !alt) { root.innerHTML = ""; return; }
    if (!open) {
      root.innerHTML = `<button type="button" class="tk-start" data-act="open"><span aria-hidden="true">▶</span> ${esc(t("tk.open"))}</button>`;
      return;
    }
    const state = stateAt(planTime(t0).p);
    root.innerHTML = `
      <div class="tk-head"><strong>${esc(t("tk.title"))}</strong> <span class="wz-tag" data-kind="assumed">${esc(t("tk.tag"))}</span>
        <small>${esc(t("tk.honesty"))}</small>
        <button type="button" class="tk-close" data-act="close" aria-label="${esc(t("tk.close"))}">×</button></div>
      <div class="tk-row">
        ${playing ? `<button type="button" class="tk-btn" data-act="pause" aria-label="${esc(t("tk.pause"))}">❚❚</button>`
          : `<button type="button" class="tk-btn" data-act="play" aria-label="${esc(t("tk.play"))}" ${busy || pending || comboBusy || (back !== alt && !combo) ? "disabled" : ""}>▶</button>`}
        <button type="button" class="tk-btn" data-act="restart" aria-label="${esc(t("tk.restart"))}">⟲</button>
        <span class="tk-phase">${state ? esc(phaseLabel(state)) : ""}</span>
        <span class="tk-bar"><i style="width:${(100 * t0 / Math.max(simEnd(), 1)).toFixed(2)}%"></i></span>
        <span class="tk-clock">T+${hms(t0)} / ${hms(simEnd())}</span>
        <button type="button" class="tk-pov" data-act="pov" aria-pressed="${follow}" title="${esc(t("tk.povHint"))}">${esc(t(follow ? "tk.povOn" : "tk.pov"))}</button>
        <label class="tk-select">${esc(t("tk.speed"))}<select data-act="speed">${SPEEDS.map((v) => `<option value="${v}" ${v === speed ? "selected" : ""}>×${v}</option>`).join("")}</select></label>
      </div>
      ${response.alternatives.length > 1 ? `<div class="tk-row tk-legs">${legPicker("outbound")}${legPicker("return")}${t0 > 0 ? `<small>${esc(t("tk.legsLocked"))}</small>` : ""}${comboNote()}</div>` : ""}
      <div class="tk-row tk-events">
        <span>${esc(t("tk.event"))}</span>
        <select data-act="delay" aria-label="${esc(t("tk.delayMinutes"))}">${DELAYS_MIN.map((v) => `<option value="${v}" ${v === delayMin ? "selected" : ""}>+${v} min</option>`).join("")}</select>
        <button type="button" class="tk-event" data-act="event" ${busy || pending || abort || state?.done ? "disabled" : ""}>${esc(t(busy ? "tk.evaluating" : "tk.delay"))}</button>
        ${totalDelay() ? `<small>${esc(t("tk.totalDelay", { t: duration(totalDelay()) }))}</small>` : ""}
        ${decided && !pending ? `<small class="tk-decided">${esc(t("tk.decided", { option: t(`tk.option.${decided.id}`), margin: duration(decided.response.options.find((o) => o.id === decided!.id)?.metrics.mission_margin_s ?? null) }))}</small>` : ""}
      </div>
      <div class="tk-environment">${simulationEnvironment(alt, response, t0)}</div>
      ${error ? `<p class="tk-error" role="alert">${esc(error)}</p>` : ""}
      ${pending ? `<section class="tk-eval" role="status">
        <p>${esc(t("tk.evalIntro", { delay: duration(pendingAt?.added ?? 0), elapsed: duration(pending.elapsed_at_event_s) }))}</p>
        <div class="tk-options">${pending.options.map((o) => optionCard(o, o.id === pending!.recommendation.option_id)).join("")}</div>
        <p class="tk-note">${esc(tOr(`tk.reason.${pending.recommendation.reason}`, pending.recommendation.reason))} ${esc(t("tk.decisionYours"))}</p>
      </section>` : ""}`;
  }

  root.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const act = target.closest<HTMLElement>("[data-act]")?.dataset.act;
    const choice = target.closest<HTMLElement>("[data-decide]")?.dataset.decide as "continue" | "return_now" | undefined;
    if (choice) { decide(choice); return; }
    if (act === "open") { open = true; restart(false); render(); update(); }
    else if (act === "close") { open = false; restart(false); render(); place(null); }
    else if (act === "play") play();
    else if (act === "pause") pause();
    else if (act === "restart") { restart(); render(); }
    else if (act === "event") void delayEvent();
    else if (act === "pov") { follow = !follow; heading = null; if (!follow) release(); render(); update(); }
  });
  root.addEventListener("change", (e) => {
    const target = e.target as HTMLSelectElement;
    if (target.dataset.act === "speed") speed = Number(target.value);
    if (target.dataset.act === "delay") delayMin = Number(target.value);
    if ((target.dataset.act === "leg-outbound" || target.dataset.act === "leg-return") && response) {
      const chosen = response.alternatives.find((a) => a.id === target.value);
      if (!chosen || !legsUsable(chosen)) return;
      if (target.dataset.act === "leg-outbound") alt = chosen; else back = chosen;
      restart(false); buildPlan(); hooks.onLegs?.(alt!.id, back!.id); void evaluateCombo(); update();
    }
  });
  const relabel = () => { marker.label!.text = new Cesium.ConstantProperty(t("tk.marker")); };
  relabel();
  onLanguageChange(() => { relabel(); render(); update(); });

  const legsUsable = (a: Alternative) => a.outbound.status === "found" && a.return.status === "found" && a.metrics.outbound_s !== null &&
    a.metrics.return_s !== null && a.outbound.xy_m.length > 1 && a.return.xy_m.length > 0;
  /** Timeline: outbound + tasks of `alt`, return of `back` (same tasks for every alternative). */
  function buildPlan() {
    if (!alt || !back) { plan = []; return; }
    const out = moveOf("outbound", alt.outbound.xy_m, alt.metrics.outbound_s!);
    const ret = moveOf("return", back.return.xy_m, back.metrics.return_s!);
    dOutProfile = out.cum[out.cum.length - 1];
    const o = alt.metrics.outbound_s!, k = alt.metrics.tasks_s;
    plan = [{ ...out, start: 0 }, { kind: "tasks", dur: k, start: o }, { ...ret, start: o + k }];
  }

  return {
    /** Follow one calculated alternative (both legs); any running simulation restarts. */
    load(r: PlanResponse, alternativeId: string | null) {
      const chosen = r.alternatives.find((a) => a.id === alternativeId) ?? r.alternatives[0] ?? null;
      response = null; alt = null; back = null; combo = null; comboBusy = false; plan = []; restart(false);
      if (chosen && r.geographic_adapter && legsUsable(chosen)) { response = r; alt = back = chosen; buildPlan(); }
      render(); update();
    },
    clear() { response = null; alt = null; back = null; combo = null; plan = []; restart(false); open = false; follow = false; release(); render(); place(null); },
  };
}
