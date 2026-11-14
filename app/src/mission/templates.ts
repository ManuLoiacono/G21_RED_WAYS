import { isAnyTranslation, t, type MessageKey } from "../i18n";
import type { MissionState, Preferences, Profile, Task, TemplateId } from "./types";

/**
 * Initial values of the four mission types.
 *
 * Editable ASSUMPTIONS for the POC: task durations, reserve and budget are hypothetical.
 * The human profile uses reference values from Apollo and Earth tests: they are not operational
 * limits for Mars. When P2-01 (engine) publishes its templates, replace these values with theirs
 * so there is a single source.
 *
 * Labels are never stored here: they are read from the dictionary when needed, so a language
 * switch shows them in the new language.
 */

const SOURCE_KEYS = { max_slope_deg: "profile.source.maxSlope", flat_speed_m_s: "profile.source.flatSpeed" } as const;

export function defaultProfile(): Profile {
  return {
    id: "astronauta_a_pie", // contract value
    max_slope_deg: 16.7,
    flat_speed_m_s: 0.42,
    speed_model: "tobler_like_v0",
    parameter_sources: {
      max_slope_deg: t(SOURCE_KEYS.max_slope_deg),
      flat_speed_m_s: t(SOURCE_KEYS.flat_speed_m_s),
    },
  };
}

interface TemplateTask {
  /** Contract task id; its label is `task.<id>` in the dictionary. */
  id: string;
  duration_s: number;
}

export interface MissionTemplate {
  id: TemplateId;
  tasks: TemplateTask[];
  reserve_s: number;
  time_budget_s: number;
  preferences: Preferences;
}

const MIN = 60;
const HOUR = 3600;

export const TEMPLATES: Record<TemplateId, MissionTemplate> = {
  observacion_geologica: {
    id: "observacion_geologica",
    tasks: [
      { id: "foto_contexto", duration_s: 15 * MIN },
      { id: "muestreo", duration_s: 30 * MIN },
    ],
    reserve_s: 1 * HOUR,
    time_budget_s: 7 * HOUR,
    preferences: { time: 1.0, effort: 0.5, comm: 0.0 },
  },
  exploracion_topografica: {
    id: "exploracion_topografica",
    tasks: [
      { id: "relevamiento_fotogrametrico", duration_s: 40 * MIN },
      { id: "marcar_puntos", duration_s: 15 * MIN },
    ],
    reserve_s: 1 * HOUR,
    time_budget_s: 7 * HOUR,
    preferences: { time: 0.6, effort: 0.8, comm: 0.0 },
  },
  reconocimiento: {
    id: "reconocimiento",
    tasks: [{ id: "inspeccion_visual", duration_s: 20 * MIN }],
    reserve_s: 45 * MIN,
    time_budget_s: 5 * HOUR,
    preferences: { time: 1.0, effort: 0.3, comm: 0.0 },
  },
  medicion_ambiental: {
    id: "medicion_ambiental",
    tasks: [
      { id: "instalar_sensor", duration_s: 20 * MIN },
      { id: "medicion", duration_s: 45 * MIN },
    ],
    reserve_s: 1 * HOUR,
    time_budget_s: 7 * HOUR,
    preferences: { time: 0.7, effort: 0.5, comm: 0.0 },
  },
};

export const templateLabel = (id: TemplateId) => t(`template.${id}` as MessageKey);
export const templateDescription = (id: TemplateId) => t(`template.${id}.desc` as MessageKey);
const taskKey = (id: string) => `task.${id}` as MessageKey;

export const DEFAULT_SOL = 4995; // last sol with REMS data (historical observation)
export const DEFAULT_DEPARTURE = "09:00";

/** Initial state of a mission type. Keeps origin/destination if given. */
export function stateFromTemplate(id: TemplateId, origin_poi: string, destination_poi: string): MissionState {
  const tpl = TEMPLATES[id];
  return {
    template_id: id,
    origin_poi,
    destination_poi,
    tasks: tpl.tasks.map((task): Task => ({ id: task.id, label: t(taskKey(task.id)), duration_s: task.duration_s })),
    departure_local: DEFAULT_DEPARTURE,
    sol: DEFAULT_SOL,
    reserve_s: tpl.reserve_s,
    time_budget_s: tpl.time_budget_s,
    profile: defaultProfile(),
    mode: "a_pie",
    preferences: { ...tpl.preferences },
  };
}

/**
 * After a language switch, translates the texts the app generated (template task labels,
 * "Task N" labels, profile source notes). Anything the user typed is left untouched.
 */
export function relabelState(state: MissionState) {
  state.tasks.forEach((task) => {
    if (TEMPLATES[state.template_id].tasks.some((tt) => tt.id === task.id) && isAnyTranslation(task.label, taskKey(task.id))) {
      task.label = t(taskKey(task.id));
      return;
    }
    const n = /^task_(\d+)$/.exec(task.id)?.[1];
    if (n && isAnyTranslation(task.label, "mp.task.default", { n })) task.label = t("mp.task.default", { n });
  });
  const sources = state.profile.parameter_sources;
  for (const [field, key] of Object.entries(SOURCE_KEYS)) {
    if (sources[field] !== undefined && isAnyTranslation(sources[field], key)) sources[field] = t(key);
  }
}
