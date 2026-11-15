import { environmentContext, terrainContext } from "./context";
import { getLanguage, onLanguageChange, t, tOr, type MessageKey } from "../i18n";
import { esc } from "../ui/format";
import { infoButton } from "../provenance/sources";
import type { Alternative, Check, PlanResponse, Recommendations, ReachableArea } from "./draft";
import { renderMetricPreview } from "./routes";
import { sharesPath } from "./flowMaterial";

export const ALT_COLORS = ["#3ff0ff", "#ffb347", "#c792ea", "#7ee787"];
export const INCOMPATIBLE_COLOR = "#ff6b6b";
export const altColor = (alt: { status: string }, index: number) => alt.status === "incompatible" ? INCOMPATIBLE_COLOR : ALT_COLORS[index % ALT_COLORS.length];
export const statusLabel = (value: string | null) => value === null ? t("nav.unavailableValue") : tOr(`status.${value}`, value);
/** Exact seconds as returned by the engine (used in tooltips and technical details). */
export const seconds = (value: number | null) => value === null ? t("nav.unavailableValue") : `${value} s`;
const label = (group: string, id: string) => tOr(`nav.${group}.${id}`, id);
/** Label without a trailing unit in parentheses (values here are shown as readable durations). */
const plain = (key: MessageKey) => t(key).replace(/\s*\([^)]*\)\s*$/, "");

/** Readable duration for display only (the engine values are unchanged): "1 h 18 min", "48 min 39 s", "0,5 s". */
export function duration(value: number | null): string {
  if (value === null) return t("nav.unavailableValue");
  const sign = value < 0 ? "−" : "";
  const abs = Math.abs(value);
  if (abs < 1) return `${sign}${abs.toLocaleString(getLanguage(), { maximumFractionDigits: 1 })} s`;
  const total = Math.round(abs);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h) return `${sign}${h} h ${String(m).padStart(2, "0")} min`;
  if (m) return `${sign}${m} min ${String(s).padStart(2, "0")} s`;
  return `${sign}${s} s`;
}
const meters = (v: number | null) => v === null ? t("nav.unavailableValue") : `${Math.round(v).toLocaleString(getLanguage())} m`;

