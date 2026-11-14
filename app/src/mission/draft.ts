/** Explicit P1 consumer of the P2 development draft; shared v0 is unchanged. */
export const DRAFT_SCHEMA = "p2-plan-draft-1" as const;
export type Pair = [number, number];
export type Assessment = "viable_model" | "conditional" | "incompatible" | "insufficient_evidence" | null;
export interface Parameters {
  flat_speed_m_s: number;
  max_ascent_deg: number;
  max_descent_deg: number;
  carrying_limit_kg: number;
  max_sortie_s: number;
}
export interface Member {
  profile_id: string;
  payload_kg: number;
  mission_overrides?: Partial<Parameters>;
}
export interface CatalogEntry {
  kind: "human" | "robot";
  identity: { profile_id: string; name: string };
  defaults: Parameters & { model_id: string };
}
export interface MissionTemplate {
  id: string;
  name: string;
  tasks: { id: string; duration_s: number }[];
  time_budget_s: number;
  reserve_s: number;
}
export interface Catalogs {
  catalog: { version: string; fixture: boolean; evidence_kind: string; entries: CatalogEntry[] };
  mission_templates: { version: string; fixture: boolean; evidence_kind: string; assumption: string; editable_fields: string[]; templates: MissionTemplate[] };
}
export interface Health {
  schema_version: typeof DRAFT_SCHEMA;
  contract_status: string;
  scope: string;
  geographic_conversion: "unavailable";
  registered_parcels: { id: string; version: string; fixture: boolean }[];
}
export interface Parcel {
  schema_version: typeof DRAFT_SCHEMA;
  id: string;
  version: string;
  fixture: boolean;
  coordinate_frame: "parcel_metric";
  geographic_conversion: "unavailable";
  reference_description: string;
  grid: { shape: Pair; spacing_m: Pair; origin_center_xy_m: Pair; row_direction: string };
  pois: { id: string; xy_m: Pair }[];
}
export interface PlanRequest {
  schema_version: typeof DRAFT_SCHEMA;
  request_id: string;
  revision: number;
  parcel: { id: string; version: string };
  scenario: { id: string; version: string; as_of_utc: string };
  origin: { type: "poi"; poi_id: string };
  destination: { type: "poi"; poi_id: string };
  team: { catalog_version: string; humans: Member[]; robots: Member[] };
  mission: { template_id: string; template_version: string; tasks: { id: string; duration_s: number }[]; time_budget_s: number; reserve_s: number; departure_utc: string };
  criterion: "fastest";
}
export interface Reason { code: string; path: string; message: string }
export interface Leg {
  status: string;
  reason: Reason | null;
  cells: Pair[];
  xy_m: Pair[];
  duration_s: number | null;
  search_cost_s: number | null;
  horizontal_distance_m: number | null;
  ascent_m: number | null;
  descent_m: number | null;
}
export interface Check {
  rule_id: string;
  status: "passed" | "failed" | "missing_evidence" | "not_evaluated";
  reason: Reason;
  participant_id: string | null;
  actual_s: number | null;
  limit_s: number | null;
  margin_s: number | null;
  evidence_ids: string[];
}
export interface Metrics {
  outbound_s: number | null;
  tasks_s: number;
  return_s: number | null;
  elapsed_s: number | null;
  reserve_s: number;
  reserved_total_s: number | null;
  time_budget_s: number;
  mission_margin_s: number | null;
  temporal_budget_limiting_margin_s: number | null;
  daylight_departure_margin_s: number | null;
  daylight_reserved_return_margin_s: number | null;
  estimated_return_offset_s: number | null;
  reserved_deadline_offset_s: number | null;
  unavailable_totals_reason: string | null;
  participant_margins: { participant_id: string; kind: string; max_sortie_s: number; margin_s: number | null; model_id: string }[];
}
export interface Alternative {
  id: string;
  criterion: string;
  assessment: Assessment;
  search_status: string;
  coordinate_frame: "parcel_metric";
  outbound: Leg;
  return: Leg;
  metrics: Metrics;
  checks: Check[];
}
export interface PlanResponse {
  schema_version: typeof DRAFT_SCHEMA;
  contract_status: string;
  request_echo: PlanRequest;
  assessment: Assessment;
  search_status: string;
  status: string;
  calculation_origin: "engine";
  input_provenance: { fixture: boolean; movement_parameters_evidence: string; geographic_conversion: string };
  alternatives: Alternative[];
  resolved_team: { kind: string; identity: CatalogEntry["identity"]; parameters: Parameters; payload_kg: number }[];
  environment: { missing_required: string[]; missing_optional_variables: string[]; decision_records: Record<string, unknown>[]; clock_mapping: Record<string, unknown>; snapshot: Record<string, unknown> };
  locations: { origin: { effective_xy_m: Pair }; destination: { effective_xy_m: Pair } };
  not_evaluated: string[];
  assumptions: string[];
  versions: Record<string, string>;
}
