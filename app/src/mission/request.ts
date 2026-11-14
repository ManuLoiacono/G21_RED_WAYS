import type { MissionState, PlanRequest } from "./types";

export const PLAN_REQUEST_SCHEMA_VERSION = 0;

/** Arma el pedido de planificación (contrato v0) a partir del estado del formulario. */
export function toPlanRequest(s: MissionState, parcelId: string): PlanRequest {
  return {
    schema_version: PLAN_REQUEST_SCHEMA_VERSION,
    parcel_id: parcelId,
    origin_poi: s.origin_poi,
    destination_poi: s.destination_poi,
    mission: {
      template_id: s.template_id,
      tasks: s.tasks.map((t) => ({ id: t.id, duration_s: t.duration_s })),
      departure_local: s.departure_local,
      scenario_id: `rems_sol_${s.sol}`,
      reserve_s: s.reserve_s,
      time_budget_s: s.time_budget_s,
    },
    profiles: [structuredClone(s.profile)],
    mode: s.mode,
    preferences: { ...s.preferences },
  };
}
