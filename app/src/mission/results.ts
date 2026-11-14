import { esc, fmtDistance, fmtDuration, fmtMeters, fmtPercent } from "../ui/format";
import type { Alternative, PlanResponse } from "./response";
import { infoButton, sourceIdFor } from "../provenance/sources";

/**
 * Panel de resultados y comparación (P1-03).
 * Muestra solo lo que viene en la respuesta: no calcula ni inventa alternativas.
 * Sin porcentajes de éxito: estado por categoría + motivos concretos.
 */

export const STATUS_LABEL: Record<string, string> = {
  viable_model: "Viable en el modelo",
  conditional: "Condicionada",
  incompatible: "Incompatible",
  insufficient_evidence: "Evidencia insuficiente",
  search_inconclusive: "Búsqueda inconclusa",
  error: "Error técnico",
};

const STATUS_ICON: Record<string, string> = {
  viable_model: "✓",
  conditional: "!",
  incompatible: "✕",
  insufficient_evidence: "?",
  search_inconclusive: "…",
  error: "✕",
};

const CRITERION_LABEL: Record<string, string> = {
  menor_tiempo: "Menor tiempo",
  menor_esfuerzo: "Menor esfuerzo",
  mejor_enlace: "Mejor enlace con la base",
  menor_pendiente: "Menor pendiente",
};

const CONSTRAINT_LABEL: Record<string, string> = {
  max_slope: "Pendiente máxima",
  daylight: "Luz diurna",
  budget: "Tiempo máximo",
  nodata: "Cobertura del DTM",
};

/** Colores de las alternativas en tarjetas y mapa (mismo orden). */
export const ALT_COLORS = ["#3ff0ff", "#ffb347", "#c792ea", "#7ee787"];
export const INCOMPATIBLE_COLOR = "#ff6b6b";

export function altColor(alt: Alternative, index: number): string {
  return alt.status === "incompatible" ? INCOMPATIBLE_COLOR : ALT_COLORS[index % ALT_COLORS.length];
}

const label = (map: Record<string, string>, key: string) => map[key] ?? key;

export interface ResultsPanel {
  show(response: PlanResponse, simulated: boolean): void;
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
        <h2>Alternativas</h2>
        <button type="button" data-act="collapse" aria-expanded="${!collapsed}" aria-label="${collapsed ? "Mostrar" : "Ocultar"} resultados">${collapsed ? "+" : "−"}</button>
      </header>
      <div class="mp-body">
        ${simulated || r.fixture ? `<p class="mp-note"><strong>Respuesta simulada (fixture).</strong> No la calculó el motor y no cambia con los parámetros del formulario. ${infoButton("respuesta_simulada", "respuesta simulada")}</p>` : ""}
        <p class="rs-summary">${statusBadge(r.status)} ${esc(r.summary_reason)}</p>
        ${r.alternatives.length === 0 ? `<p class="mp-hint">El motor no devolvió alternativas.</p>` : ""}
        <ul class="rs-cards">
          ${r.alternatives.map((a, i) => card(a, i)).join("")}
        </ul>
        ${
          r.not_evaluated?.length
            ? `<p class="mp-hint"><strong>No evaluado:</strong> ${r.not_evaluated.map(esc).join(" · ")}</p>`
            : ""
        }
      </div>
    `;
  }

  function statusBadge(status: string) {
    return `<span class="rs-badge" data-status="${esc(status)}"><span aria-hidden="true">${STATUS_ICON[status] ?? "•"}</span> ${esc(label(STATUS_LABEL, status))}</span>`;
  }

  function card(a: Alternative, i: number) {
    const selected = a.id === selectedId;
    const marginNegative = a.budget.margin_s < 0;
    const violated = a.constraints.filter((c) => c.status === "violated");
    const others = a.constraints.filter((c) => c.status !== "violated");
    const unfavorable = a.preferences.filter((p) => p.status === "unfavorable");
    const nodata = a.evidence?.nodata_fraction;
    // Respuesta simulada → su fixture; respuesta real → derivada del DTM HiRISE (motor).
    const cardSource = simulated || response?.fixture ? "respuesta_simulada" : "dtm_hirise";

    return `
      <li>
        <article class="rs-card ${selected ? "selected" : ""}" style="--alt-color:${altColor(a, i)}">
          <div class="rs-card-head">
            <button type="button" class="rs-select" data-alt="${esc(a.id)}" aria-pressed="${selected}">
              <span class="rs-swatch" aria-hidden="true"></span>
              <span class="rs-title">${esc(label(CRITERION_LABEL, a.criterion))}</span>
              ${statusBadge(a.status)}
            </button>
            ${infoButton(cardSource, `cálculo de la alternativa ${label(CRITERION_LABEL, a.criterion)}`)}
          </div>

