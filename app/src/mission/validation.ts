import { DRAFT_SCHEMA, type Catalogs, type Health, type Parcel, type PlanResponse } from "./draft";

type Obj = Record<string, unknown>;
export const object = (x: unknown): x is Obj => typeof x === "object" && x !== null && !Array.isArray(x);
const str = (x: unknown): x is string => typeof x === "string";
const num = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const nullableNum = (x: unknown) => x === null || num(x);
const strings = (x: unknown) => Array.isArray(x) && x.every(str);
const pair = (x: unknown) => Array.isArray(x) && x.length === 2 && x.every(num);
const list = (x: unknown, check: (item: Obj) => boolean) => Array.isArray(x) && x.every((v) => object(v) && check(v));
const reason = (x: unknown) => object(x) && str(x.code) && str(x.path) && str(x.message);
const assessment = (x: unknown) => x === null || ["viable_model", "conditional", "incompatible", "insufficient_evidence"].includes(x as string);
const parameters = (x: unknown) => object(x) && ["flat_speed_m_s", "max_ascent_deg", "max_descent_deg", "carrying_limit_kg", "max_sortie_s"].every((key) => num(x[key]));
const identity = (x: unknown) => object(x) && str(x.profile_id) && str(x.name);
const finiteJson = (x: unknown): boolean => typeof x === "number" ? Number.isFinite(x) :
  Array.isArray(x) ? x.every(finiteJson) : object(x) ? Object.values(x).every(finiteJson) : true;
const geographicState = (x: unknown) => x === "unavailable" || x === "available";
export const isGeographicAdapter = (a: unknown) => object(a) && finiteJson(a) && a.id === "gale-eqc-scene-v1" &&
  a.projection === "spherical_equirectangular" && num(a.radius_m) && a.radius_m === 3396190 &&
  a.central_meridian_deg === 0 && a.standard_parallel_deg === 0 &&
  a.latitude_convention === "source_latitude_direct_to_cesium_mars" && object(a.horizontal_shift_m) &&
  num(a.horizontal_shift_m.east) && num(a.horizontal_shift_m.north) && num(a.vertical_offset_m) && str(a.registration_status) && str(a.evidence);

export function isHealth(x: unknown): x is Health {
  return object(x) && x.schema_version === DRAFT_SCHEMA && str(x.contract_status) && str(x.scope) && geographicState(x.geographic_conversion) &&
    object(x.default_parcel) && str(x.default_parcel.id) && str(x.default_parcel.version) &&
    list(x.registered_parcels, (p) => str(p.id) && str(p.version) && typeof p.fixture === "boolean");
}
export function isParcel(x: unknown): x is Parcel {
  return object(x) && x.schema_version === DRAFT_SCHEMA && str(x.id) && str(x.version) && str(x.content_id) && typeof x.fixture === "boolean" &&
    x.coordinate_frame === "parcel_metric" && geographicState(x.geographic_conversion) && str(x.reference_description) &&
    (x.geographic_conversion === "available" ? isGeographicAdapter(x.geographic_adapter) && object(x.bounds_lonlat) && ["west", "south", "east", "north"].every((k) => object(x.bounds_lonlat) && num(x.bounds_lonlat[k])) : x.geographic_adapter === null) &&
    list(x.scenarios, (s) => str(s.id) && str(s.version) && typeof s.fixture === "boolean") &&
    object(x.planning_defaults) && str(x.planning_defaults.origin_poi_id) && str(x.planning_defaults.destination_poi_id) && str(x.planning_defaults.departure_utc) &&
    object(x.planning_defaults.scenario) && str(x.planning_defaults.scenario.id) && str(x.planning_defaults.scenario.version) && str(x.planning_defaults.scenario.as_of_utc) &&
    object(x.grid) && pair(x.grid.shape) && pair(x.grid.spacing_m) && pair(x.grid.origin_center_xy_m) && str(x.grid.row_direction) &&
    list(x.pois, (p) => str(p.id) && pair(p.xy_m) && str(p.classification));
}
export function isCatalogs(x: unknown): x is Catalogs {
  if (!object(x) || !object(x.catalog) || !object(x.mission_templates)) return false;
  const { catalog: c, mission_templates: m } = x;
  return str(c.version) && typeof c.fixture === "boolean" && str(c.evidence_kind) &&
    list(c.entries, (e) => ["human", "robot"].includes(e.kind as string) && identity(e.identity) && parameters(e.defaults) && object(e.defaults) && str(e.defaults.model_id)) &&
    str(m.version) && typeof m.fixture === "boolean" && str(m.evidence_kind) && str(m.assumption) && strings(m.editable_fields) &&
    list(m.templates, (t) => str(t.id) && str(t.name) && num(t.time_budget_s) && num(t.reserve_s) && list(t.tasks, (v) => str(v.id) && num(v.duration_s)));
}
const leg = (x: unknown) => object(x) && str(x.status) && (x.reason === null || str(x.reason)) &&
  Array.isArray(x.xy_m) && x.xy_m.every(pair) && Array.isArray(x.cells) && x.cells.every(pair) && x.cells.length === x.xy_m.length &&
  ["duration_s", "search_cost_s", "horizontal_distance_m", "ascent_m", "descent_m"].every((k) => nullableNum(x[k])) &&
  (x.status === "found" ? x.xy_m.length >= 1 && num(x.duration_s) : x.xy_m.length === 0 && x.duration_s === null);
