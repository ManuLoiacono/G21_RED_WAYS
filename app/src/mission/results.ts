import { onLanguageChange, t, tOr, type MessageKey } from "../i18n";
import { esc } from "../ui/format";
import { infoButton } from "../provenance/sources";
import type { Alternative, Check, PlanResponse, Recommendations } from "./draft";
import { renderMetricPreview } from "./routes";

export const ALT_COLORS = ["#3ff0ff", "#ffb347", "#c792ea", "#7ee787"];
export const INCOMPATIBLE_COLOR = "#ff6b6b";
export const altColor = (alt: { status: string }, index: number) => alt.status === "incompatible" ? INCOMPATIBLE_COLOR : ALT_COLORS[index % ALT_COLORS.length];
export const statusLabel = (value: string | null) => value === null ? t("nav.unavailableValue") : tOr(`status.${value}`, value);
export const seconds = (value: number | null) => value === null ? t("nav.unavailableValue") : `${value} s`;
const label = (group: string, id: string) => tOr(`nav.${group}.${id}`, id);

/** Results retain the received object across language switches; only labels are translated. */
export function createResultsPanel(root: HTMLElement) {
  let response: PlanResponse | null = null;
  let collapsed = false;
  let selectedId: string | null = null;
  let suggestions: Recommendations | null = null;
  let suggestionStatus = "";
  const listeners: ((id: string) => void)[] = [];
  function render() {
    const opened = new Set(Array.from(root.querySelectorAll<HTMLDetailsElement>("details[open][data-detail]"), (e) => e.dataset.detail));
    const scroll = root.querySelector(".mp-body")?.scrollTop ?? 0;
    root.hidden = !response;
    root.classList.toggle("collapsed", collapsed);
    if (!response) { root.innerHTML = ""; return; }
    const r = response;
    const selected = r.alternatives.find((a) => a.id === selectedId) ?? r.alternatives[0];
    const evidence = selected?.environment ?? r.environment;
    root.innerHTML = `
      <header class="mp-head"><h2>${esc(t("rs.title"))}</h2><button type="button" data-act="collapse" aria-expanded="${!collapsed}" aria-label="${esc(t(collapsed ? "rs.show" : "rs.hide"))}">${collapsed ? "+" : "−"}</button></header>
      <div class="mp-body">
        <p class="mp-note">${esc(t("nav.engineCalculated"))} ${esc(t(r.geographic_adapter ? "nav.realTerrain" : "nav.synthetic"))} ${infoButton("navigation_draft", t("nav.provenance"))}</p>
        <p class="rs-summary">${esc(t("nav.assessment"))}: <span class="rs-badge" data-status="${esc(selected?.assessment ?? r.status)}">${esc(statusLabel(selected ? selected.assessment : r.assessment))}</span></p>
        <p>${esc(t("nav.search"))}: ${esc(label("search", r.search_status))}</p>
        ${r.geographic_adapter ? `<button type="button" data-act="focus-route">${esc(t("nav.focusRoute"))}</button><p class="nav-legend">━ ${esc(t("nav.outbound"))} · ┄ ${esc(t("nav.return"))}</p>` : ""}
        ${r.alternatives.length === 0 ? `<p>${esc(t("rs.noAlternatives"))}</p>` : ""}
        <ul class="rs-cards">${r.alternatives.map(card).join("")}</ul>
        <button type="button" data-act="compare">${esc(t("nx.compare"))}</button>
        <button type="button" data-act="recommend" ${suggestionStatus === "busy" ? "disabled" : ""}>${esc(t("nx.recommend"))}</button>
        ${suggestionStatus ? `<p role="status">${esc(suggestionStatus === "busy" ? t("mp.status.calculating") : suggestionStatus)}</p>` : ""}
        ${suggestions ? `<section><p>${esc(t("nx.bounded", { attempted: suggestions.attempted, cap: suggestions.cap }))}</p>${suggestions.proposals.length ? suggestions.proposals.map((p, index) => `<article class="rs-card"><p>${esc(statusLabel(p.assessment))}${p.assessment !== "viable_model" ? ` · ${esc(t("nx.unproven"))}` : ""}</p><p>${esc(t("nx.proposedTeam"))}: ${p.team_summary.map((m) => `${esc(m.name)} (${m.payload_kg} kg)`).join(" · ")}</p><p>${esc(t("nav.departureUtc"))}: ${esc(p.proposed_request.mission.departure_utc)}</p><p>${esc(t("nx.delta", { time: seconds(p.delta.elapsed_s ?? null), ascent: p.delta.ascent_m ?? t("nav.unavailableValue"), interruption: seconds(p.delta.max_without_confirmed_s ?? null) }))}</p><button type="button" data-proposal="${index}">${esc(t("nx.apply"))}</button></article>`).join("") : `<p>${esc(t("nx.noSuggestion"))}</p>`}</section>` : ""}
        <p class="mp-hint">${esc(t("rs.notEvaluated"))} ${r.not_evaluated.map((v) => esc(label("scope", v))).join(" · ")}</p>
        <details data-detail="evidence"><summary>${esc(t("nav.evidence"))}</summary>
          <p>${esc(t("nav.missingRequired"))}: ${esc(evidence.missing_required.join(", ") || t("nav.none"))}</p>
          <p>${esc(t("nav.missingOptional"))}: ${esc(evidence.missing_optional_variables.join(", ") || t("nav.none"))}</p>
          <p class="mp-hint">${esc(t("nav.evidenceHint"))}</p>
          <pre class="nav-json">${esc(JSON.stringify(evidence, null, 2))}</pre>
        </details>
        <details data-detail="reproducibility"><summary>${esc(t("nav.reproducibility"))}</summary>
          <p>${esc(t("nav.requestIdentity", { id: r.request_echo.request_id, revision: r.request_echo.revision }))}</p>
          <ul>${r.assumptions.map((v) => `<li>${esc(v)}</li>`).join("")}</ul>
          <pre class="nav-json">${esc(JSON.stringify({ versions: r.versions, resolved_team: r.resolved_team, input_provenance: r.input_provenance }, null, 2))}</pre>
        </details>
      </div>`;
    root.querySelectorAll<HTMLDetailsElement>("details[data-detail]").forEach((el) => { el.open = opened.has(el.dataset.detail); });
    const body = root.querySelector(".mp-body");
    if (body) body.scrollTop = scroll;
  }
  function metric(key: string, title: MessageKey, value: number | null) {
    return `<div><dt>${esc(t(title))}</dt><dd data-metric="${key}" class="${value !== null && value < 0 ? "rs-neg" : ""}">${esc(seconds(value))}</dd></div>`;
  }
  function check(c: Check) {
    return `<li data-status="${esc(c.status)}">
      <strong>${esc(label("rule", c.rule_id))}${c.participant_id ? ` · ${esc(memberName(c.participant_id))}` : ""}</strong>
      <span>${esc(label("check", c.status))}: ${esc(tOr(`nav.reason.${c.reason.code}`, c.reason.message))}</span>
      <small>${esc(t("nav.checkValues", { actual: seconds(c.actual_s), limit: seconds(c.limit_s), margin: seconds(c.margin_s) }))}</small>
      ${c.evidence_ids.length ? `<small>${esc(t("nav.evidenceIds"))}: ${c.evidence_ids.map(esc).join(", ")}</small>` : ""}
      <details><summary>${esc(t("status.technical"))}</summary><code>${esc(c.reason.code)} · ${esc(c.reason.path)}</code><p>${esc(c.reason.message)}</p></details>
    </li>`;
  }
  function memberName(id: string) { return response!.resolved_team.find((p) => p.identity.profile_id === id)?.identity.name ?? id; }
  function card(a: Alternative, index: number) {
    const m = a.metrics;
    const important = a.checks.filter((c) => c.status === "failed" || c.status === "missing_evidence");
    return `<li><article class="rs-card ${a.id === selectedId ? "selected" : ""}" style="--alt-color:${ALT_COLORS[index % ALT_COLORS.length]}">
      <button type="button" class="rs-select" data-alt="${esc(a.id)}" aria-pressed="${a.id === selectedId}">${(a.criteria ?? [a.criterion]).map((c) => esc(label("criterion", c))).join(" · ")}</button>
      <p>${esc(t("nav.assessment"))}: ${esc(statusLabel(a.assessment))} · ${esc(t("nav.search"))}: ${esc(label("search", a.search_status))}</p>
      ${important.length ? `<ul class="rs-checks nav-important">${important.map(check).join("")}</ul>` : ""}
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
      ${a.communication ? `<details data-detail="communication:${esc(a.id)}"><summary>${esc(t("nx.visibility"))}</summary><p>${esc(t("nx.antennaHint"))}</p>${a.communication.status === "evaluated" ? `<dl class="rs-metrics">${(["visible_s", "occluded_s", "unknown_s", "max_without_confirmed_s"] as const).map((key) => metric(key, `nx.${key}`, a.communication![key] ?? null)).join("")}</dl>` : esc(t("nav.unavailableValue"))}</details>` : ""}
      ${(["outbound", "return"] as const).map((name) => `<h3>${esc(t(`nav.${name}`))}</h3><dl class="rs-metrics">${(["horizontal_distance_m", "ascent_m", "descent_m"] as const).map((key) =>
        `<div><dt>${esc(t(`nav.${key}`))}</dt><dd data-metric="${name}.${key}">${a[name][key] === null ? esc(t("nav.unavailableValue")) : `${Number(a[name][key].toFixed(2))} m`}</dd></div>`).join("")}</dl>`).join("")}
      ${renderMetricPreview(a, response!.locations, index)}
      ${m.unavailable_totals_reason ? `<p>${esc(label("reason", m.unavailable_totals_reason))}</p>` : ""}
      <table class="nav-margins"><caption>${esc(t("nav.participantMargins"))}</caption>
        <thead><tr><th>${esc(t("nav.participant"))}</th><th>${esc(t("nav.limit"))}</th><th>${esc(t("nav.margin"))}</th></tr></thead>
        <tbody>${m.participant_margins.map((p) => `<tr data-participant="${esc(p.participant_id)}"><th scope="row">${esc(memberName(p.participant_id))}</th><td>${esc(seconds(p.max_sortie_s))}</td><td class="${p.margin_s !== null && p.margin_s < 0 ? "rs-neg" : ""}">${esc(seconds(p.margin_s))}</td></tr>`).join("")}</tbody>
      </table>
      <details data-detail="checks:${esc(a.id)}"><summary>${esc(t("rs.details"))}</summary>
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
    if (target.closest('[data-act="compare"]')) root.dispatchEvent(new CustomEvent("compare-calculated-routes", { bubbles: true }));
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
      response = r; suggestions = null; suggestionStatus = ""; collapsed = false; selectedId = r.alternatives[0]?.id ?? null; render();
      if (selectedId) listeners.forEach((cb) => cb(selectedId!));
    },
    clear() { response = null; suggestions = null; suggestionStatus = ""; selectedId = null; render(); },
    recommendationState(value: Recommendations | string) { if (typeof value === "string") suggestionStatus = value; else { suggestions = value; suggestionStatus = ""; } render(); },
    onSelect(cb: (id: string) => void) { listeners.push(cb); },
  };
}
