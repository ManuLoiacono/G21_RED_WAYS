/** Compact presentation of supplied decision records; no forecast recomputation. */
import { getLanguage, t, type MessageKey } from "../i18n";
import { esc } from "../ui/format";
import { infoButton } from "../provenance/sources";
import type { Alternative, PlanResponse } from "./draft";

const labels: Record<string, MessageKey> = {
  pressure_pa: "context.pressure", daily_min_temp_c: "context.minimum", daily_max_temp_c: "context.maximum",
  min_temp_c: "context.minimum", max_temp_c: "context.maximum", dose_b_rtgcorr_ugy_day: "context.rad",
};
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const number = (v: number) => v.toLocaleString(getLanguage(), { maximumFractionDigits: 2 });

export function environmentContext(alt: Alternative | undefined, fallback?: PlanResponse["environment"]): string {
  const evidence = alt?.environment ?? fallback;
  if (!evidence) return "";
  const rows = evidence.decision_records.flatMap((item) => {
    const r = item.record;
    if (!object(r) || typeof r.variable !== "string" || !labels[r.variable] || typeof r.units !== "string") return [];
    const forecast = r.kind === "forecast" && r.evidence_kind === "forecast";
    const observation = r.kind === "observation" && r.evidence_kind === "observed";
    if (!forecast && !observation) return [];
    const q = object(r.quantiles) ? r.quantiles : {};
    const value = forecast ? q.p50 : r.value;
    if (!finite(value)) return [];
    const quantiles = forecast ? ["p10", "p50", "p90"].flatMap((k) => finite(q[k]) ? [`${k}: ${q[k]}`] : []).join(" · ") : "";
    const dates = forecast ? `${t("context.issued")}: ${r.issued_at_utc ?? ""} · ${t("context.target")}: ${r.target_sol ?? ""} · ${t("context.horizon")}: ${r.lead_sols ?? ""} · ${r.valid_from_utc ?? ""} – ${r.valid_to_utc ?? ""}`
      : `${r.observation_start_utc ?? ""} – ${r.observation_end_utc ?? ""}`;
    const detail = `${quantiles} ${r.units} · ${dates} · ${r.model_id ?? r.source_id ?? ""}`;
    return [`<div title="${esc(detail)}"><dt>${esc(t(labels[r.variable]))} <small>${esc(t(forecast ? "context.prediction" : "context.observation"))}</small></dt><dd>${esc(number(value))} ${esc(r.units)}</dd></div>`];
  });
  return rows.length ? `<details class="rs-section" data-context="environment" data-detail="environment"><summary>${esc(t("context.environment"))}</summary><dl class="rs-metrics">${rows.join("")}</dl></details>` : "";
}

export function terrainContext(alt: Alternative): string {
  const terrain = alt.terrain_context;
  if (!terrain || !terrain.categories || !["evaluated", "partial"].includes(terrain.status)) return "";
  const { looser, unknown } = terrain.categories;
  return `<details class="rs-section" data-detail="terrain:${esc(alt.id)}"><summary>${esc(t("context.terrain"))}${looser.distance_m > 0 ? ` · ${esc(t("context.crossing", { distance: number(looser.distance_m) }))}` : ""}</summary>
    <p>${esc(t("context.terrainBasis", { resolution: number(terrain.pixel_m!) }))} ${infoButton("themis_nir", t("context.terrain"))}</p>
    <dl class="rs-metrics">${(["looser", "intermediate", "firmer", "unknown"] as const).map((band) => `<div><dt>${esc(t(`context.${band}`))}</dt><dd>${esc(number(terrain.categories![band].distance_m))} m</dd></div>`).join("")}</dl>
    ${unknown.distance_m > 0 || terrain.status === "partial" ? `<p>${esc(t("context.partial"))}</p>` : ""}</details>`;
}
