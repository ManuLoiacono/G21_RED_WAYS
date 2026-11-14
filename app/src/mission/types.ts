/**
 * Tipos de la preparación de misión. Siguen el borrador v0 de `contracts/plan_request.example.json`.
 * Si el contrato cambia en T0-01, ajustar acá y en `request.ts`.
 */

export const TEMPLATE_IDS = [
  "observacion_geologica",
  "exploracion_topografica",
  "reconocimiento",
  "medicion_ambiental",
] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

export type Mode = "a_pie" | "con_robot";

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

/** Estado editable del formulario (unidades SI, igual que el contrato). */
export interface MissionState {
  template_id: TemplateId;
  origin_poi: string;
  destination_poi: string;
  tasks: Task[];
  departure_local: string; // "HH:MM", hora solar local
  sol: number;
  reserve_s: number;
  time_budget_s: number;
  profile: Profile;
  mode: Mode;
  preferences: Preferences;
}

/** Pedido de planificación (contrato v0). */
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

/** Punto de interés (base o destino), leído del GeoJSON del contrato `poi`. */
export interface Poi {
  id: string;
  role: "base" | "destino";
  title: string;
  hypothetical: boolean;
  families: TemplateId[];
  lonlat: [number, number];
  fixture: boolean;
}
