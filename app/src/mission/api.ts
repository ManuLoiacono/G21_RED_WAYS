import { SIMULATED_RESPONSES } from "../fixtures/plan_responses.fixture";
import { isPlanResponse, type PlanResponse } from "./response";
import type { PlanRequest } from "./types";

/** URL del servicio de rutas (persona 2). Se puede cambiar con VITE_SERVICE_URL en app/.env. */
export const SERVICE_URL = import.meta.env.VITE_SERVICE_URL ?? "http://localhost:8000";

export type PlanResult =
  | { ok: true; data: PlanResponse; simulated: boolean }
  | { ok: false; error: string };

/**
 * Envía el pedido al motor. Si el servicio no responde (no está levantado o se cayó),
 * devuelve una respuesta SIMULADA (fixture) marcada como tal. Si el servicio responde con
 * un error, se informa el error: no se tapa con una simulación.
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
  if (!res.ok) return { ok: false, error: `El servicio de rutas respondió ${res.status}.` };
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return { ok: false, error: "El servicio de rutas devolvió una respuesta que no es JSON." };
  }
  if (!isPlanResponse(data)) return { ok: false, error: "La respuesta del servicio no tiene el formato del contrato." };
  return { ok: true, data, simulated: false };
}

function simulatedPlan(req: PlanRequest): PlanResult {
  const fixture = SIMULATED_RESPONSES[req.destination_poi];
  if (!fixture) {
    return { ok: false, error: `No se pudo contactar el servicio de rutas (${SERVICE_URL}) y no hay respuesta simulada para este destino.` };
  }
  const data: PlanResponse = {
    ...structuredClone(fixture),
    request_echo: { parcel_id: req.parcel_id, origin_poi: req.origin_poi, destination_poi: req.destination_poi },
  };
  return { ok: true, data, simulated: true };
}
