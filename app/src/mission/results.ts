import { onLanguageChange, t, tOr, type MessageKey } from "../i18n";
import { esc } from "../ui/format";
import { infoButton } from "../provenance/sources";
import type { Alternative, Check, PlanResponse } from "./draft";
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
  const listeners: ((id: string) => void)[] = [];
  function render() {
    const opened = new Set(Array.from(root.querySelectorAll<HTMLDetailsElement>("details[open][data-detail]"), (e) => e.dataset.detail));
    const scroll = root.querySelector(".mp-body")?.scrollTop ?? 0;
    root.hidden = !response;
    root.classList.toggle("collapsed", collapsed);
    if (!response) { root.innerHTML = ""; return; }
    const r = response;
    root.innerHTML = `
      <header class="mp-head"><h2>${esc(t("rs.title"))}</h2><button type="button" data-act="collapse" aria-expanded="${!collapsed}" aria-label="${esc(t(collapsed ? "rs.show" : "rs.hide"))}">${collapsed ? "+" : "−"}</button></header>
      <div class="mp-body">
        <p class="mp-note">${esc(t("nav.engineCalculated"))} ${r.input_provenance.fixture ? esc(t("nav.synthetic")) : ""} ${infoButton("navigation_draft", t("nav.provenance"))}</p>
        <p class="rs-summary">${esc(t("nav.assessment"))}: <span class="rs-badge" data-status="${esc(r.status)}">${esc(statusLabel(r.assessment))}</span></p>
        <p>${esc(t("nav.search"))}: ${esc(label("search", r.search_status))}</p>
        ${r.alternatives.length === 0 ? `<p>${esc(t("rs.noAlternatives"))}</p>` : ""}
        <ul class="rs-cards">${r.alternatives.map(card).join("")}</ul>
        <p class="mp-hint">${esc(t("rs.notEvaluated"))} ${r.not_evaluated.map((v) => esc(label("scope", v))).join(" · ")}</p>
        <details data-detail="evidence"><summary>${esc(t("nav.evidence"))}</summary>
          <p>${esc(t("nav.missingRequired"))}: ${esc(r.environment.missing_required.join(", ") || t("nav.none"))}</p>
          <p>${esc(t("nav.missingOptional"))}: ${esc(r.environment.missing_optional_variables.join(", ") || t("nav.none"))}</p>
          <p class="mp-hint">${esc(t("nav.evidenceHint"))}</p>
          <pre class="nav-json">${esc(JSON.stringify(r.environment, null, 2))}</pre>
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
      <button type="button" class="rs-select" data-alt="${esc(a.id)}" aria-pressed="${a.id === selectedId}">${esc(label("criterion", a.criterion))}</button>
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
    const id = target.closest<HTMLButtonElement>("button[data-alt]")?.dataset.alt;
    if (id && response?.alternatives.some((a) => a.id === id)) { selectedId = id; render(); listeners.forEach((cb) => cb(id)); }
  });
  onLanguageChange(render);
  render();
  return {
    show(r: PlanResponse) {
      response = r; collapsed = false; selectedId = r.alternatives[0]?.id ?? null; render();
      if (selectedId) listeners.forEach((cb) => cb(selectedId!));
    },
    clear() { response = null; selectedId = null; render(); },
    onSelect(cb: (id: string) => void) { listeners.push(cb); },
  };
}
