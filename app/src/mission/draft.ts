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
  geographic_conversion: "unavailable" | "available";
  default_parcel: { id: string; version: string };
  registered_parcels: { id: string; version: string; fixture: boolean }[];
}
export interface GeographicAdapter {
  id: "gale-eqc-scene-v1";
  projection: "spherical_equirectangular";
  radius_m: number;
  central_meridian_deg: 0;
  standard_parallel_deg: 0;
  latitude_convention: "source_latitude_direct_to_cesium_mars";
  horizontal_shift_m: { east: number; north: number };
  vertical_offset_m: number;
  registration_status: string;
  evidence: string;
}
export interface Parcel {
  schema_version: typeof DRAFT_SCHEMA;
  id: string;
  version: string;
  fixture: boolean;
  content_id: string;
  coordinate_frame: "parcel_metric";
  geographic_conversion: "unavailable" | "available";
  geographic_adapter: GeographicAdapter | null;
  bounds_lonlat: { west: number; south: number; east: number; north: number } | null;
  scenarios: { id: string; version: string; fixture: boolean; coverage?: { from_utc: string; to_utc: string }; environment?: Record<string, unknown> | null }[];
  planning_defaults: { origin_poi_id: string; destination_poi_id: string; scenario: PlanRequest["scenario"]; departure_utc: string };
  reference_description: string;
  grid: { shape: Pair; spacing_m: Pair; origin_center_xy_m: Pair; row_direction: string };
  pois: { id: string; xy_m: Pair; classification: string }[];
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
  reason: string | null;
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
  geographic_adapter: GeographicAdapter | null;
  alternatives: Alternative[];
  resolved_team: { kind: string; identity: CatalogEntry["identity"]; parameters: Parameters; payload_kg: number }[];
  environment: { missing_required: string[]; missing_optional_variables: string[]; missing_forecast_variables: string[]; decision_records: DecisionRecord[]; clock_mapping: Record<string, unknown>; snapshot: Record<string, unknown>; daylight: { start_s: number; end_s: number; method: string; evidence_kind: string; evaluation_location_id: string } | null; provider_metadata: Record<string, unknown> | null; forecast_applicability_rule: string; effects: string };
  locations: { origin: ResolvedLocation; destination: ResolvedLocation };
  not_evaluated: string[];
  assumptions: string[];
  versions: Record<string, string>;
}
export interface DecisionRecord {
  effective_available_at_utc: string;
  availability_basis: string;
  record: {
    record_id: string; kind: string; variable: string; value: number | Pair | null; units: string;
    evidence_kind: string; source_id: string; source_location_id: string; spatial_scope: string;
    fetched_at_utc: string; issued_at_utc: string | null; observation_start_utc: string | null; observation_end_utc: string | null;
    valid_from_utc: string | null; valid_to_utc: string | null;
    quantiles: { p10: number | null; p50: number | null; p90: number | null } | null;
    model_id: string | null; model_version: string | null; training_cutoff_utc: string | null; model_available_at_utc: string | null;
    issue_sol: number | null; target_sol: number | null; lead_sols: number | null;
    interval_method: string | null; provenance: Record<string, unknown> | null; applicability: string | null;
    input_intervals: { source: string; start_utc: string; end_utc: string }[];
  };
}
export interface ResolvedLocation {
  requested: Record<string, unknown>;
  requested_xy_m: Pair;
  effective_xy_m: Pair;
  cell: Pair;
  effective_elevation_m: number;
  adapter_id: string;
  geographic_conversion: "available" | "unavailable";
}
