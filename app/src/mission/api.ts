import { simulatedResponse } from "../fixtures/plan_responses.fixture";
import { t } from "../i18n";
import { isPlanResponse, type PlanResponse } from "./response";
import type { PlanRequest } from "./types";

/** Route service URL (persona 2). Can be changed with VITE_SERVICE_URL in app/.env. */
export const SERVICE_URL = import.meta.env.VITE_SERVICE_URL ?? "http://localhost:8000";

export type PlanResult =
  | { ok: true; data: PlanResponse; simulated: boolean }
  | { ok: false; error: string };

/**
 * Sends the request to the engine. If the service does not answer (not running or down),
 * returns a SIMULATED response (fixture) flagged as such. If the service answers with an
 * error, the error is reported: it is never hidden behind a simulation.
 */
export async function requestPlan(req: PlanRequest): Promise<PlanResult> {
  let res: Response;
  try {
    res = await fetch(`${SERVICE_URL}/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
  } catch {
    return simulatedPlan(req);
  }
  if (!res.ok) return { ok: false, error: t("api.httpError", { status: res.status }) };
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return { ok: false, error: t("api.notJson") };
  }
  if (!isPlanResponse(data)) return { ok: false, error: t("api.badShape") };
  return { ok: true, data, simulated: false };
}

/** Simulated response for the request, in the current UI language (also used after a language switch). */
export function simulatedPlan(req: PlanRequest): PlanResult {
  const fixture = simulatedResponse(req.destination_poi);
  if (!fixture) return { ok: false, error: t("api.noSimulation", { url: SERVICE_URL }) };
  const data: PlanResponse = {
    ...fixture,
    request_echo: { parcel_id: req.parcel_id, origin_poi: req.origin_poi, destination_poi: req.destination_poi },
  };
  return { ok: true, data, simulated: true };
}
