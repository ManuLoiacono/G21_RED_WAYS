import { onLanguageChange, t, tOr } from "../i18n";
import { esc, fmtDistance, fmtDuration, fmtMeters, fmtPercent } from "../ui/format";
import type { Alternative, PlanResponse } from "./response";
import { infoButton, sourceIdFor } from "../provenance/sources";

/**
 * Results and comparison panel (P1-03).
 * Shows only what comes in the response: it does not compute or invent alternatives.
 * No success percentages: status by category plus concrete reasons.
 */

const STATUS_ICON: Record<string, string> = {
  viable_model: "✓",
  conditional: "!",
  incompatible: "✕",
  insufficient_evidence: "?",
  search_inconclusive: "…",
  error: "✕",
};

/** Labels for contract values; unknown values are shown as they come. */
export const statusLabel = (status: string) => tOr(`status.${status}`, status);
const criterionLabel = (criterion: string) => tOr(`criterion.${criterion}`, criterion);
const constraintLabel = (id: string) => tOr(`constraint.${id}`, id);

/** Alternative colors in cards and on the map (same order). */
export const ALT_COLORS = ["#3ff0ff", "#ffb347", "#c792ea", "#7ee787"];
export const INCOMPATIBLE_COLOR = "#ff6b6b";

export function altColor(alt: Alternative, index: number): string {
  return alt.status === "incompatible" ? INCOMPATIBLE_COLOR : ALT_COLORS[index % ALT_COLORS.length];
}

export interface ResultsPanel {
  show(response: PlanResponse, simulated: boolean): void;
  /** Swaps the response content (same alternatives) keeping selection and collapsed state. */
  replace(response: PlanResponse): void;
  clear(): void;
  onSelect(cb: (altId: string) => void): void;
}

