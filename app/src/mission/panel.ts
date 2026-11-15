import { onLanguageChange, t, tOr, type MessageKey } from "../i18n";
import { esc } from "../ui/format";
import { infoButton } from "../provenance/sources";
import { loadMetadata, loadParcel, requestPlan, type ServiceMetadata } from "./api";
import type { CatalogEntry, Member, Parameters, Parcel, PlanRequest, PlanResponse } from "./draft";
import { baselineRequest, RequestGate } from "./request";
import { KG_TO_LB, TEAM_FIXTURE } from "./teamFixture";
import { fromHhMm, toHhMm } from "./time";
import { familyIcon, ICONS, memberIcon } from "./icons";

/**
 * "New mission" wizard (replaces the single "Plan mission" form). Five steps:
 * Mission → Team → Tasks → Schedule → Summary. It is a presentation layer over the same
 * PlanRequest state and request logic (RequestGate, invalidation on edit, stale responses
 * discarded); no new fields are sent to the engine. Durations are shown as hh:mm and sent in
 * seconds. Fictional personal data on the team cards never leaves the UI.
 */
export interface PlanResponseEvent { response: PlanResponse }
export interface MissionPanel {
  selectDestination(id: string): string | null;
  onChange(cb: (request: Readonly<PlanRequest>) => void): void;
  onStale(cb: () => void): void;
  /** Called when the registered points should be shown (wizard open on the Mission step) or hidden. */
  onPointsPreview(cb: (visible: boolean) => void): void;
  /** Called with true while the full-screen wizard hides the scene (steps 2–5), false otherwise. */
  onCoverScene(cb: (covered: boolean) => void): void;
  getRequest(): PlanRequest | null;
  getParcel(): Parcel | null;
  getSlopeLimit(): number;
  setCollapsed(value: boolean): void;
}
export const templateLabel = (id: string) => tOr(`nav.template.${id}`, id);

const PARAMETER_KEYS: (keyof Parameters)[] = ["flat_speed_m_s", "max_ascent_deg", "max_descent_deg", "carrying_limit_kg", "max_sortie_s"];
const STEPS = ["mission", "team", "tasks", "schedule", "summary"] as const;
type Step = 0 | 1 | 2 | 3 | 4;
const MAX_HUMANS = 4;
const MAX_ROBOTS = 2;
const MAX_TASKS = 64;
type StatusKey = "nav.ready" | "mp.status.calculating" | "mp.status.received" | "mp.status.stale" | "mp.status.discarded";

