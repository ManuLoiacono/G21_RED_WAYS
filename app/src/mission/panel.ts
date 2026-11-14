import { onLanguageChange, t, tOr } from "../i18n";
import { esc } from "../ui/format";
import { infoButton } from "../provenance/sources";
import { loadMetadata, requestPlan, type ServiceMetadata } from "./api";
import type { PlanRequest, PlanResponse } from "./draft";
import { baselineRequest, RequestGate } from "./request";

export interface PlanResponseEvent { response: PlanResponse }
export interface MissionPanel {
  selectDestination(id: string): string | null;
  onChange(cb: (request: Readonly<PlanRequest>) => void): void;
  onStale(cb: () => void): void;
  getRequest(): PlanRequest | null;
  getSlopeLimit(): number;
  setCollapsed(value: boolean): void;
}
export const templateLabel = (id: string) => tOr(`nav.template.${id}`, id);

export function createMissionPanel(root: HTMLElement): MissionPanel {
  let metadata: ServiceMetadata | null = null;
  let state: PlanRequest | null = null;
  let collapsed = false;
  let busy = false;
  let loading = true;
  let error = "";
  let statusKey: "nav.ready" | "mp.status.calculating" | "mp.status.received" | "mp.status.stale" | "mp.status.discarded" = "nav.ready";
  const gate = new RequestGate();
  let activeRequest: PlanRequest | null = null;
  const staleListeners: (() => void)[] = [];
  const listeners: ((request: Readonly<PlanRequest>) => void)[] = [];
  const invalid = new Map<string, string>();

  function render() {
    root.classList.toggle("collapsed", collapsed);
    root.innerHTML = `
      <header class="mp-head"><h2>${esc(t("mp.title"))}</h2>
        <button type="button" data-act="collapse" aria-expanded="${!collapsed}" aria-label="${esc(t(collapsed ? "mp.show" : "mp.hide"))}">${collapsed ? "+" : "−"}</button></header>
      <form class="mp-body" novalidate>
        ${state && metadata ? form(state, metadata) : `<p>${esc(t(loading ? "nav.connecting" : "nav.noMetadata"))}</p>`}
        <p class="mp-status" role="status" aria-live="polite" data-kind="${error ? "error" : "info"}">${esc(error || t(statusKey))}</p>
        ${!state && !loading ? `<button type="button" data-act="connect">${esc(t("status.retry"))}</button>` : ""}
      </form>`;
    for (const [name, value] of invalid) {
      const input = root.querySelector<HTMLInputElement>(`[name="${name}"]`);
      if (input) { input.value = value; input.setAttribute("aria-invalid", "true"); }
    }
    preview();
  }
  function form(s: PlanRequest, m: ServiceMetadata) {
    return `
      <p class="mp-note">${esc(t("nav.synthetic"))} ${infoButton("navigation_draft", t("nav.provenance"))}</p>
      <fieldset><legend>${esc(t("mp.mission"))}</legend>
        <label>${esc(t("mp.family"))}<select name="template">${m.catalogs.mission_templates.templates.map((v) =>
          `<option value="${esc(v.id)}" ${v.id === s.mission.template_id ? "selected" : ""}>${esc(templateLabel(v.id))}</option>`).join("")}</select></label>
        <label>${esc(t("mp.departFrom"))}<select name="origin">${poiOptions(s.origin.poi_id)}</select></label>
        <label>${esc(t("mp.destination"))}<select name="destination">${poiOptions(s.destination.poi_id)}</select></label>
        <p class="mp-hint">${esc(t("nav.locations"))}</p>
      </fieldset>
      <fieldset><legend>${esc(t("mp.tasks"))}</legend>
        ${s.mission.tasks.map((task, i) => `<label>${esc(tOr(`nav.task.${task.id}`, task.id))} (s)
          <input name="task-${i}" type="number" min="0" step="1" value="${task.duration_s}" /></label>`).join("")}
      </fieldset>
      <fieldset><legend>${esc(t("mp.schedule"))}</legend>
        <label>${esc(t("nav.departureUtc"))}<input name="departure" type="datetime-local" step="1" value="${s.mission.departure_utc.replace("Z", "")}" /></label>
        <div class="mp-grid">
          <label>${esc(t("nav.reserve"))}<input name="reserve" type="number" min="0" step="1" value="${s.mission.reserve_s}" /></label>
          <label>${esc(t("nav.budget"))}<input name="budget" type="number" min="0.001" step="1" value="${s.mission.time_budget_s}" /></label>
        </div>
        <p class="mp-hint">${esc(t("nav.clock"))}</p>
      </fieldset>
      <p class="mp-hint">${esc(t("nav.unsupported"))}</p>
      <div class="mp-actions"><button type="button" data-act="reset">${esc(t("mp.reset"))}</button>
        <button type="submit" class="mp-primary" ${busy ? "disabled" : ""}>${esc(t("mp.submit"))}</button></div>
      <details class="mp-json"><summary>${esc(t("mp.json"))}</summary><pre></pre></details>`;
  }
  function poiOptions(selected: string) {
    return metadata!.parcel.pois.map((p) => `<option value="${esc(p.id)}" ${p.id === selected ? "selected" : ""}>${esc(tOr(`nav.poi.${p.id}`, p.id))} [${p.xy_m.join(", ")} m]</option>`).join("");
  }
  function preview() {
    if (!state) return;
    state.revision = gate.revision;
    const pre = root.querySelector("pre");
    if (pre) pre.textContent = JSON.stringify(state, null, 2);
    Object.assign(window, { lastPlanRequest: structuredClone(state) });
    listeners.forEach((cb) => cb(state!));
  }
  function edited() {
    gate.edit();
    busy = false;
    activeRequest = null;
    error = "";
    statusKey = "mp.status.stale";
    Object.assign(window, { lastPlanResponse: null });
    staleListeners.forEach((cb) => cb());
    const submit = root.querySelector<HTMLButtonElement>('[type="submit"]');
    if (submit) submit.disabled = false;
    const status = root.querySelector(".mp-status");
    if (status) status.textContent = t(statusKey);
    preview();
  }
  async function connect() {
    loading = true; error = ""; render();
    const result = await loadMetadata();
    loading = false;
    if (result.ok) {
      metadata = result.data;
      try { state = baselineRequest(metadata); }
      catch { error = t("nav.noMetadata"); }
    } else error = result.error;
    render();
  }
  root.addEventListener("input", (event) => {
    const el = event.target as HTMLInputElement | HTMLSelectElement;
    if (!state || !metadata || !el.name) return;
    edited(); // Invalid and reverted edits also invalidate pending work.
    if (el.name === "template") {
      const template = metadata.catalogs.mission_templates.templates.find((v) => v.id === el.value)!;
      Object.assign(state.mission, { template_id: template.id, tasks: structuredClone(template.tasks), reserve_s: template.reserve_s, time_budget_s: template.time_budget_s });
      invalid.clear(); render();
    } else if (el.name === "destination" || el.name === "origin") {
      state[el.name].poi_id = el.value;
    } else if (el.name === "departure") {
      if (!el.value || !Number.isFinite(Date.parse(el.value + "Z"))) invalid.set(el.name, el.value);
      else { state.mission.departure_utc = new Date(el.value + "Z").toISOString().replace(".000Z", "Z"); invalid.delete(el.name); }
    } else {
      const v = Number(el.value);
      const valid = el.value !== "" && Number.isFinite(v) && v >= 0 && (el.name !== "budget" || v > 0);
      el.setAttribute("aria-invalid", String(!valid));
      if (!valid) invalid.set(el.name, el.value);
      else {
        invalid.delete(el.name);
        if (el.name.startsWith("task-")) state.mission.tasks[Number(el.name.slice(5))].duration_s = v;
        else if (el.name === "reserve") state.mission.reserve_s = v;
        else if (el.name === "budget") state.mission.time_budget_s = v;
      }
    }
    preview();
  });
  root.addEventListener("click", (event) => {
    const act = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-act]")?.dataset.act;
    if (act === "collapse") api.setCollapsed(!collapsed);
    if (act === "connect") void connect();
    if (act === "reset" && metadata) { edited(); state = baselineRequest(metadata); invalid.clear(); render(); }
  });
  root.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state || busy) return;
    if (invalid.size) { error = t("mp.status.invalid"); render(); return; }
    const request = gate.submit(state);
    activeRequest = request;
    error = ""; busy = true; statusKey = "mp.status.calculating"; render();
    Object.assign(window, { lastPlanRequest: structuredClone(request) });
    const result = await requestPlan(request);
    if (activeRequest !== request) return;
    busy = false; activeRequest = null;
    if (!result.ok) { error = result.error; staleListeners.forEach((cb) => cb()); render(); return; }
    if (!gate.accepts(request, result.data, state)) { statusKey = "mp.status.discarded"; render(); return; }
    statusKey = "mp.status.received"; render();
    Object.assign(window, { lastPlanResponse: result.data });
    root.dispatchEvent(new CustomEvent<PlanResponseEvent>("plan-response", { detail: { response: result.data }, bubbles: true }));
  });
  const api: MissionPanel = {
    selectDestination(id) {
      if (!state || !metadata?.parcel.pois.some((p) => p.id === id)) return t("nav.locations");
      edited(); state.destination.poi_id = id; render(); return null;
    },
    onChange(cb) { listeners.push(cb); if (state) cb(state); },
    onStale(cb) { staleListeners.push(cb); },
    getRequest: () => state ? structuredClone(state) : null,
    getSlopeLimit() {
      if (!metadata || !state) return Infinity;
      return Math.min(...[...state.team.humans, ...state.team.robots].map((p) => p.mission_overrides?.max_ascent_deg ??
        metadata!.catalogs.catalog.entries.find((e) => e.identity.profile_id === p.profile_id)!.defaults.max_ascent_deg));
    },
    setCollapsed(value) { collapsed = value; render(); },
  };
  onLanguageChange(render);
  void connect();
  return api;
}