/** Results retain the received object across language switches; only labels are translated. */
export function createResultsPanel(root: HTMLElement) {
  let response: PlanResponse | null = null;
  let collapsed = false;
  let selectedId: string | null = null;
  let suggestions: Recommendations | null = null;
  let suggestionStatus = "";
  let area: ReachableArea | null = null;
  let areaVisible = false;
  let areaStatus = "";
  /** A comparison was requested from this panel and its answer is pending (display only). */
  let comparing = false;
  let failure = "";
  const listeners: ((id: string) => void)[] = [];
  function render() {
    const opened = new Set(Array.from(root.querySelectorAll<HTMLDetailsElement>("details[open][data-detail]"), (e) => e.dataset.detail));
    const scroll = root.querySelector(".mp-body")?.scrollTop ?? 0;
    root.hidden = !response && !failure;
    root.classList.toggle("collapsed", collapsed);
    root.classList.toggle("rs-is-busy", comparing);
    if (!response && failure) {
      root.innerHTML = `<header class="mp-head"><h2>${esc(t("rs.title"))}</h2></header>
        <div class="mp-body"><p class="rs-compare-note" data-tone="bad" role="alert">${esc(t("rs.compareFailed", { msg: failure }))}</p></div>`;
      return;
    }
    if (!response) { root.innerHTML = ""; return; }
    const r = response;
    const geo = Boolean(r.geographic_adapter);
    const selected = r.alternatives.find((a) => a.id === selectedId) ?? r.alternatives[0];
    const evidence = selected?.environment ?? r.environment;
    root.innerHTML = `
      <header class="mp-head"><h2>${esc(t("rs.title"))}</h2>
        <span class="rs-head-actions">
          ${geo ? `<button type="button" class="rs-icon-btn" data-act="focus-route" aria-label="${esc(t("nav.focusRoute"))}" title="${esc(t("nav.focusRoute"))}">
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="7"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg></button>` : ""}
          <button type="button" data-act="collapse" aria-expanded="${!collapsed}" aria-label="${esc(t(collapsed ? "rs.show" : "rs.hide"))}">${collapsed ? "+" : "−"}</button>
        </span></header>
      <div class="mp-body">
        <details class="rs-honesty" data-detail="honesty"><summary><span>${esc(t(geo ? "rs.honesty" : "rs.honestySynthetic"))}</span><span class="rs-info" aria-hidden="true">ⓘ</span></summary>
          <p>${esc(t("nav.engineCalculated"))} ${esc(t(geo ? "nav.realTerrain" : "nav.synthetic"))} ${infoButton("navigation_draft", t("nav.provenance"))}</p></details>
        <div class="rs-hero">
          <span class="rs-badge rs-badge-lg" data-status="${esc(selected?.assessment ?? r.status)}">${esc(statusLabel(selected ? selected.assessment : r.assessment))}</span>
          <small>${esc(t("nav.search"))}: ${esc(label("search", r.search_status))}</small>
        </div>
        ${geo ? `<p class="rs-legend"><span class="sw sw-out"></span>${esc(t("nav.outbound"))}${selected && sharesPath(selected.outbound, selected.return)
          ? ` <small class="rs-same">${esc(t("rs.samePath"))}</small>` : `<span class="sw sw-ret"></span>${esc(t("nav.return"))}`}
          <small class="rs-smooth" title="${esc(t("rs.smoothedHint"))}">· ${esc(t("rs.smoothed"))}</small>
          ${r.alternatives.length > 1 ? `<span class="rs-legend-others"><span class="sw sw-other"></span>${esc(t("rs.otherAlternatives"))}</span>` : ""}</p>` : ""}
        ${environmentContext(selected, r.alternatives.length === 1 ? r.environment : undefined)}
        ${compareBlock(r)}
        ${r.alternatives.length === 0 ? `<p>${esc(t("rs.noAlternatives"))}</p>` : ""}
        <ul class="rs-cards">${r.alternatives.map(card).join("")}</ul>
        <div class="rs-actions">
          <button type="button" data-act="area" aria-pressed="${areaVisible}">${esc(t(areaVisible ? "nx.hideArea" : "nx.showArea"))}</button>
          <button type="button" data-act="recommend" ${suggestionStatus === "busy" ? "disabled" : ""}>${esc(t("nx.recommend"))}</button>
        </div>
        ${areaStatus ? `<p class="rs-status" role="status">${esc(areaStatus === "busy" ? t("mp.status.calculating") : areaStatus)}</p>` : ""}
        ${area ? `<p class="mp-hint" data-area-id="${esc(area.id)}">${esc(t("nx.areaLegend", { feasible: area.counts["5"], timeOnly: area.counts["4"], unknown: area.counts["0"] + area.counts["6"], resolution: area.grid.spacing_m[0].toFixed(3) }))}</p>` : ""}
        ${suggestionStatus ? `<p class="rs-status" role="status">${esc(suggestionStatus === "busy" ? t("mp.status.calculating") : suggestionStatus)}</p>` : ""}
        ${suggestions ? `<section class="rs-suggestions"><p class="mp-hint">${esc(t("nx.bounded", { attempted: suggestions.attempted, cap: suggestions.cap }))}</p>${suggestions.proposals.length ? suggestions.proposals.map((p, index) => `<article class="rs-card rs-proposal"><p><span class="rs-badge" data-status="${esc(p.assessment ?? "")}">${esc(statusLabel(p.assessment))}</span>${p.assessment !== "viable_model" ? ` · ${esc(t("nx.unproven"))}` : ""}</p><p>${esc(t("nx.proposedTeam"))}: ${p.team_summary.map((m) => `${esc(m.name)} (${m.payload_kg} kg)`).join(" · ")}</p><p>${esc(t("nav.departureUtc"))}: ${esc(p.proposed_request.mission.departure_utc)}</p><p>${esc(t("nx.delta", { time: seconds(p.delta.elapsed_s ?? null), ascent: p.delta.ascent_m ?? t("nav.unavailableValue"), interruption: seconds(p.delta.max_without_confirmed_s ?? null) }))}</p><button type="button" data-proposal="${index}">${esc(t("nx.apply"))}</button></article>`).join("") : `<p>${esc(t("nx.noSuggestion"))}</p>`}</section>` : ""}
        <details class="rs-section" data-detail="technical"><summary>${esc(t("rs.technical"))}</summary>
          <details data-detail="evidence"><summary>${esc(t("nav.evidence"))}</summary>
            <p>${esc(t("nav.missingRequired"))}: ${esc(evidence.missing_required.join(", ") || t("nav.none"))}</p>
            <p>${esc(t("nav.missingOptional"))}: ${esc(evidence.missing_optional_variables.join(", ") || t("nav.none"))}</p>
            <p class="mp-hint">${esc(t("nav.evidenceHint"))}</p>
            <pre class="nav-json">${esc(JSON.stringify(evidence, null, 2))}</pre>
          </details>
          <details data-detail="reproducibility"><summary>${esc(t("nav.reproducibility"))}</summary>
            <p>${esc(t("nav.requestIdentity", { id: r.request_echo.request_id, revision: r.request_echo.revision }))}</p>
            <ul>${r.assumptions.map((v) => `<li>${esc(v)}</li>`).join("")}</ul>
            <pre class="nav-json">${esc(JSON.stringify({ versions: r.versions, resolved_team: r.resolved_team, input_provenance: r.input_provenance, terrain_context: selected?.terrain_context }, null, 2))}</pre>
          </details>
        </details>
      </div>`;
    root.querySelectorAll<HTMLDetailsElement>("details[data-detail]").forEach((el) => { el.open = opened.has(el.dataset.detail); });
    const body = root.querySelector(".mp-body");
    if (body) body.scrollTop = scroll;
  }
  function compareBlock(r: PlanResponse) {
    if (comparing) return `<p class="rs-compare-note" role="status"><span class="rs-spinner" aria-hidden="true"></span>${esc(t("rs.comparing"))}</p>`;
    if (r.request_echo.criterion === "comparison") {
      const n = r.alternatives.length;
      return `<p class="rs-compare-note" data-tone="${n > 1 ? "ok" : "same"}" role="status">${esc(n > 1 ? t("rs.comparedMany", { n }) : t("rs.comparedSame"))}</p>`;
    }
    return `<button type="button" class="rs-compare" data-act="compare">
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h11M11 3l4 4-4 4M20 17H9M13 13l-4 4 4 4"/></svg>
      <span>${esc(t("nx.compare"))}</span></button>`;
  }
  function metric(key: string, title: MessageKey, value: number | null) {
    return `<div><dt>${esc(plain(title))}</dt><dd data-metric="${key}" class="${value !== null && value < 0 ? "rs-neg" : ""}" title="${esc(seconds(value))}">${esc(duration(value))}</dd></div>`;
  }
  function kpi(key: string, title: MessageKey, value: number | null) {
    const tone = value === null ? "na" : value < 0 ? "bad" : "ok";
    return `<div class="rs-kpi" data-tone="${tone}"><span>${esc(plain(title))}</span><strong data-kpi="${key}" title="${esc(seconds(value))}">${esc(duration(value))}</strong></div>`;
  }
  /** Departure → outbound → tasks → return → reserve against the budget, with the end of daylight if known. */
  function timeline(a: Alternative) {
    const m = a.metrics;
    const parts: [string, number | null, MessageKey][] = [
      ["seg-out", m.outbound_s, "nav.outbound"], ["seg-tasks", m.tasks_s, "nav.tasks"],
      ["seg-ret", m.return_s, "nav.return"], ["seg-reserve", m.reserve_s, "nav.reserve"],
    ];
    if (parts.some(([, v]) => v === null)) return "";
    const used = parts.reduce((sum, [, v]) => sum + (v as number), 0);
    const sunset = m.daylight_reserved_return_margin_s === null || m.reserved_total_s === null ? null : m.reserved_total_s + m.daylight_reserved_return_margin_s;
    // Scale to the budget (or the used time if it overflows); a later end of daylight is stated in the legend.
    const scale = Math.max(m.time_budget_s, used, 1);
    const sunInside = sunset !== null && sunset >= 0 && sunset <= scale;
    const pct = (v: number) => (100 * Math.max(v, 0) / scale).toFixed(2);
    return `<div class="rs-timeline">
      <div class="rs-timeline-bar" role="img" aria-label="${esc(parts.map(([, v, k]) => `${plain(k)} ${duration(v)}`).join(" · "))}">
        ${parts.map(([cls, v, k]) => `<span class="${cls}" style="width:${pct(v as number)}%" title="${esc(`${plain(k)} ${duration(v)}`)}"></span>`).join("")}
        <i class="rs-mark rs-mark-budget" style="left:${pct(m.time_budget_s)}%" title="${esc(`${plain("nav.budget")} ${duration(m.time_budget_s)}`)}"></i>
        ${sunInside ? `<i class="rs-mark rs-mark-sun" style="left:${pct(sunset!)}%" title="${esc(t("rs.timeline.sunset"))}"></i>` : ""}
      </div>
      <p class="rs-timeline-legend">${parts.map(([cls, v, k]) => `<span><i class="dot ${cls}"></i>${esc(plain(k))} ${esc(duration(v))}</span>`).join("")}
        ${sunInside ? `<span><i class="dot dot-sun"></i>${esc(t("rs.timeline.sunset"))}</span>`
          : sunset !== null && sunset > scale ? `<span><i class="dot dot-sun"></i>${esc(t("rs.timeline.sunsetLater", { t: duration(sunset - m.time_budget_s) }))}</span>` : ""}</p>
    </div>`;
  }
  function check(c: Check) {
    return `<li data-status="${esc(c.status)}">
      <strong>${esc(label("rule", c.rule_id))}${c.participant_id ? ` · ${esc(memberName(c.participant_id))}` : ""}</strong>
      <span>${esc(label("check", c.status))}: ${esc(tOr(`nav.reason.${c.reason.code}`, c.reason.message))}</span>
      <small>${esc(t("nav.checkValues", { actual: duration(c.actual_s), limit: duration(c.limit_s), margin: duration(c.margin_s) }))}</small>
      ${c.evidence_ids.length ? `<small>${esc(t("nav.evidenceIds"))}: ${c.evidence_ids.map(esc).join(", ")}</small>` : ""}
      <details><summary>${esc(t("status.technical"))}</summary><code>${esc(c.reason.code)} · ${esc(c.reason.path)}</code><p>${esc(c.reason.message)}</p>
        <p>${esc(t("nav.checkValues", { actual: seconds(c.actual_s), limit: seconds(c.limit_s), margin: seconds(c.margin_s) }))}</p></details>
    </li>`;
  }
  function memberName(id: string) { return response!.resolved_team.find((p) => p.identity.profile_id === id)?.identity.name ?? id; }
  function card(a: Alternative, index: number) {
    const m = a.metrics;
    const important = a.checks.filter((c) => c.status === "failed" || c.status === "missing_evidence");
    return `<li><article class="rs-card ${a.id === selectedId ? "selected" : ""}" style="--alt-color:${ALT_COLORS[index % ALT_COLORS.length]}">
      <button type="button" class="rs-select" data-alt="${esc(a.id)}" aria-pressed="${a.id === selectedId}">${(a.criteria ?? [a.criterion]).map((c) => esc(label("criterion", c))).join(" · ")}</button>
      ${a.assessment !== response!.assessment || a.search_status !== response!.search_status
        ? `<p class="rs-sub">${esc(statusLabel(a.assessment))} · ${esc(label("search", a.search_status))}</p>` : ""}
      ${important.length ? `<ul class="rs-checks nav-important">${important.map(check).join("")}</ul>` : ""}
      <div class="rs-kpis">
        ${kpi("reserved_total_s", "nav.reservedTotal", m.reserved_total_s)}
        ${kpi("mission_margin_s", "nav.missionMargin", m.mission_margin_s)}
        ${kpi("daylight_reserved_return_margin_s", "rs.kpi.daylight", m.daylight_reserved_return_margin_s)}
      </div>
      ${timeline(a)}
      ${terrainContext(a)}
      ${m.unavailable_totals_reason ? `<p>${esc(label("reason", m.unavailable_totals_reason))}</p>` : ""}
      ${a.communication ? `<details class="rs-section" data-detail="communication:${esc(a.id)}"><summary>${esc(t("nx.visibility"))}</summary><p class="mp-hint">${esc(t("nx.antennaHint"))}</p>${a.communication.status === "evaluated" ? `<dl class="rs-metrics">${(["visible_s", "occluded_s", "unknown_s", "max_without_confirmed_s"] as const).map((key) => metric(key, `nx.${key}`, a.communication![key] ?? null)).join("")}</dl>` : esc(t("nav.unavailableValue"))}</details>` : ""}
      <details class="rs-section" data-detail="metrics:${esc(a.id)}"><summary>${esc(t("rs.allMetrics"))}</summary>
        <dl class="rs-metrics">
          ${metric("elapsed_s", "nav.elapsed", m.elapsed_s)}
          ${metric("reserved_total_s", "nav.reservedTotal", m.reserved_total_s)}
          ${metric("outbound_s", "nav.outbound", m.outbound_s)}
          ${metric("return_s", "nav.return", m.return_s)}
          ${metric("tasks_s", "nav.tasks", m.tasks_s)}
          ${metric("reserve_s", "nav.reserve", m.reserve_s)}
          ${metric("time_budget_s", "nav.budget", m.time_budget_s)}
          ${metric("mission_margin_s", "nav.missionMargin", m.mission_margin_s)}
          ${metric("temporal_budget_limiting_margin_s", "nav.temporalMargin", m.temporal_budget_limiting_margin_s)}
          ${metric("daylight_departure_margin_s", "nav.daylightDeparture", m.daylight_departure_margin_s)}
          ${metric("daylight_reserved_return_margin_s", "nav.daylightReturn", m.daylight_reserved_return_margin_s)}
        </dl>
        <p class="mp-hint">${esc(t("nav.marginHint"))}</p>
        ${(["outbound", "return"] as const).map((name) => `<h3>${esc(t(`nav.${name}`))}</h3><dl class="rs-metrics">${(["horizontal_distance_m", "ascent_m", "descent_m"] as const).map((key) =>
          `<div><dt>${esc(t(`nav.${key}`))}</dt><dd data-metric="${name}.${key}" title="${a[name][key] === null ? "" : `${a[name][key]} m`}">${esc(meters(a[name][key]))}</dd></div>`).join("")}</dl>`).join("")}
        ${renderMetricPreview(a, response!.locations, index)}
        <table class="nav-margins"><caption>${esc(t("nav.participantMargins"))}</caption>
          <thead><tr><th>${esc(t("nav.participant"))}</th><th>${esc(t("nav.limit"))}</th><th>${esc(t("nav.margin"))}</th></tr></thead>
          <tbody>${m.participant_margins.map((p) => `<tr data-participant="${esc(p.participant_id)}"><th scope="row">${esc(memberName(p.participant_id))}</th><td title="${esc(seconds(p.max_sortie_s))}">${esc(duration(p.max_sortie_s))}</td><td class="${p.margin_s !== null && p.margin_s < 0 ? "rs-neg" : ""}" title="${esc(seconds(p.margin_s))}">${esc(duration(p.margin_s))}</td></tr>`).join("")}</tbody>
        </table>
      </details>
      <details class="rs-section" data-detail="checks:${esc(a.id)}"><summary>${esc(t("rs.details"))}</summary>
        <ul class="rs-checks">${a.checks.map(check).join("")}</ul>
        <p>${esc(t("nav.legState"))}: ${esc(t("nav.outbound"))} ${esc(a.outbound.status)} / ${esc(t("nav.return"))} ${esc(a.return.status)}</p>
        <p>${esc(t("nav.offsets", { returned: seconds(m.estimated_return_offset_s), reserved: seconds(m.reserved_deadline_offset_s) }))}</p>
      </details>
    </article></li>`;
  }
  root.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-act="collapse"]')) { collapsed = !collapsed; render(); }
    if (target.closest('[data-act="focus-route"]')) root.dispatchEvent(new CustomEvent("focus-calculated-route", { bubbles: true }));
    if (target.closest('[data-act="compare"]') && !comparing) { comparing = true; failure = ""; render(); root.dispatchEvent(new CustomEvent("compare-calculated-routes", { bubbles: true })); }
    if (target.closest('[data-act="area"]')) root.dispatchEvent(new CustomEvent("toggle-reachable-area", { bubbles: true }));
    if (target.closest('[data-act="recommend"]')) root.dispatchEvent(new CustomEvent("request-calculated-recommendations", { bubbles: true }));
    const index = target.closest<HTMLButtonElement>("button[data-proposal]")?.dataset.proposal;
    if (index !== undefined && suggestions?.proposals[Number(index)]) root.dispatchEvent(new CustomEvent("apply-calculated-proposal", { bubbles: true, detail: suggestions.proposals[Number(index)].proposed_request }));
    const id = target.closest<HTMLButtonElement>("button[data-alt]")?.dataset.alt;
    if (id && response?.alternatives.some((a) => a.id === id)) { selectedId = id; render(); listeners.forEach((cb) => cb(id)); }
  });
  onLanguageChange(render);
  render();
  return {
    show(r: PlanResponse) {
      comparing = false; failure = "";
      response = r; area = null; areaStatus = ""; areaVisible = false; suggestions = null; suggestionStatus = ""; collapsed = false; selectedId = r.alternatives[0]?.id ?? null; render();
      if (selectedId) listeners.forEach((cb) => cb(selectedId!));
    },
    clear() {
      // While a comparison requested here is pending, keep the previous result on screen (dimmed,
      // not interactive) instead of an empty flash; it is replaced by show() or failed().
      if (comparing) { area = null; areaStatus = ""; areaVisible = false; suggestions = null; suggestionStatus = ""; render(); return; }
      failure = ""; response = null; area = null; areaStatus = ""; areaVisible = false; suggestions = null; suggestionStatus = ""; selectedId = null; render(); },
    failed(message: string) { if (!comparing) return; comparing = false; response = null; failure = message; render(); },
    areaState(value: ReachableArea | string, visible: boolean) { areaVisible = visible; if (typeof value === "string") areaStatus = value; else { area = value; areaStatus = ""; } render(); },
    recommendationState(value: Recommendations | string) { if (typeof value === "string") suggestionStatus = value; else { suggestions = value; suggestionStatus = ""; } render(); },
    onSelect(cb: (id: string) => void) { listeners.push(cb); },
  };
}
