import { t, type MessageKey } from "../i18n";
import type { MissionState, Preferences, Profile, Task, TemplateId } from "./types";

/**
 * Initial values of the four mission types.
 *
 * Editable ASSUMPTIONS for the POC: task durations, reserve and budget are hypothetical.
 * The human profile uses reference values from Apollo and Earth tests: they are not operational
 * limits for Mars. When P2-01 (engine) publishes its templates, replace these values with theirs
 * so there is a single source.
 */

export function defaultProfile(): Profile {
  return {
    id: "astronauta_a_pie", // contract value
    max_slope_deg: 16.7,
    flat_speed_m_s: 0.42,
    speed_model: "tobler_like_v0",
    parameter_sources: {
      max_slope_deg: t("profile.source.maxSlope"),
      flat_speed_m_s: t("profile.source.flatSpeed"),
    },
  };
}

export interface MissionTemplate {
  id: TemplateId;
  label: string;
  description: string;
  tasks: Task[];
  reserve_s: number;
  time_budget_s: number;
  preferences: Preferences;
}

const MIN = 60;
const HOUR = 3600;

/** Task ids are contract values; their labels come from the dictionary. */
const task = (id: string, duration_s: number): Task => ({ id, label: t(`task.${id}` as MessageKey), duration_s });

function template(id: TemplateId, rest: Omit<MissionTemplate, "id" | "label" | "description">): MissionTemplate {
  return {
    id,
    label: t(`template.${id}` as MessageKey),
    description: t(`template.${id}.desc` as MessageKey),
    ...rest,
  };
}

export const TEMPLATES: Record<TemplateId, MissionTemplate> = {
  observacion_geologica: template("observacion_geologica", {
    tasks: [task("foto_contexto", 15 * MIN), task("muestreo", 30 * MIN)],
    reserve_s: 1 * HOUR,
    time_budget_s: 7 * HOUR,
    preferences: { time: 1.0, effort: 0.5, comm: 0.0 },
  }),
  exploracion_topografica: template("exploracion_topografica", {
    tasks: [task("relevamiento_fotogrametrico", 40 * MIN), task("marcar_puntos", 15 * MIN)],
    reserve_s: 1 * HOUR,
    time_budget_s: 7 * HOUR,
    preferences: { time: 0.6, effort: 0.8, comm: 0.0 },
  }),
  reconocimiento: template("reconocimiento", {
    tasks: [task("inspeccion_visual", 20 * MIN)],
    reserve_s: 45 * MIN,
    time_budget_s: 5 * HOUR,
    preferences: { time: 1.0, effort: 0.3, comm: 0.0 },
  }),
  medicion_ambiental: template("medicion_ambiental", {
    tasks: [task("instalar_sensor", 20 * MIN), task("medicion", 45 * MIN)],
    reserve_s: 1 * HOUR,
    time_budget_s: 7 * HOUR,
    preferences: { time: 0.7, effort: 0.5, comm: 0.0 },
  }),
};

export const DEFAULT_SOL = 4995; // last sol with REMS data (historical observation)
export const DEFAULT_DEPARTURE = "09:00";

/** Initial state of a mission type. Keeps origin/destination if given. */
export function stateFromTemplate(id: TemplateId, origin_poi: string, destination_poi: string): MissionState {
  const tpl = TEMPLATES[id];
  return {
    template_id: id,
    origin_poi,
    destination_poi,
    tasks: tpl.tasks.map((task) => ({ ...task })),
    departure_local: DEFAULT_DEPARTURE,
    sol: DEFAULT_SOL,
    reserve_s: tpl.reserve_s,
    time_budget_s: tpl.time_budget_s,
    profile: defaultProfile(),
    mode: "a_pie",
    preferences: { ...tpl.preferences },
  };
}