          ${
            violated.length
              ? `<div class="rs-block rs-violated">
                  <h4>Restricción incumplida</h4>
                  <ul>${violated.map((c) => `<li><strong>${esc(label(CONSTRAINT_LABEL, c.id))}:</strong> ${esc(c.detail)}</li>`).join("")}</ul>
                </div>`
              : ""
          }
          ${a.warnings.length ? `<div class="rs-block rs-warn"><h4>Condición</h4><ul>${a.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>` : ""}

          <dl class="rs-metrics">
            <div><dt>Tiempo total</dt><dd>${fmtDuration(a.budget.total_s)}</dd></div>
            <div><dt>Margen de regreso</dt><dd class="${marginNegative ? "rs-neg" : ""}">${marginNegative ? `Excede ${fmtDuration(-a.budget.margin_s)}` : fmtDuration(a.budget.margin_s)}</dd></div>
            <div><dt>Distancia (ida + vuelta)</dt><dd>${fmtDistance(a.outbound.distance_m + a.return.distance_m)}</dd></div>
            <div><dt>Desnivel de ida</dt><dd>+${fmtMeters(a.outbound.ascent_m)} / −${fmtMeters(a.outbound.descent_m)}</dd></div>
          </dl>
          <p class="rs-breakdown">
            Ida ${fmtDuration(a.outbound.duration_s)} · tareas ${fmtDuration(a.tasks_s)} · vuelta ${fmtDuration(a.return.duration_s)} · reserva ${fmtDuration(a.reserve_s)}
            <br />Tiempo máximo fuera de la base: ${fmtDuration(a.budget.time_budget_s)}
          </p>

          <details class="rs-details">
            <summary>Restricciones y preferencias</summary>
            <ul class="rs-checks">
              ${others
                .map(
                  (c) => `<li data-status="${esc(c.status)}"><span aria-hidden="true">${c.status === "ok" ? "✓" : "•"}</span>
                    <span><strong>${esc(label(CONSTRAINT_LABEL, c.id))}</strong> (${c.status === "ok" ? "cumple" : esc(c.status)}): ${esc(c.detail)}
                    ${c.provenance ? `<small class="rs-prov">${esc([c.provenance.mission, c.provenance.instrument, c.provenance.kind].filter(Boolean).join(" · "))} ${infoButton(sourceIdFor(c.provenance), label(CONSTRAINT_LABEL, c.id))}</small>` : ""}</span></li>`,
                )
                .join("")}
              ${unfavorable.map((p) => `<li data-status="unfavorable"><span aria-hidden="true">↓</span><span><strong>Preferencia desfavorable:</strong> ${esc(p.detail)}</span></li>`).join("")}
            </ul>
            <p class="mp-hint">
              ${nodata !== undefined ? `Celdas sin datos en el recorrido: ${fmtPercent(nodata)}. ` : ""}
              ${a.evidence?.analytic_cell_m ? `Celda de búsqueda: ${a.evidence.analytic_cell_m} m. ` : ""}
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

  return {
    show(r, sim) {
      response = r;
      simulated = sim;
      collapsed = false;
      // Por defecto: la primera alternativa que no sea incompatible; si no hay, la primera.
      const first = r.alternatives.find((a) => a.status !== "incompatible") ?? r.alternatives[0];
      selectedId = first?.id ?? null;
      render();
      if (selectedId) listeners.forEach((cb) => cb(selectedId!));
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
