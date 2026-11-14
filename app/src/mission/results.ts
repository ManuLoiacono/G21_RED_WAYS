import { onLanguageChange, t, tOr } from "../i18n";
import { esc } from "../ui/format";
import { infoButton } from "../provenance/sources";
import type { PlanResponse } from "./draft";

export const ALT_COLORS = ["#3ff0ff", "#ffb347", "#c792ea", "#7ee787"];
export const INCOMPATIBLE_COLOR = "#ff6b6b";
export const altColor = (alt: { status: string }, index: number) => alt.status === "incompatible" ? INCOMPATIBLE_COLOR : ALT_COLORS[index % ALT_COLORS.length];
export const statusLabel = (value: string | null) => value === null ? t("nav.unavailableValue") : tOr(`status.${value}`, value);
export const seconds = (value: number | null) => value === null ? t("nav.unavailableValue") : `${value} s`;

export function createResultsPanel(root: HTMLElement) {
  let response: PlanResponse | null = null;
  let collapsed = false;
  function render() {
    root.hidden = !response;
    root.classList.toggle("collapsed", collapsed);
    if (!response) { root.innerHTML = ""; return; }
    const r = response;
    root.innerHTML = `
      <header class="mp-head"><h2>${esc(t("rs.title"))}</h2><button type="button" data-act="collapse" aria-expanded="${!collapsed}" aria-label="${esc(t(collapsed ? "rs.show" : "rs.hide"))}">${collapsed ? "+" : "−"}</button></header>
      <div class="mp-body">
        <p class="mp-note">${esc(t("nav.engineCalculated"))} ${r.input_provenance.fixture ? esc(t("nav.synthetic")) : ""} ${infoButton("navigation_draft", t("nav.provenance"))}</p>
        <p class="rs-summary"><span class="rs-badge" data-status="${esc(r.status)}">${esc(statusLabel(r.assessment))}</span></p>
        <p>${esc(t("nav.search"))}: ${esc(r.search_status)}</p>
        ${r.alternatives.length === 0 ? `<p>${esc(t("rs.noAlternatives"))}</p>` : ""}
        <ul class="rs-cards">${r.alternatives.map((a) => `<li><article class="rs-card">
          <h3>${esc(tOr(`nav.criterion.${a.criterion}`, a.criterion))}</h3>
          <dl class="rs-metrics">
            <div><dt>${esc(t("nav.elapsed"))}</dt><dd data-metric="elapsed_s">${esc(seconds(a.metrics.elapsed_s))}</dd></div>
            <div><dt>${esc(t("nav.reservedTotal"))}</dt><dd data-metric="reserved_total_s">${esc(seconds(a.metrics.reserved_total_s))}</dd></div>
            <div><dt>${esc(t("nav.reserve"))}</dt><dd>${esc(seconds(a.metrics.reserve_s))}</dd></div>
          </dl>
          ${a.metrics.unavailable_totals_reason ? `<p>${esc(a.metrics.unavailable_totals_reason)}</p>` : ""}
          <ul class="rs-checks">${a.checks.filter((c) => c.status !== "passed").map((c) => `<li data-status="${esc(c.status)}">${esc(c.rule_id)}: ${esc(c.reason.message)}</li>`).join("")}</ul>
        </article></li>`).join("")}
        <p class="mp-hint">${esc(t("rs.notEvaluated"))} ${r.not_evaluated.map(esc).join(" · ")}</p>
      </div>`;
  }
  root.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest('[data-act="collapse"]')) { collapsed = !collapsed; render(); }
  });
  onLanguageChange(render);
  render();
  return {
    show(r: PlanResponse) { response = r; collapsed = false; render(); },
    clear() { response = null; render(); },
  };
}
