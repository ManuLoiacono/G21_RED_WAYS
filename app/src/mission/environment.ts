import { t, tOr } from "../i18n";
import { esc } from "../ui/format";
import type { DecisionRecord, PlanResponse } from "./draft";

export const variableLabel = (variable: string) => tOr(`env.variable.${variable}`, variable);
const value = (n: number | null) => n === null ? t("nav.unavailableValue") : String(n);

/** Uses only the service's selected records; no browser report is promoted to decision evidence. */
export function renderEnvironment(environment: PlanResponse["environment"]): string {
  const forecasts = environment.decision_records.filter((r) => r.record.kind === "forecast");
  const observations = environment.decision_records.filter((r) => r.record.kind === "observation");
  const clock = environment.clock_mapping;
  const solar = environment.daylight;
  const instant = (seconds: number) => new Date(Date.parse(String(clock.utc_epoch)) + (seconds - Number(clock.offset_at_epoch_s)) * 1000).toISOString();
  return `<section class="nav-environment" data-environment="selected">
    <h3>${esc(t(environment.snapshot.fixture ? "env.synthetic" : "env.title"))}</h3>
    <p>${esc(t("env.asOf", { date: String(environment.snapshot.as_of_utc) }))}</p>
    <p>${esc(t("env.contextOnly"))}</p>
    ${solar ? `<p data-daylight="${esc(solar.evidence_kind)}"><strong>${esc(t(solar.evidence_kind === "derived" ? "env.daylight" : "env.assumedDaylight"))}</strong><br>${esc(instant(solar.start_s))} — ${esc(instant(solar.end_s))}</p><p class="mp-hint">${esc(t("env.horizon"))}</p>` : `<p data-daylight="missing">${esc(t("env.noDaylight"))}</p>`}
    <details data-detail="environment-forecasts"><summary>${esc(t("env.forecasts", { count: forecasts.length }))}</summary>
      <p class="mp-hint">${esc(t("env.reconstruction"))}</p>
      ${forecasts.length ? `<table class="nav-margins"><thead><tr><th>${esc(t("env.variable"))}</th><th>p10</th><th>p50</th><th>p90</th></tr></thead><tbody>${forecasts.map(({ record: r }) => `<tr><th scope="row">${esc(variableLabel(r.variable))}<small> ${esc(r.units)}</small></th>${(["p10", "p50", "p90"] as const).map((q) => `<td>${esc(value(r.quantiles?.[q] ?? (q === "p50" && typeof r.value === "number" ? r.value : null)))}</td>`).join("")}</tr><tr><td colspan="4">${esc(t("env.horizonSeries", { issue: r.issue_sol ?? "—", target: r.target_sol ?? "—", lead: r.lead_sols ?? "—" }))}<br>${esc(r.model_id ?? r.source_id)}<br>${esc(r.valid_from_utc ?? "—")} — ${esc(r.valid_to_utc ?? "—")}</td></tr>`).join("")}</tbody></table>` : `<p>${esc(t("env.noForecasts"))}</p>`}
      ${forecasts.map(recordDetails).join("")}
    </details>
    ${environment.missing_forecast_variables.length ? `<p data-forecast-coverage="missing">${esc(t("env.missingForecasts"))}: ${environment.missing_forecast_variables.map((v) => esc(variableLabel(v))).join(", ")}</p>` : ""}
    <details data-detail="environment-observations"><summary>${esc(t("env.observations", { count: observations.length }))}</summary>
      ${observations.map(({ record: r }) => `<p><strong>${esc(variableLabel(r.variable))}</strong>: ${esc(value(typeof r.value === "number" ? r.value : null))} ${esc(r.units)}<br>${esc(r.observation_start_utc ?? "—")} — ${esc(r.observation_end_utc ?? "—")}</p>`).join("") || `<p>${esc(t("env.noObservations"))}</p>`}
      ${observations.map(recordDetails).join("")}
    </details>
  </section>`;
}

function recordDetails(selected: DecisionRecord): string {
  const r = selected.record;
  return `<details data-detail="record:${esc(r.record_id)}"><summary>${esc(t("env.source"))}: ${esc(variableLabel(r.variable))}${r.model_id ? ` · ${esc(r.model_id)}` : ""}</summary>
    <p>${esc(r.applicability ?? r.spatial_scope)}</p>
    <p>${esc(t("env.availability", { date: selected.effective_available_at_utc }))}</p>
    <pre class="nav-json">${esc(JSON.stringify({ ...selected, record: { ...r } }, null, 2))}</pre>
  </details>`;
}