export function createResultsPanel(root: HTMLElement): ResultsPanel {
  let response: PlanResponse | null = null;
  let simulated = false;
  let selectedId: string | null = null;
  let collapsed = false;
  const listeners: ((id: string) => void)[] = [];

  function render() {
    if (!response) {
      root.hidden = true;
      root.innerHTML = "";
      return;
    }
    root.hidden = false;
    root.classList.toggle("collapsed", collapsed);
    const r = response;
    root.innerHTML = `
      <header class="mp-head">
        <h2>${esc(t("rs.title"))}</h2>
        <button type="button" data-act="collapse" aria-expanded="${!collapsed}" aria-label="${esc(t(collapsed ? "rs.show" : "rs.hide"))}">${collapsed ? "+" : "−"}</button>
      </header>
      <div class="mp-body">
        ${simulated || r.fixture ? `<p class="mp-note">${t("rs.simulatedNote")} ${infoButton("simulated_response", t("rs.simulated.info"))}</p>` : ""}
        <p class="rs-summary">${statusBadge(r.status)} ${esc(r.summary_reason)}</p>
        ${r.alternatives.length === 0 ? `<p class="mp-hint">${esc(t("rs.noAlternatives"))}</p>` : ""}
        <ul class="rs-cards">
          ${r.alternatives.map((a, i) => card(a, i)).join("")}
        </ul>
        ${
          r.not_evaluated?.length
            ? `<p class="mp-hint"><strong>${esc(t("rs.notEvaluated"))}</strong> ${r.not_evaluated.map(esc).join(" · ")}</p>`
            : ""
        }
      </div>
    `;
  }

  function statusBadge(status: string) {
    return `<span class="rs-badge" data-status="${esc(status)}"><span aria-hidden="true">${STATUS_ICON[status] ?? "•"}</span> ${esc(statusLabel(status))}</span>`;
  }

  function card(a: Alternative, i: number) {
    const selected = a.id === selectedId;
    const marginNegative = a.budget.margin_s < 0;
    const violated = a.constraints.filter((c) => c.status === "violated");
    const others = a.constraints.filter((c) => c.status !== "violated");
    const unfavorable = a.preferences.filter((p) => p.status === "unfavorable");
    const nodata = a.evidence?.nodata_fraction;
    // Simulated response → its fixture; real response → derived from the HiRISE DTM (engine).
    const cardSource = simulated || response?.fixture ? "simulated_response" : "hirise_dtm";
    const name = criterionLabel(a.criterion);

    return `
      <li>
        <article class="rs-card ${selected ? "selected" : ""}" style="--alt-color:${altColor(a, i)}">
          <div class="rs-card-head">
            <button type="button" class="rs-select" data-alt="${esc(a.id)}" aria-pressed="${selected}">
              <span class="rs-swatch" aria-hidden="true"></span>
              <span class="rs-title">${esc(name)}</span>
              ${statusBadge(a.status)}
            </button>
            ${infoButton(cardSource, t("rs.altInfo", { name }))}
          </div>

          ${
            violated.length
              ? `<div class="rs-block rs-violated">
                  <h4>${esc(t("rs.violated"))}</h4>
                  <ul>${violated.map((c) => `<li><strong>${esc(constraintLabel(c.id))}:</strong> ${esc(c.detail)}</li>`).join("")}</ul>
                </div>`
              : ""
          }
          ${a.warnings.length ? `<div class="rs-block rs-warn"><h4>${esc(t("rs.condition"))}</h4><ul>${a.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>` : ""}

          <dl class="rs-metrics">
            <div><dt>${esc(t("rs.totalTime"))}</dt><dd>${fmtDuration(a.budget.total_s)}</dd></div>
            <div><dt>${esc(t("rs.returnMargin"))}</dt><dd class="${marginNegative ? "rs-neg" : ""}">${marginNegative ? esc(t("rs.exceeds", { d: fmtDuration(-a.budget.margin_s) })) : fmtDuration(a.budget.margin_s)}</dd></div>
            <div><dt>${esc(t("rs.distance"))}</dt><dd>${fmtDistance(a.outbound.distance_m + a.return.distance_m)}</dd></div>
            <div><dt>${esc(t("rs.outboundElevation"))}</dt><dd>+${fmtMeters(a.outbound.ascent_m)} / −${fmtMeters(a.outbound.descent_m)}</dd></div>
          </dl>
          <p class="rs-breakdown">
            ${esc(
              t("rs.breakdown", {
                out: fmtDuration(a.outbound.duration_s),
                tasks: fmtDuration(a.tasks_s),
                ret: fmtDuration(a.return.duration_s),
                reserve: fmtDuration(a.reserve_s),
              }),
            )}
            <br />${esc(t("rs.budget", { d: fmtDuration(a.budget.time_budget_s) }))}
          </p>

          <details class="rs-details">
            <summary>${esc(t("rs.details"))}</summary>
            <ul class="rs-checks">
              ${others
                .map(
                  (c) => `<li data-status="${esc(c.status)}"><span aria-hidden="true">${c.status === "ok" ? "✓" : "•"}</span>
                    <span><strong>${esc(constraintLabel(c.id))}</strong> (${c.status === "ok" ? esc(t("rs.meets")) : esc(c.status)}): ${esc(c.detail)}
                    ${c.provenance ? `<small class="rs-prov">${esc([c.provenance.mission, c.provenance.instrument, c.provenance.kind].filter(Boolean).join(" · "))} ${infoButton(sourceIdFor(c.provenance), constraintLabel(c.id))}</small>` : ""}</span></li>`,
                )
                .join("")}
              ${unfavorable.map((p) => `<li data-status="unfavorable"><span aria-hidden="true">↓</span><span><strong>${esc(t("rs.unfavorable"))}</strong> ${esc(p.detail)}</span></li>`).join("")}
            </ul>
            <p class="mp-hint">
              ${nodata !== undefined ? esc(t("rs.nodata", { p: fmtPercent(nodata) })) : ""}
              ${a.evidence?.analytic_cell_m ? esc(t("rs.cell", { m: a.evidence.analytic_cell_m })) : ""}
              ${a.evidence?.notes ? esc(a.evidence.notes) : ""}
            </p>
          </details>
        </article>
      </li>`;
  }

  function select(id: string) {
    selectedId = id;
    render();
    listeners.forEach((cb) => cb(id));
  }

  root.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-act="collapse"]')) {
      collapsed = !collapsed;
      render();
      return;
    }
    const btn = target.closest<HTMLButtonElement>("button[data-alt]");
    if (btn?.dataset.alt) select(btn.dataset.alt);
  });

  render();
  onLanguageChange(() => render());

  return {
    show(r, sim) {
      response = r;
      simulated = sim;
      collapsed = false;
      // Default: the first alternative that is not incompatible; otherwise the first one.
      const first = r.alternatives.find((a) => a.status !== "incompatible") ?? r.alternatives[0];
      selectedId = first?.id ?? null;
      render();
      if (selectedId) listeners.forEach((cb) => cb(selectedId!));
    },
    replace(r) {
      if (!response) return;
      response = r;
      render();
    },
    clear() {
      response = null;
      selectedId = null;
      render();
    },
    onSelect(cb) {
      listeners.push(cb);
    },
  };
}