export function createMissionPanel(root: HTMLElement): MissionPanel {
  let metadata: ServiceMetadata | null = null;
  let parcelLoadSequence = 0;
  let state: PlanRequest | null = null;
  let loading = true;
  let busy = false;
  let error = "";
  let statusKey: StatusKey = "nav.ready";
  let open = false;
  let step: Step = 0;
  let maxVisited: Step = 0;
  let hasResult = false;
  let showHonesty = false;
  let peekMap = false;
  /** Direction of the last step change, used once for the slide-in animation. */
  let animDir: "next" | "prev" | "" = "";
  const editing = new Set<string>();
  /** Display names of user-added tasks (UI only; the engine receives generated ids). */
  const taskNames = new Map<string, string>();
  /** Field name → raw text of values that are currently invalid. */
  const invalid = new Map<string, string>();
  const gate = new RequestGate();
  let activeRequest: PlanRequest | null = null;
  const staleListeners: (() => void)[] = [];
  const listeners: ((request: Readonly<PlanRequest>) => void)[] = [];
  const previewListeners: ((visible: boolean) => void)[] = [];
  const coverListeners: ((covered: boolean) => void)[] = [];
  let lastCovered = false;

  const wizard = document.createElement("div");
  wizard.id = "missionWizard";
  wizard.setAttribute("role", "dialog");
  wizard.setAttribute("aria-labelledby", "wzTitle");
  wizard.hidden = true;
  document.body.appendChild(wizard);

  // ---------- helpers ----------
  const catalogEntry = (id: string) => metadata!.catalogs.catalog.entries.find((e) => e.identity.profile_id === id)!;
  const members = (s: PlanRequest) => [...s.team.humans, ...s.team.robots];
  const effective = (m: Member, key: keyof Parameters) => m.mission_overrides?.[key] ?? catalogEntry(m.profile_id).defaults[key];
  const poiName = (id: string) => tOr(`nav.poi.${id}`, id);
  const taskName = (id: string) => taskNames.get(id) ?? tOr(`nav.task.${id}`, id);
  const num = (v: number, digits = 2) => Number(v.toFixed(digits)).toLocaleString(document.documentElement.lang || undefined);
  const tag = (kind: "assumed" | "derived" | "fictional") => `<span class="wz-tag" data-kind="${kind}">${esc(t(`wizard.tag.${kind}`))}</span>`;
  const paramText = (key: keyof Parameters, value: number) => key === "max_sortie_s" ? toHhMm(value) : num(value);
  const paramUnit = (key: keyof Parameters) => ({ flat_speed_m_s: "m/s", max_ascent_deg: "°", max_descent_deg: "°", carrying_limit_kg: "kg", max_sortie_s: "" })[key];

  function distanceM(s: PlanRequest): number | null {
    const a = metadata?.parcel.pois.find((p) => p.id === s.origin.poi_id);
    const b = metadata?.parcel.pois.find((p) => p.id === s.destination.poi_id);
    return a && b ? Math.hypot(a.xy_m[0] - b.xy_m[0], a.xy_m[1] - b.xy_m[1]) : null;
  }
  function limits(s: PlanRequest) {
    const team = members(s);
    const minOf = (key: keyof Parameters) => {
      const value = Math.min(...team.map((m) => effective(m, key)));
      return { value, by: team.filter((m) => effective(m, key) === value).map((m) => m.profile_id) };
    };
    return team.length ? { pace: minOf("flat_speed_m_s"), up: minOf("max_ascent_deg"), down: minOf("max_descent_deg") } : null;
  }
  const tasksTotal = (s: PlanRequest) => s.mission.tasks.reduce((sum, task) => sum + task.duration_s, 0);
  function advancedModified(s: PlanRequest) {
    const d = metadata!.parcel.planning_defaults;
    const parcel = metadata!.health.default_parcel;
    return s.parcel.id !== parcel.id || s.parcel.version !== parcel.version || s.scenario.id !== d.scenario.id || s.scenario.as_of_utc !== d.scenario.as_of_utc;
  }

  // ---------- validation by step ----------
  function stepErrors(i: Step, s: PlanRequest): string[] {
    const errs: string[] = [];
    const fieldsInvalid = (prefixes: string[]) => [...invalid.keys()].some((k) => prefixes.some((p) => k.startsWith(p)));
    if (i === 0) {
      if (!s.mission.template_id) errs.push(t("wizard.mission.family"));
      if (s.origin.poi_id === s.destination.poi_id) errs.push(t("wizard.mission.sameplace"));
    } else if (i === 1) {
      if (!s.team.humans.length) errs.push(t("wizard.team.minHuman"));
      if (s.team.humans.length > MAX_HUMANS || s.team.robots.length > MAX_ROBOTS) errs.push(t("wizard.team.max"));
      if (fieldsInvalid(["payload:", "override:"])) errs.push(t("mp.status.invalid"));
    } else if (i === 2) {
      if (s.mission.tasks.length > MAX_TASKS) errs.push(t("wizard.tasks.max"));
      if (fieldsInvalid(["task-", "tname-"])) errs.push(t("mp.status.invalid"));
    } else if (i === 3) {
      if (fieldsInvalid(["departure", "as-of", "reserve", "budget"])) errs.push(t("mp.status.invalid"));
    } else {
      for (const j of [0, 1, 2, 3] as Step[]) if (stepErrors(j, s).length) errs.push(t("wizard.summary.invalidStep", { step: t(`wizard.step.${STEPS[j]}`) }));
    }
    return errs;
  }

  // ---------- rendering ----------
  function renderLauncher() {
    root.classList.add("mp-launcher");
    root.classList.remove("collapsed");
    if (!state || !metadata) {
      root.innerHTML = `<p class="mp-status" role="status" data-kind="${error ? "error" : "info"}">${esc(error || t(loading ? "nav.connecting" : "nav.noMetadata"))}</p>
        ${!loading ? `<button type="button" data-act="connect">${esc(t("status.retry"))}</button>` : ""}`;
      return;
    }
    root.innerHTML = hasResult
      ? `<div class="wz-launch"><button type="button" class="wz-new" data-act="edit">${esc(t("wizard.edit"))}</button>
         <button type="button" class="wz-new wz-secondary" data-act="new">${esc(t("wizard.open"))}</button></div>`
      : `<div class="wz-launch"><button type="button" class="wz-new" data-act="open">${esc(t("wizard.open"))}</button></div>`;
  }

  function render() {
    renderLauncher();
    wizard.hidden = !open || !state || !metadata;
    wizard.classList.toggle("wz-side", step === 0);
    wizard.classList.toggle("wz-peek", peekMap);
    notifyPreview();
    if (wizard.hidden) { preview(); return; }
    const s = state!;
    const scroll = wizard.querySelector(".wz-body")?.scrollTop ?? 0;
    const openAdvanced = new Set(Array.from(wizard.querySelectorAll<HTMLDetailsElement>("details[open][data-adv]"), (d) => d.dataset.adv));
    const errs = stepErrors(step, s);
    wizard.innerHTML = `
      <header class="wz-head">
        <h2 id="wzTitle" tabindex="-1">${esc(t("wizard.open"))} · ${esc(templateLabel(s.mission.template_id))}</h2>
        <ol class="wz-stepper">${STEPS.map((name, i) => {
          const status = i === step ? "current" : stepErrors(i as Step, s).length && i <= maxVisited ? "error" : i <= maxVisited ? "complete" : "pending";
          return `<li><button type="button" data-goto="${i}" data-status="${status}" ${i > maxVisited ? "disabled" : ""} ${i === step ? 'aria-current="step"' : ""}>
            <span class="wz-num">${i + 1}</span><span class="wz-name">${esc(t(`wizard.step.${name}`))}</span></button></li>`;
        }).join("")}</ol>
        <div class="wz-progress" aria-hidden="true"><span style="width:${(100 * step / (STEPS.length - 1)).toFixed(1)}%"></span></div>
        <button type="button" class="wz-close" data-act="close" aria-label="${esc(t("wizard.close"))}" title="${esc(t("wizard.close"))}">×</button>
      </header>
      <div class="wz-main">
        <form class="wz-body" novalidate data-anim="${animDir}">${stepHeader(step)}${[missionStep, teamStep, tasksStep, scheduleStep, summaryStep][step](s)}</form>
        ${step >= 1 && step <= 3 ? `<aside class="wz-live" aria-live="polite">${liveSummary(s)}</aside>` : ""}
      </div>
      <footer class="wz-foot">
        ${errs.length && step !== 4 ? `<p class="wz-errors" role="alert">${errs.map(esc).join(" · ")}</p>` : ""}
        <div class="wz-nav">
          ${step > 0 ? `<button type="button" data-act="back">${esc(t("wizard.back"))}</button>` : "<span></span>"}
          ${step < 4
            ? `<button type="button" class="mp-primary" data-act="next" ${errs.length ? "disabled" : ""}>${esc(t("wizard.next"))}</button>`
            : `<button type="button" class="mp-primary" data-act="calculate" ${errs.length || busy ? "disabled" : ""}>${esc(t("wizard.calculate"))}</button>`}
        </div>
        <div class="wz-honesty">
          <span>${esc(t(metadata!.parcel.geographic_adapter ? "wizard.honesty.strip" : "wizard.honesty.stripSynthetic"))}</span>
          <button type="button" class="wz-info" data-act="honesty" aria-expanded="${showHonesty}" aria-label="${esc(t("wizard.honesty.more"))}" title="${esc(t("wizard.honesty.more"))}">ⓘ</button>
        </div>
        ${showHonesty ? `<div class="wz-honesty-full">
          <p>${esc(t(metadata!.parcel.geographic_adapter ? "nav.realTerrain" : "nav.synthetic"))}</p>
          <p>${esc(t("nav.unsupported"))}</p><p>${esc(t("nav.clock"))}</p><p>${esc(t("nav.locations"))}</p>
          <p>${esc(t("wizard.team.fictionalNote"))} ${infoButton("navigation_draft", t("nav.provenance"))}</p></div>` : ""}
      </footer>
      ${peekMap ? `<button type="button" class="wz-peek-back" data-act="peek">${esc(t("wizard.mapBack"))}</button>` : ""}`;
    for (const [name, value] of invalid) {
      const input = wizard.querySelector<HTMLInputElement>(`[name="${name}"]`);
      if (input) { input.value = value; input.setAttribute("aria-invalid", "true"); }
    }
    wizard.querySelectorAll<HTMLDetailsElement>("details[data-adv]").forEach((d) => { if (openAdvanced.has(d.dataset.adv)) d.open = true; });
    const body = wizard.querySelector(".wz-body");
    if (body && !animDir) body.scrollTop = scroll;
    animDir = "";
    preview();
  }

  function stepHeader(i: Step) {
    const icons = [ICONS.route, ICONS.team, ICONS.tasks, ICONS.clock, ICONS.check];
    return `<div class="wz-step-head"><span class="wz-step-icon">${icons[i]}</span><div>
      <p class="wz-eyebrow">${esc(t("wizard.stepOf", { n: i + 1, total: STEPS.length }))}</p>
      <h3>${esc(t(`wizard.step.${STEPS[i]}`))}</h3><p class="wz-lead">${esc(t(`wizard.lead.${STEPS[i]}`))}</p></div></div>`;
  }

  function timeBar(s: PlanRequest) {
    const tasks = tasksTotal(s);
    const reserve = s.mission.reserve_s;
    const budget = s.mission.time_budget_s;
    const scale = Math.max(budget, tasks + reserve, 1);
    const over = tasks + reserve > budget;
    const pct = (v: number) => `${(100 * Math.max(v, 0) / scale).toFixed(2)}%`;
    return `<div class="wz-bar ${over ? "over" : ""}" role="img" aria-label="${esc(t("wizard.summary.legend", { tasks: toHhMm(tasks), reserve: toHhMm(reserve), budget: toHhMm(budget) }))}">
        <span class="seg-tasks" style="width:${pct(tasks)}"></span><span class="seg-reserve" style="width:${pct(reserve)}"></span>
        ${over ? `<i class="seg-budget" style="left:${pct(budget)}"></i>` : `<span class="seg-free" style="width:${pct(budget - tasks - reserve)}"></span>`}</div>
      <p class="wz-legend"><span class="dot tasks"></span>${esc(t("wizard.live.tasks"))} ${toHhMm(tasks)} <span class="dot reserve"></span>${esc(t("wizard.live.reserve"))} ${toHhMm(reserve)} <span class="dot free"></span>${esc(t("wizard.live.budget"))} ${toHhMm(budget)}</p>`;
  }

  /** Compact, always-current view of the mission while editing steps 2–4 (desktop side column). */
  function liveSummary(s: PlanRequest) {
    const d = distanceM(s);
    const lim = limits(s);
    const chips = members(s).map((m) => {
      const e = catalogEntry(m.profile_id);
      return `<span class="wz-chip" data-kind="${e.kind}">${memberIcon(e.kind, m.profile_id)}${esc(e.identity.name.split(" ")[0])}</span>`;
    }).join("");
    return `<p class="wz-eyebrow">${esc(t("wizard.live.title"))}</p>
      <div class="wz-live-family"><span class="wz-live-icon">${familyIcon(s.mission.template_id)}</span><strong>${esc(templateLabel(s.mission.template_id))}</strong></div>
      <p class="wz-live-route">${esc(poiName(s.origin.poi_id))} <span>→</span> ${esc(poiName(s.destination.poi_id))}${d === null ? "" : ` <small>≈ ${num(d, 0)} m</small>`}</p>
      <div class="wz-live-team">${chips || `<span class="wz-warn">${esc(t("wizard.team.minHuman"))}</span>`}</div>
      ${lim ? `<p class="wz-live-pace">${esc(t("wizard.live.pace", { speed: `${num(lim.pace.value)} m/s`, slope: `${num(Math.min(lim.up.value, lim.down.value))}°` }))}</p>` : ""}
      ${timeBar(s)}`;
  }

  function missionStep(s: PlanRequest) {
    const m = metadata!;
    const d = distanceM(s);
    const poiOptions = (selected: string) => m.parcel.pois.map((p) =>
      `<option value="${esc(p.id)}" ${p.id === selected ? "selected" : ""}>${esc(poiName(p.id))} · ${esc(t("wizard.hypothetical"))}</option>`).join("");
    return `
      <div class="wz-grid2">
        <label>${esc(t("mp.departFrom"))}<select name="origin">${poiOptions(s.origin.poi_id)}</select></label>
        <label>${esc(t("mp.destination"))}<select name="destination">${poiOptions(s.destination.poi_id)}</select></label>
      </div>
      <p class="wz-derived" data-derived="distance">${d === null ? "" : `${esc(t("wizard.mission.distance", { m: num(d, 0) }))} ${tag("derived")}`}</p>
      ${s.origin.poi_id === s.destination.poi_id ? `<p class="wz-warn">${esc(t("wizard.mission.sameplace"))}</p>` : ""}
      <button type="button" class="wz-peek-btn" data-act="peek">${esc(t("wizard.mapPeek"))}</button>
      <fieldset class="wz-families"><legend>${esc(t("mp.family"))}</legend>
        ${m.catalogs.mission_templates.templates.map((v) => `<button type="button" class="wz-family" data-family="${esc(v.id)}" aria-pressed="${v.id === s.mission.template_id}">
          <span class="wz-family-icon">${familyIcon(v.id)}</span><span class="wz-family-text"><strong>${esc(templateLabel(v.id))}</strong><small>${esc(tOr(`wizard.family.${v.id}`, ""))}</small></span>
          <span class="wz-check">${ICONS.check}</span></button>`).join("")}
      </fieldset>
      <details data-adv="mission" class="wz-adv"><summary>${esc(t("wizard.advanced"))}${advancedModifiedBadge(s.parcel.id !== m.health.default_parcel.id || s.parcel.version !== m.health.default_parcel.version)}</summary>
        <label>${esc(t("nav.parcel"))}<select name="parcel">${m.health.registered_parcels.map((p, i) =>
          `<option value="${i}" ${p.id === s.parcel.id && p.version === s.parcel.version ? "selected" : ""}>${esc(p.id)} · ${esc(p.version)} · ${esc(t(p.fixture ? "nav.syntheticMode" : "nav.galeMode"))}</option>`).join("")}</select></label>
        <p class="mp-hint">${esc(t("wizard.mission.parcelWarn"))}</p>
      </details>`;
  }
  const advancedModifiedBadge = (modified: boolean) => modified ? ` <span class="wz-tag" data-kind="modified">${esc(t("wizard.advanced.modified"))}</span>` : "";

  function teamStep(s: PlanRequest) {
    const lim = limits(s);
    const team = members(s);
    const entries = metadata!.catalogs.catalog.entries;
    const limitedBy = lim && team.length > 1 ? [...new Set([...lim.pace.by, ...lim.up.by, ...lim.down.by])] : [];
    const chips = team.map((m) => {
      const e = catalogEntry(m.profile_id);
      return `<span class="wz-chip wz-chip-x" data-kind="${e.kind}">${memberIcon(e.kind, m.profile_id)}${esc(e.identity.name)}
        <button type="button" data-act="remove-member" data-member="${esc(m.profile_id)}" aria-label="${esc(t("wizard.team.remove", { name: e.identity.name }))}" title="${esc(t("wizard.team.remove", { name: e.identity.name }))}">×</button></span>`;
    }).join("");
    const section = (kind: "human" | "robot") => {
      const list = entries.filter((e) => e.kind === kind);
      const chosen = kind === "human" ? s.team.humans.length : s.team.robots.length;
      const max = kind === "human" ? MAX_HUMANS : MAX_ROBOTS;
      return `<section class="wz-team-section" data-kind="${kind}">
        <h4>${esc(t(kind === "human" ? "wizard.team.humans" : "wizard.team.robots", { n: chosen, max }))}
          <span class="wz-team-tags">${tag("assumed")}${tag("fictional")}</span></h4>
        <div class="wz-cards" data-kind="${kind}">${list.map((e) => card(e, s, lim, team.length)).join("")}</div></section>`;
    };
    return `
      <div class="wz-team-bar">
        <div class="wz-team-bar-head"><strong>${esc(t("wizard.team.selected", { n: team.length }))}</strong>
          ${lim ? `<span class="wz-team-limits">${esc(t("wizard.team.summary", { speed: `${num(lim.pace.value)} m/s`, slopeUp: `${num(lim.up.value)}°`, slopeDown: `${num(lim.down.value)}°` }))}
            ${limitedBy.length ? ` · ${esc(t("wizard.summary.limiting", { name: limitedBy.map((id) => catalogEntry(id).identity.name).join(", ") }))}` : ""}</span>` : ""}</div>
        <div class="wz-live-team">${chips || `<span class="wz-warn">${esc(t("wizard.team.minHuman"))}</span>`}</div>
      </div>
      ${section("human")}
      ${section("robot")}
      ${team.length ? `<section class="wz-team-section wz-team-settings"><h4>${esc(t("wizard.team.settings"))}</h4>
        <ul class="wz-settings">${team.map((m) => settingsRow(m)).join("")}</ul></section>` : ""}`;
  }

  /** Compact, selection-only card: avatar, name, one fictional line and the five parameters. */
  function card(entry: CatalogEntry, s: PlanRequest, lim: ReturnType<typeof limits>, count: number) {
    const id = entry.identity.profile_id;
    const group = entry.kind === "human" ? s.team.humans : s.team.robots;
    const selected = group.find((p) => p.profile_id === id);
    const full = !selected && group.length >= (entry.kind === "human" ? MAX_HUMANS : MAX_ROBOTS);
    const fx = TEAM_FIXTURE[id];
    const personal = !fx ? "" : fx.kind === "human"
      ? [t("wizard.person.age", { v: fx.age_years }), t("wizard.person.height", { v: num(fx.height_m) }), t("wizard.person.mass", { kg: fx.mass_kg, lb: Math.round(fx.mass_kg * KG_TO_LB) })].join(" · ")
      : [t("wizard.robot.mass", { kg: fx.mass_kg, lb: Math.round(fx.mass_kg * KG_TO_LB) }), t("wizard.robot.size", { l: num(fx.length_m), w: num(fx.width_m) }), t(`wizard.robot.drive.${fx.drive}`)].join(" · ");
    const limiting = (key: keyof Parameters) => {
      if (!lim || count < 2 || !selected) return null;
      const map: Partial<Record<keyof Parameters, [typeof lim.pace, MessageKey]>> = {
        flat_speed_m_s: [lim.pace, "wizard.team.limits.pace"], max_ascent_deg: [lim.up, "wizard.team.limits.up"], max_descent_deg: [lim.down, "wizard.team.limits.down"] };
      const hit = map[key];
      return hit && hit[0].by.includes(id) ? t(hit[1]) : null;
    };
    const catalogMax = (key: keyof Parameters) => Math.max(...metadata!.catalogs.catalog.entries.map((e) => e.defaults[key]));
    const stats = PARAMETER_KEYS.map((key) => {
      const override = selected?.mission_overrides?.[key];
      const value = override ?? entry.defaults[key];
      const unit = paramUnit(key);
      const shown = `${paramText(key, value)}${unit === "°" ? "°" : unit ? ` ${unit}` : ""}`;
      const lim = limiting(key);
      const full = tOr(`nav.param.${key}`, key).replace(/\s*\([^)]*\)\s*$/, "");
      return `<li class="wz-stat ${lim ? "is-limit" : ""} ${override !== undefined ? "is-edited" : ""}" title="${esc(full + (lim ? ` · ${lim}` : ""))}">
        <span>${esc(t(`wizard.stat.${key}`))}</span><strong>${esc(shown)}</strong>
        <i class="wz-meter" aria-hidden="true"><b style="width:${Math.min(100, (100 * value) / Math.max(catalogMax(key), value, 1e-9)).toFixed(0)}%"></b></i></li>`;
    }).join("");
    return `<article class="wz-card" data-card="${esc(id)}" data-kind="${entry.kind}" role="checkbox" tabindex="${full ? -1 : 0}"
        aria-checked="${!!selected}" aria-disabled="${full}" ${full ? `title="${esc(t("wizard.team.max"))}"` : ""}>
      <span class="wz-check">${ICONS.check}</span>
      <header><span class="wz-avatar">${memberIcon(entry.kind, id)}</span>
        <div><strong>${esc(entry.identity.name)}</strong><small>${esc(t(`nav.${entry.kind}`))}</small></div></header>
      ${personal ? `<p class="wz-personal-line">${esc(personal)}</p>` : ""}
      <ul class="wz-stats" data-selected="${!!selected}">${stats}</ul>
    </article>`;
  }

  /** One row per selected member: assigned payload and, on demand, the five per-mission parameters. */
  function settingsRow(m: Member) {
    const entry = catalogEntry(m.profile_id);
    const id = m.profile_id;
    const isEditing = editing.has(id);
    const fields = PARAMETER_KEYS.map((key) => {
      const base = entry.defaults[key];
      const override = m.mission_overrides?.[key];
      const value = override ?? base;
      const label = `${tOr(`nav.param.${key}`, key).replace(/\s*\([^)]*\)\s*$/, "")} (${key === "max_sortie_s" ? "hh:mm" : paramUnit(key)})`;
      return `<label class="wz-param-field">${esc(label)}
        <input name="override:${esc(id)}:${key}" ${key === "max_sortie_s" ? 'type="text" inputmode="numeric" placeholder="hh:mm"' : 'type="number" min="0" step="any"'} value="${esc(key === "max_sortie_s" ? toHhMm(value) : String(value))}" />
        ${override !== undefined ? `<small>${esc(t("wizard.team.catalog", { value: `${paramText(key, base)} ${paramUnit(key)}` }))}
          <button type="button" class="wz-mini" data-act="restore" data-member="${esc(id)}" data-param="${key}">${esc(t("wizard.team.restore"))}</button></small>` : ""}</label>`;
    }).join("");
    const edited = m.mission_overrides && Object.keys(m.mission_overrides).length;
    return `<li class="wz-setting" data-kind="${entry.kind}">
      <div class="wz-setting-row">
        <span class="wz-setting-name">${memberIcon(entry.kind, id)}${esc(entry.identity.name)}${edited ? `<span class="wz-tag" data-kind="modified">${esc(t("wizard.summary.edited"))}</span>` : ""}</span>
        <label class="wz-payload">${esc(t("nav.payload"))}<input name="payload:${esc(id)}" type="number" min="0" step="any" value="${m.payload_kg}" /></label>
        <button type="button" class="wz-params-btn" data-act="edit-params" data-member="${esc(id)}" aria-expanded="${isEditing}">${ICONS.pencil}<span>${esc(t("wizard.team.paramsBtn"))}</span></button>
      </div>
      ${isEditing ? `<div class="wz-param-grid">${fields}</div>` : ""}
    </li>`;
  }

  function tasksStep(s: PlanRequest) {
    return `
      <p class="wz-derived" data-derived="tasks-total">${esc(t("wizard.tasks.total", { t: toHhMm(tasksTotal(s)) }))} ${tag("derived")}</p>
      <ul class="wz-tasks">${s.mission.tasks.map((task, i) => {
        const fromTemplate = !taskNames.has(task.id);
        return `<li class="wz-task">
          ${fromTemplate ? `<span class="wz-task-name">${esc(taskName(task.id))}</span>`
            : `<label class="wz-task-name">${esc(t("wizard.tasks.name"))}<input name="tname-${i}" type="text" value="${esc(taskNames.get(task.id) ?? "")}" /></label>`}
          <div class="wz-task-time">
            <label for="wz-task-dur-${i}">${esc(t("wizard.tasks.duration"))}</label>
            <div class="wz-task-time-row">
              <input id="wz-task-dur-${i}" name="task-${i}" type="text" inputmode="numeric" placeholder="hh:mm" value="${esc(toHhMm(task.duration_s))}" />
              <button type="button" class="wz-mini" data-act="remove-task" data-index="${i}" aria-label="${esc(t("mp.task.remove", { n: i + 1 }))}">×</button>
            </div>
          </div>
        </li>`;
      }).join("")}</ul>
      <button type="button" data-act="add-task" ${s.mission.tasks.length >= MAX_TASKS ? "disabled" : ""}>${esc(t("wizard.tasks.add"))}</button>`;
  }

  function scheduleStep(s: PlanRequest) {
    const d = metadata!.parcel.planning_defaults;
    return `
      <label>${esc(t("nav.departureUtc"))} <small>${esc(t("wizard.schedule.utc"))}</small>
        <input name="departure" type="datetime-local" step="1" value="${s.mission.departure_utc.replace("Z", "")}" /></label>
      <div class="wz-grid2">
        <label>${esc(t("wizard.schedule.reserve"))}<input name="reserve" type="text" inputmode="numeric" placeholder="hh:mm" value="${toHhMm(s.mission.reserve_s)}" /></label>
        <label>${esc(t("wizard.schedule.budget"))}<input name="budget" type="text" inputmode="numeric" placeholder="hh:mm" value="${toHhMm(s.mission.time_budget_s)}" /></label>
      </div>
      <p class="wz-derived" data-derived="available">${availableLine(s)}</p>
      <details data-adv="schedule" class="wz-adv"><summary>${esc(t("wizard.advanced"))}${advancedModifiedBadge(s.scenario.id !== d.scenario.id || s.scenario.as_of_utc !== d.scenario.as_of_utc)}</summary>
        <label>${esc(t("nav.scenario"))}<select name="scenario">
          ${metadata!.parcel.scenarios.map(({ id }) => `<option value="${id}" ${s.scenario.id === id ? "selected" : ""}>${esc(tOr(`nav.scenario.${id}`, id))}</option>`).join("")}
        </select></label>
        <label>${esc(t("nav.asOfUtc"))}<input name="as-of" type="datetime-local" step="1" value="${s.scenario.as_of_utc.replace("Z", "")}" /></label>
      </details>`;
  }
  function availableLine(s: PlanRequest) {
    const left = s.mission.time_budget_s - s.mission.reserve_s - tasksTotal(s);
    return left < 0
      ? `<span class="wz-over">${esc(t("wizard.schedule.over"))}</span> ${tag("derived")}`
      : `${esc(t("wizard.schedule.available", { t: toHhMm(left) }))} ${tag("derived")}`;
  }

  function summaryStep(s: PlanRequest) {
    const d = distanceM(s);
    const lim = limits(s);
    const names = (ids: string[]) => ids.map((id) => catalogEntry(id).identity.name).join(", ");
    const edited = members(s).some((m) => m.mission_overrides && Object.keys(m.mission_overrides).length);
    const tasks = tasksTotal(s);
    const reserve = s.mission.reserve_s;
    const budget = s.mission.time_budget_s;
    const scale = Math.max(budget, tasks + reserve, 1);
    const over = tasks + reserve > budget;
    const pct = (v: number) => `${(100 * v / scale).toFixed(2)}%`;
    const errs = stepErrors(4, s);
    return `
      <button type="button" class="wz-sum" data-goto="0"><h3>${ICONS.route}${esc(t("wizard.step.mission"))}</h3>
        <p><strong>${esc(templateLabel(s.mission.template_id))}</strong></p>
        <p>${esc(poiName(s.origin.poi_id))} ───▶ ${esc(poiName(s.destination.poi_id))}${d === null ? "" : ` · ${esc(t("wizard.mission.distance", { m: num(d, 0) }))}`} ${tag("derived")}</p></button>
      <button type="button" class="wz-sum" data-goto="1"><h3>${ICONS.team}${esc(t("wizard.step.team"))} (${members(s).length})</h3>
        <p class="wz-live-team">${members(s).map((m) => `<span class="wz-chip" data-kind="${catalogEntry(m.profile_id).kind}">${memberIcon(catalogEntry(m.profile_id).kind, m.profile_id)}${esc(catalogEntry(m.profile_id).identity.name)}</span>`).join("")}</p>
        ${lim ? `<p>${esc(t("wizard.team.summary", { speed: `${num(lim.pace.value)} m/s`, slopeUp: `${num(lim.up.value)}°`, slopeDown: `${num(lim.down.value)}°` }))}
          ${members(s).length > 1 ? ` · ${esc(t("wizard.summary.limiting", { name: names([...new Set([...lim.pace.by, ...lim.up.by, ...lim.down.by])]) }))}` : ""} ${tag("assumed")}</p>` : ""}
        ${edited ? `<p><span class="wz-tag" data-kind="modified">${esc(t("wizard.summary.edited"))}</span></p>` : ""}</button>
      <button type="button" class="wz-sum" data-goto="2"><h3>${ICONS.tasks}${esc(t("wizard.step.tasks"))}</h3>
        <ul>${s.mission.tasks.map((task) => `<li><span>${esc(taskName(task.id))}</span><span>${toHhMm(task.duration_s)}</span></li>`).join("")}</ul>
        <p>${esc(t("wizard.tasks.total", { t: toHhMm(tasks) }))}</p></button>
      <button type="button" class="wz-sum" data-goto="3"><h3>${ICONS.clock}${esc(t("wizard.step.schedule"))}</h3>
        <p>${esc(t("wizard.summary.departure", { t: s.mission.departure_utc.replace("T", " ").replace(/:\d\dZ$/, "") }))}</p></button>
      <div class="wz-sum wz-time"><h3>${ICONS.clock}${esc(t("wizard.summary.time"))} ${tag("derived")}</h3>
        ${timeBar(s)}
        <p class="mp-hint">${esc(t("wizard.summary.noTravel"))}</p>
        ${over ? `<p class="wz-over">${esc(t("wizard.schedule.over"))}</p>` : ""}</div>
      ${advancedModified(s) ? `<p class="wz-derived"><span class="wz-tag" data-kind="modified">${esc(t("wizard.summary.advancedChanged"))}</span></p>` : ""}
      ${errs.length ? `<p class="wz-errors" role="alert">${errs.map(esc).join(" · ")}</p>` : ""}
      <p class="mp-status" role="status" aria-live="polite" data-kind="${error ? "error" : "info"}">${esc(error || t(statusKey))}</p>
      <details data-adv="summary" class="wz-adv"><summary>${esc(t("wizard.advanced"))}</summary>
        <button type="button" data-act="reset">${esc(t("mp.reset"))}</button>
        <details class="mp-json"><summary>${esc(t("mp.json"))}</summary><pre></pre></details>
      </details>`;
  }

  /** Updates derived lines and step validity without re-rendering inputs (keeps focus while typing). */
  function refreshDerived() {
    if (!state || wizard.hidden) return;
    const set = (key: string, html: string) => { const el = wizard.querySelector(`[data-derived="${key}"]`); if (el) el.innerHTML = html; };
    set("tasks-total", `${esc(t("wizard.tasks.total", { t: toHhMm(tasksTotal(state)) }))} ${tag("derived")}`);
    set("available", availableLine(state));
    const live = wizard.querySelector(".wz-live");
    if (live) live.innerHTML = liveSummary(state);
    if (step === 1) {
      // Team bar and cards hold no inputs, so they can be redrawn while typing in the settings rows.
      const fresh = document.createElement("div");
      fresh.innerHTML = teamStep(state);
      const swap = (selector: string) => {
        const now = wizard.querySelectorAll(selector);
        const next = fresh.querySelectorAll(selector);
        now.forEach((el, i) => { if (next[i]) el.replaceWith(next[i]); });
      };
      swap(".wz-team-bar");
      swap(".wz-cards");
    }
    const errs = stepErrors(step, state);
    const next = wizard.querySelector<HTMLButtonElement>('[data-act="next"]');
    if (next) next.disabled = errs.length > 0;
    let box = wizard.querySelector<HTMLElement>(".wz-foot .wz-errors");
    if (errs.length && !box) {
      box = document.createElement("p"); box.className = "wz-errors"; box.setAttribute("role", "alert");
      wizard.querySelector(".wz-foot")?.prepend(box);
    }
    if (box) { if (errs.length) box.textContent = errs.join(" · "); else box.remove(); }
  }

  function preview() {
    if (!state) return;
    state.revision = gate.revision;
    const pre = wizard.querySelector(".mp-json pre");
    if (pre) pre.textContent = JSON.stringify(state, null, 2);
    Object.assign(window, { lastPlanRequest: structuredClone(state) });
    listeners.forEach((cb) => cb(state!));
  }
  function notifyPreview() {
    const visible = open && !!state && step === 0;
    previewListeners.forEach((cb) => cb(visible));
    const covered = open && !!state && !!metadata && step !== 0 && !peekMap;
    if (covered !== lastCovered) { lastCovered = covered; coverListeners.forEach((cb) => cb(covered)); }
  }
  function edited() {
    gate.edit();
    busy = false;
    activeRequest = null;
    error = "";
    statusKey = "mp.status.stale";
    if (hasResult) { hasResult = false; renderLauncher(); }
    Object.assign(window, { lastPlanResponse: null });
    staleListeners.forEach((cb) => cb());
    const status = wizard.querySelector(".mp-status");
    if (status) { status.textContent = t(statusKey); (status as HTMLElement).dataset.kind = "info"; }
  }

  // ---------- data ----------
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
  async function changeParcel(index: number) {
    const registered = metadata?.health.registered_parcels[index];
    if (!metadata || !registered) return;
    const sequence = ++parcelLoadSequence;
    state = null; loading = true; render();
    const result = await loadParcel(registered.id, registered.version);
    if (sequence !== parcelLoadSequence) return;
    loading = false;
    if (result.ok) {
      metadata = { ...metadata, parcel: result.data };
      state = baselineRequest(metadata); invalid.clear(); taskNames.clear(); editing.clear();
      step = 0; maxVisited = 0;
    } else error = result.error;
    render();
  }
  function resetToBaseline(keepFamily: boolean) {
    if (!metadata) return;
    const family = state?.mission.template_id;
    state = baselineRequest(metadata);
    if (keepFamily && family) applyTemplate(family);
    invalid.clear(); taskNames.clear(); editing.clear();
  }
  function applyTemplate(id: string) {
    const template = metadata!.catalogs.mission_templates.templates.find((v) => v.id === id);
    if (!template || !state) return;
    Object.assign(state.mission, { template_id: template.id, tasks: structuredClone(template.tasks), reserve_s: template.reserve_s, time_budget_s: template.time_budget_s });
    taskNames.clear();
    for (const name of [...invalid.keys()]) if (name.startsWith("task-") || name.startsWith("tname-") || name === "reserve" || name === "budget") invalid.delete(name);
  }
  function setOpen(value: boolean, at?: Step) {
    open = value;
    peekMap = false;
    if (at !== undefined) { step = at; maxVisited = Math.max(maxVisited, at) as Step; }
    render();
    if (open) wizard.querySelector<HTMLElement>("#wzTitle")?.focus?.();
  }
  function goto(target: Step) {
    if (!state || target > maxVisited) return;
    animDir = target > step ? "next" : target < step ? "prev" : "";
    step = target; peekMap = false; render();
  }

  // ---------- events ----------
  function onInput(event: Event) {
    const el = event.target as HTMLInputElement | HTMLSelectElement;
    if (!state || !metadata || !el.name) return;
    edited(); // Invalid and reverted edits also invalidate pending work.
    const name = el.name;
    const mark = (ok: boolean) => {
      el.setAttribute("aria-invalid", String(!ok));
      if (ok) invalid.delete(name); else invalid.set(name, el.value);
      return ok;
    };
    if (name === "parcel") { void changeParcel(Number(el.value)); return; }
    if (name === "origin" || name === "destination") { state[name].poi_id = el.value; render(); return; }
    if (name === "scenario") {
      state.scenario.id = el.value;
      state.scenario.version = metadata.parcel.scenarios.find((s) => s.id === el.value)!.version;
    } else if (name === "departure" || name === "as-of") {
      if (mark(!!el.value && Number.isFinite(Date.parse(el.value + "Z")))) {
        const utc = new Date(el.value + "Z").toISOString().replace(".000Z", "Z");
        if (name === "departure") state.mission.departure_utc = utc; else state.scenario.as_of_utc = utc;
      }
    } else if (name === "reserve" || name === "budget" || name.startsWith("task-")) {
      const v = fromHhMm(el.value);
      if (mark(v !== null && (name !== "budget" || v > 0))) {
        if (name === "reserve") state.mission.reserve_s = v!;
        else if (name === "budget") state.mission.time_budget_s = v!;
        else state.mission.tasks[Number(name.slice(5))].duration_s = v!;
      }
    } else if (name.startsWith("tname-")) {
      const task = state.mission.tasks[Number(name.slice(6))];
      if (mark(el.value.trim() !== "")) taskNames.set(task.id, el.value);
    } else if (name.startsWith("payload:") || name.startsWith("override:")) {
      const [, memberId, parameter] = name.split(":");
      const member = members(state).find((p) => p.profile_id === memberId);
      if (!member) return;
      if (name.startsWith("payload:")) {
        const v = Number(el.value);
        if (mark(el.value !== "" && Number.isFinite(v) && v >= 0)) member.payload_kg = v;
      } else {
        const key = parameter as keyof Parameters;
        const base = catalogEntry(memberId).defaults[key];
        const v = key === "max_sortie_s" ? fromHhMm(el.value) : el.value === "" ? null : Number(el.value);
        if (el.value === "" ) { mark(true); setOverride(member, key, undefined); }
        else {
          const positive = key === "flat_speed_m_s" || key === "max_sortie_s";
          const grade = key === "max_ascent_deg" || key === "max_descent_deg";
          const ok = v !== null && Number.isFinite(v) && (positive ? v > 0 : v >= 0) && (!grade || v < 90);
          if (mark(ok)) setOverride(member, key, v === base ? undefined : v!);
        }
      }
    }
    refreshDerived();
    preview();
  }
  function setOverride(member: Member, key: keyof Parameters, value: number | undefined) {
    if (value === undefined) {
      delete member.mission_overrides?.[key];
      if (member.mission_overrides && !Object.keys(member.mission_overrides).length) delete member.mission_overrides;
    } else (member.mission_overrides ??= {})[key] = value;
  }
  function toggleMember(id: string) {
    if (!state || !metadata) return;
    const entry = catalogEntry(id);
    const group = entry.kind === "human" ? state.team.humans : state.team.robots;
    const index = group.findIndex((p) => p.profile_id === id);
    if (index < 0 && group.length >= (entry.kind === "human" ? MAX_HUMANS : MAX_ROBOTS)) return;
    edited();
    if (index >= 0) { group.splice(index, 1); editing.delete(id); }
    else group.push({ profile_id: id, payload_kg: 0 });
    for (const name of [...invalid.keys()]) if (name.includes(`:${id}`)) invalid.delete(name);
    render();
  }

  async function calculate() {
    if (!state || busy) return;
    if (stepErrors(4, state).length) { render(); return; }
    const request = gate.submit(state);
    state.request_id = request.request_id;
    activeRequest = request;
    Object.assign(window, { lastPlanResponse: null });
    staleListeners.forEach((cb) => cb());
    error = ""; busy = true; statusKey = "mp.status.calculating"; render();
    Object.assign(window, { lastPlanRequest: structuredClone(request) });
    const result = await requestPlan(request);
    if (activeRequest !== request) return;
    busy = false; activeRequest = null;
    if (!result.ok) { error = result.error; staleListeners.forEach((cb) => cb()); render(); return; }
    if (!gate.accepts(request, result.data, state)) { statusKey = "mp.status.discarded"; render(); return; }
    statusKey = "mp.status.received";
    hasResult = true;
    open = false;
    render();
    Object.assign(window, { lastPlanResponse: result.data });
    root.dispatchEvent(new CustomEvent<PlanResponseEvent>("plan-response", { detail: { response: result.data }, bubbles: true }));
  }

  function onClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    const button = target.closest<HTMLButtonElement>("[data-act], [data-goto], [data-family]");
    if (button?.dataset.goto !== undefined) { goto(Number(button.dataset.goto) as Step); return; }
    if (button?.dataset.family && state) {
      if (button.dataset.family !== state.mission.template_id) { edited(); applyTemplate(button.dataset.family); render(); }
      return;
    }
    const act = button?.dataset.act;
    if (act) {
      if (act === "connect") void connect();
      else if (act === "open") setOpen(true);
      else if (act === "edit") setOpen(true, 4);
      else if (act === "new") { edited(); resetToBaseline(false); step = 0; maxVisited = 0; setOpen(true); }
      else if (act === "close") setOpen(false);
      else if (act === "back" && step > 0) goto((step - 1) as Step);
      else if (act === "next" && state && !stepErrors(step, state).length && step < 4) {
        animDir = "next"; step = (step + 1) as Step; maxVisited = Math.max(maxVisited, step) as Step; render();
      } else if (act === "calculate") void calculate();
      else if (act === "honesty") { showHonesty = !showHonesty; render(); }
      else if (act === "peek") { peekMap = !peekMap; render(); }
      else if (act === "reset" && metadata) { edited(); resetToBaseline(true); render(); }
      else if (act === "remove-member" && button?.dataset.member) toggleMember(button.dataset.member);
      else if (act === "edit-params") {
        const id = button!.dataset.member!;
        if (editing.has(id)) editing.delete(id); else editing.add(id);
        render();
      } else if (act === "restore" && state) {
        const member = members(state).find((m) => m.profile_id === button!.dataset.member);
        if (member) { edited(); setOverride(member, button!.dataset.param as keyof Parameters, undefined); invalid.delete(`override:${member.profile_id}:${button!.dataset.param}`); render(); }
      } else if (act === "add-task" && state && state.mission.tasks.length < MAX_TASKS) {
        edited();
        let n = 1;
        while (state.mission.tasks.some((v) => v.id === `task_${n}`)) n += 1;
        const id = `task_${n}`;
        state.mission.tasks.push({ id, duration_s: 0 });
        taskNames.set(id, t("wizard.tasks.newName"));
        render();
      } else if (act === "remove-task" && state) {
        edited();
        const index = Number(button!.dataset.index);
        const [removed] = state.mission.tasks.splice(index, 1);
        if (removed) taskNames.delete(removed.id);
        const taskErrors = [...invalid].filter(([name]) => name.startsWith("task-") || name.startsWith("tname-"));
        for (const [name] of taskErrors) invalid.delete(name);
        for (const [name, value] of taskErrors) {
          const oldIndex = Number(name.split("-").at(-1));
          if (oldIndex !== index) invalid.set(name.replace(/\d+$/, String(oldIndex > index ? oldIndex - 1 : oldIndex)), value);
        }
        render();
      }
      return;
    }
    // Card selection: clicks on inputs, labels and buttons inside a card do not toggle it.
    if (target.closest("input, select, label, button, textarea")) return;
    const cardEl = target.closest<HTMLElement>("[data-card]");
    if (cardEl && cardEl.getAttribute("aria-disabled") !== "true") toggleMember(cardEl.dataset.card!);
  }

  wizard.addEventListener("input", onInput);
  wizard.addEventListener("click", onClick);
  wizard.addEventListener("submit", (e) => e.preventDefault());
  wizard.addEventListener("keydown", (e) => {
    const target = e.target as HTMLElement;
    if (e.key === "Escape") { setOpen(false); root.querySelector<HTMLButtonElement>(".wz-new")?.focus(); return; }
    if ((e.key === "Enter" || e.key === " ") && target.matches("[data-card]")) {
      e.preventDefault();
      if (target.getAttribute("aria-disabled") !== "true") toggleMember(target.dataset.card!);
      wizard.querySelector<HTMLElement>(`[data-card="${target.dataset.card}"]`)?.focus();
    }
    if (e.key === "Enter" && target.tagName === "INPUT") e.preventDefault();
  });
  root.addEventListener("click", onClick);

  const api: MissionPanel = {
    selectDestination(id) {
      if (!state || !metadata?.parcel.pois.some((p) => p.id === id)) return t("nav.locations");
      edited(); state.destination.poi_id = id; render(); return null;
    },
    onChange(cb) { listeners.push(cb); if (state) cb(state); },
    onStale(cb) { staleListeners.push(cb); },
    onPointsPreview(cb) { previewListeners.push(cb); },
    onCoverScene(cb) { coverListeners.push(cb); cb(lastCovered); },
    getRequest: () => state ? structuredClone(state) : null,
    getParcel: () => metadata ? structuredClone(metadata.parcel) : null,
    getSlopeLimit() {
      if (!metadata || !state) return Infinity;
      return Math.min(...members(state).map((p) => effective(p, "max_ascent_deg")));
    },
    setCollapsed(value) { if (value && open) setOpen(false); },
  };
  onLanguageChange(render);
  void connect();
  return api;
}
