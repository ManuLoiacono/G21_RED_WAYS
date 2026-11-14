import type { PlanRequest } from "./types";

/** URL del servicio de rutas (persona 2). Se puede cambiar con VITE_SERVICE_URL en app/.env. */
export const SERVICE_URL = import.meta.env.VITE_SERVICE_URL ?? "http://localhost:8000";

export type PlanResult = { ok: true; data: unknown } | { ok: false; error: string };

export async function postPlan(req: PlanRequest): Promise<PlanResult> {
  let res: Response;
  try {
    res = await fetch(`${SERVICE_URL}/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
  } catch {
    return { ok: false, error: `No se pudo contactar el servicio de rutas (${SERVICE_URL}). ¿Está levantado?` };
  }
  if (!res.ok) return { ok: false, error: `El servicio de rutas respondió ${res.status}.` };
  try {
    return { ok: true, data: await res.json() };
  } catch {
    return { ok: false, error: "El servicio de rutas devolvió una respuesta que no es JSON." };
  }
}
