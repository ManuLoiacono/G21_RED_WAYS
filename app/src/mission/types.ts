/**
 * Mission planning types. They follow draft v0 of `contracts/plan_request.example.json`.
 * If the contract changes in T0-01, update this file and `request.ts`.
 *
 * Note: template ids, modes and POI roles are contract wire values (agreed with the team in
 * Spanish). They are data, not identifiers of this code base, so they stay as the contract says.
 */

export const TEMPLATE_IDS = [
  "observacion_geologica",
  "exploracion_topografica",
  "reconocimiento",
  "medicion_ambiental",
] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

/** Contract values: on foot / with support robot. */
export type Mode = "a_pie" | "con_robot";

/** Contract values: base / destination. */
export type PoiRole = "base" | "destino";

export interface Task {
  id: string;
  label: string;
  duration_s: number;
}

export interface Profile {
  id: string;
  max_slope_deg: number;
  flat_speed_m_s: number;
  speed_model: string;
  parameter_sources: Record<string, string>;
}

export interface Preferences {
  time: number;
  effort: number;
  comm: number;
}

/** Editable form state (SI units, same as the contract). */
export interface MissionState {
  template_id: TemplateId;
  origin_poi: string;
  destination_poi: string;
  tasks: Task[];
  departure_local: string; // "HH:MM", local solar time
  sol: number;
  reserve_s: number;
  time_budget_s: number;
  profile: Profile;
  mode: Mode;
  preferences: Preferences;
}

/** Planning request (contract v0). */
export interface PlanRequest {
  schema_version: number;
  parcel_id: string;
  origin_poi: string;
  destination_poi: string;
  mission: {
    template_id: TemplateId;
    tasks: { id: string; duration_s: number }[];
    departure_local: string;
    scenario_id: string;
    reserve_s: number;
    time_budget_s: number;
  };
  profiles: Profile[];
  mode: Mode;
  preferences: Preferences;
}

/** Point of interest (base or destination), read from the `poi` contract GeoJSON. */
export interface Poi {
  id: string;
  role: PoiRole;
  /** Contract title. For display use `poiTitle(poi)`, which picks the UI language. */
  title: string;
  /** Optional titles by language code (from `title_<lang>` properties). */
  titles: Record<string, string>;
  hypothetical: boolean;
  families: TemplateId[];
  lonlat: [number, number];
  fixture: boolean;
}