const metricKeys = ["outbound_s", "tasks_s", "return_s", "elapsed_s", "reserve_s", "reserved_total_s", "time_budget_s", "mission_margin_s", "temporal_budget_limiting_margin_s", "daylight_departure_margin_s", "daylight_reserved_return_margin_s", "estimated_return_offset_s", "reserved_deadline_offset_s"];
const metrics = (x: unknown) => object(x) && metricKeys.every((k) => nullableNum(x[k])) &&
  ["tasks_s", "reserve_s", "time_budget_s"].every((k) => num(x[k])) &&
  (x.unavailable_totals_reason === null || str(x.unavailable_totals_reason)) &&
  list(x.participant_margins, (p) => str(p.participant_id) && str(p.kind) && num(p.max_sortie_s) && nullableNum(p.margin_s) && str(p.model_id));
const check = (c: Obj) => str(c.rule_id) && ["passed", "failed", "missing_evidence", "not_evaluated"].includes(c.status as string) && reason(c.reason) &&
  (c.participant_id === null || str(c.participant_id)) && ["actual_s", "limit_s", "margin_s"].every((k) => nullableNum(c[k])) && strings(c.evidence_ids);

/** Validate all nested values read by the UI; null metrics stay unavailable. */
export function isDraftResponse(x: unknown): x is PlanResponse {
  if (!object(x) || !finiteJson(x)) return false;
  const e = x.environment;
  const locations = x.locations;
  return x.schema_version === DRAFT_SCHEMA && str(x.contract_status) && x.calculation_origin === "engine" &&
    object(x.request_echo) && str(x.request_echo.request_id) && Number.isInteger(x.request_echo.revision) && (x.request_echo.revision as number) >= 0 &&
    assessment(x.assessment) && str(x.search_status) && x.status === (x.assessment ?? x.search_status) &&
    object(x.input_provenance) && typeof x.input_provenance.fixture === "boolean" && str(x.input_provenance.movement_parameters_evidence) && str(x.input_provenance.geographic_conversion) &&
    (x.input_provenance.geographic_conversion === "available" ? isGeographicAdapter(x.geographic_adapter) : x.input_provenance.geographic_conversion === "unavailable" && x.geographic_adapter === null) &&
    list(x.alternatives, (a) => str(a.id) && str(a.criterion) && assessment(a.assessment) && str(a.search_status) && a.coordinate_frame === "parcel_metric" &&
      leg(a.outbound) && leg(a.return) && metrics(a.metrics) && list(a.checks, check)) &&
    list(x.resolved_team, (p) => str(p.kind) && identity(p.identity) && parameters(p.parameters) && num(p.payload_kg)) &&
    object(e) && strings(e.missing_required) && strings(e.missing_optional_variables) && Array.isArray(e.decision_records) && e.decision_records.every(object) && object(e.clock_mapping) && object(e.snapshot) &&
    object(locations) && ["origin", "destination"].every((k) => object(locations[k]) && pair(locations[k].effective_xy_m) &&
      pair(locations[k].requested_xy_m) && pair(locations[k].cell) && (locations[k].cell as number[]).every((n) => Number.isInteger(n) && n >= 0) &&
      num(locations[k].effective_elevation_m) && str(locations[k].adapter_id) && geographicState(locations[k].geographic_conversion) && object(locations[k].requested)) &&
    strings(x.not_evaluated) && strings(x.assumptions) && object(x.versions) && Object.values(x.versions).every(str);
}
