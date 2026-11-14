import baseline from "../../../service/examples/request.example.json";
import type { ServiceMetadata } from "./api";
import { DRAFT_SCHEMA, type PlanRequest, type PlanResponse } from "./draft";

/** The request example supplies scenario identity; editable defaults come from catalogs. */
export function baselineRequest(metadata: ServiceMetadata): PlanRequest {
  const { parcel, catalogs } = metadata;
  const template = catalogs.mission_templates.templates.find((t) => t.id === baseline.mission.template_id);
  if (!template || !parcel.pois.some((p) => p.id === "base") || !parcel.pois.some((p) => p.id === "sample")) throw new Error("Required baseline metadata is unavailable.");
  return {
    schema_version: DRAFT_SCHEMA, request_id: crypto.randomUUID(), revision: 0,
    parcel: { id: parcel.id, version: parcel.version }, scenario: structuredClone(baseline.scenario),
    origin: { type: "poi", poi_id: "base" }, destination: { type: "poi", poi_id: "sample" },
    team: { ...structuredClone(baseline.team), catalog_version: catalogs.catalog.version },
    mission: { template_id: template.id, template_version: catalogs.mission_templates.version, tasks: structuredClone(template.tasks), time_budget_s: template.time_budget_s, reserve_s: template.reserve_s, departure_utc: baseline.mission.departure_utc },
    criterion: "fastest",
  };
}

/** Revision changes invalidate even edits that are subsequently reverted. */
export class RequestGate {
  revision = 0;
  private sequence = 0;
  edit() { this.revision += 1; }
  submit(state: PlanRequest): PlanRequest {
    this.sequence += 1;
    return { ...structuredClone(state), request_id: `${state.request_id.split(":")[0]}:${this.sequence}`, revision: this.revision };
  }
  accepts(request: PlanRequest, response: PlanResponse, current: PlanRequest): boolean {
    return request.revision === this.revision && request.request_id.endsWith(`:${this.sequence}`) &&
      response.request_echo.request_id === request.request_id && response.request_echo.revision === request.revision &&
      calculationKey(request) === calculationKey(current) && calculationKey(response.request_echo) === calculationKey(request);
  }
}

export function calculationKey({ request_id: _id, revision: _revision, ...inputs }: PlanRequest): string {
  // The HTTP encoder sorts object keys; comparisons must not depend on insertion order.
  const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) :
    value !== null && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)])) : value;
  return JSON.stringify(canonical(inputs));
}
