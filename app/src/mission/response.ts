/**
 * Planning response. Follows draft v0 of `contracts/plan_response.example.json`.
 * The UI tolerates unknown statuses (shows them as they come) so it does not break if the contract grows.
 */

export type EvalStatus = "viable_model" | "conditional" | "incompatible" | "insufficient_evidence";
export type ResponseStatus = EvalStatus | "error" | "search_inconclusive";

export interface Provenance {
  class?: string;
  mission?: string;
  instrument?: string;
  product?: string;
  url?: string;
  kind?: string;
  origin?: string;
  fetched_at?: string;
}

export interface Leg {
  lonlat: [number, number][];
  distance_m: number;
  ascent_m: number;
  descent_m: number;
  duration_s: number;
}

export interface ConstraintCheck {
  id: string;
  status: "ok" | "violated" | string;
  detail: string;
  provenance?: Provenance;
}

export interface PreferenceNote {
  id: string;
  status: "favorable" | "unfavorable" | string;
  detail: string;
}

export interface Alternative {
  id: string;
  criterion: string;
  status: EvalStatus | string;
  outbound: Leg;
  return: Leg;
  tasks_s: number;
  reserve_s: number;
  budget: { total_s: number; time_budget_s: number; margin_s: number };
  constraints: ConstraintCheck[];
  preferences: PreferenceNote[];
  evidence?: { nodata_fraction?: number; analytic_cell_m?: number; notes?: string };
  warnings: string[];
}

export interface PlanResponse {
  schema_version: number;
  fixture?: boolean;
  request_echo?: { parcel_id?: string; origin_poi?: string; destination_poi?: string };
  status: ResponseStatus | string;
  summary_reason: string;
  alternatives: Alternative[];
  not_evaluated?: string[];
  input_versions?: Record<string, string>;
}

/** Minimal shape check before drawing (not a replacement for a schema validator). */
export function isPlanResponse(x: unknown): x is PlanResponse {
  if (!x || typeof x !== "object") return false;
  const r = x as Record<string, unknown>;
  return typeof r.status === "string" && typeof r.summary_reason === "string" && Array.isArray(r.alternatives);
}
