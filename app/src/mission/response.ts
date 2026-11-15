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

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === "object" && x !== null && !Array.isArray(x);
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const isStr = (x: unknown): x is string => typeof x === "string";
const isArrayOf = <T>(x: unknown, item: (v: unknown) => v is T): x is T[] => Array.isArray(x) && x.every(item);

const isLonLat = (x: unknown): x is [number, number] =>
  Array.isArray(x) && x.length >= 2 && isNum(x[0]) && isNum(x[1]) && Math.abs(x[0]) <= 360 && Math.abs(x[1]) <= 90;

function isLeg(x: unknown): x is Leg {
  return (
    isObj(x) &&
    isArrayOf(x.lonlat, isLonLat) &&
    x.lonlat.length >= 2 &&
    isNum(x.distance_m) &&
    isNum(x.ascent_m) &&
    isNum(x.descent_m) &&
    isNum(x.duration_s)
  );
}

const isConstraint = (x: unknown): x is ConstraintCheck => isObj(x) && isStr(x.id) && isStr(x.status) && isStr(x.detail);
const isPreference = (x: unknown): x is PreferenceNote => isObj(x) && isStr(x.id) && isStr(x.status) && isStr(x.detail);

function isAlternative(x: unknown): x is Alternative {
  if (!isObj(x)) return false;
  const b = x.budget;
  return (
    isStr(x.id) &&
    isStr(x.criterion) &&
    isStr(x.status) &&
    isLeg(x.outbound) &&
    isLeg(x.return) &&
    isNum(x.tasks_s) &&
    isNum(x.reserve_s) &&
    isObj(b) &&
    isNum(b.total_s) &&
    isNum(b.time_budget_s) &&
    isNum(b.margin_s) &&
    isArrayOf(x.constraints, isConstraint) &&
    isArrayOf(x.preferences, isPreference) &&
    isArrayOf(x.warnings, isStr) &&
    (x.evidence === undefined || isObj(x.evidence))
  );
}

/**
 * Structural check before trusting route geometry and nested metrics from the service: every
 * field the UI draws or reads must have the right type. A response that fails is reported as
 * an error, never drawn partially. (Not a replacement for a schema validator.)
 */
export function isPlanResponse(x: unknown): x is PlanResponse {
  return (
    isObj(x) &&
    isNum(x.schema_version) &&
    isStr(x.status) &&
    isStr(x.summary_reason) &&
    isArrayOf(x.alternatives, isAlternative) &&
    (x.not_evaluated === undefined || isArrayOf(x.not_evaluated, isStr)) &&
    (x.request_echo === undefined || isObj(x.request_echo))
  );
}
