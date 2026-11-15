import { t } from "../i18n";
import { esc } from "../ui/format";
import { environmentContext } from "./context";
import type { Alternative, PlanResponse } from "./draft";
/** Filters only the decision-safe planning snapshot; simulation never fetches later observations. */
export function simulationEnvironment(alt: Alternative, response: PlanResponse, elapsed: number): string {
  const evidence = alt.environment ?? (response.alternatives.length === 1 ? response.environment : undefined);
  if (!evidence) return "";
  const instant = Date.parse(response.request_echo.mission.departure_utc) + elapsed * 1000;
  const decision_records = evidence.decision_records.filter(item => {
    const r = item.record as Record<string, unknown>;
    if (!r || typeof r !== "object") return false;
    if (r.kind === "observation") return Date.parse(String(r.observation_end_utc)) <= instant;
    return r.kind === "forecast" && Date.parse(String(r.valid_from_utc)) <= instant && instant < Date.parse(String(r.valid_to_utc));
  });
  const html = environmentContext({ ...alt, environment: { ...evidence, decision_records } });
  return `<p class="mp-hint"><span class="demo-clock-pulse" aria-hidden="true">◉</span> ${esc(t("demo.daily"))} <time>${esc(new Date(Math.floor(instant / 1000) * 1000).toISOString())}</time></p>${html}`;
}
