import type { MissionState, Preferences, Profile, Task, TemplateId } from "./types";

/**
 * Valores iniciales de las cuatro familias de misión.
 *
 * SUPUESTOS editables para la POC: duraciones de tareas, reserva y presupuesto son hipotéticos.
 * El perfil humano usa valores de referencia de Apollo y de ensayos en la Tierra: no son límites
 * operativos para Marte. Cuando P2-01 (motor) publique sus plantillas, reemplazar estos valores
 * por los suyos para que haya una sola fuente.
 */

export const DEFAULT_PROFILE: Profile = {
  id: "astronauta_a_pie",
  max_slope_deg: 16.7,
  flat_speed_m_s: 0.42,
  speed_model: "tobler_like_v0",
  parameter_sources: {
    max_slope_deg: "Ensayo Mark III al 30 % de pendiente (Tierra, 2 sujetos): referencia, no límite marciano",
    flat_speed_m_s: "Apollo 15 ~1,5 km/h (Luna): referencia",
  },
};

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

export const TEMPLATES: Record<TemplateId, MissionTemplate> = {
  observacion_geologica: {
    id: "observacion_geologica",
    label: "Observación geológica",
    description: "Ir a un afloramiento, documentarlo y tomar muestras.",
    tasks: [
      { id: "foto_contexto", label: "Foto de contexto", duration_s: 15 * MIN },
      { id: "muestreo", label: "Muestreo", duration_s: 30 * MIN },
    ],
    reserve_s: 1 * HOUR,
    time_budget_s: 7 * HOUR,
    preferences: { time: 1.0, effort: 0.5, comm: 0.0 },
  },
  exploracion_topografica: {
    id: "exploracion_topografica",
    label: "Exploración topográfica",
    description: "Relevar el relieve de un sector y marcar puntos de referencia.",
    tasks: [
      { id: "relevamiento_fotogrametrico", label: "Relevamiento fotogramétrico", duration_s: 40 * MIN },
      { id: "marcar_puntos", label: "Marcar puntos de referencia", duration_s: 15 * MIN },
    ],
    reserve_s: 1 * HOUR,
    time_budget_s: 7 * HOUR,
    preferences: { time: 0.6, effort: 0.8, comm: 0.0 },
  },
  reconocimiento: {
    id: "reconocimiento",
    label: "Reconocimiento",
    description: "Recorrido corto para inspeccionar un sitio antes de una misión mayor.",
    tasks: [{ id: "inspeccion_visual", label: "Inspección visual", duration_s: 20 * MIN }],
    reserve_s: 45 * MIN,
    time_budget_s: 5 * HOUR,
    preferences: { time: 1.0, effort: 0.3, comm: 0.0 },
  },
  medicion_ambiental: {
    id: "medicion_ambiental",
    label: "Medición ambiental",
    description: "Instalar un sensor y registrar una serie de mediciones.",
    tasks: [
      { id: "instalar_sensor", label: "Instalar sensor", duration_s: 20 * MIN },
      { id: "medicion", label: "Medición", duration_s: 45 * MIN },
    ],
    reserve_s: 1 * HOUR,
    time_budget_s: 7 * HOUR,
    preferences: { time: 0.7, effort: 0.5, comm: 0.0 },
  },
};

export const DEFAULT_SOL = 4995; // último sol con datos REMS (observación histórica)
export const DEFAULT_DEPARTURE = "09:00";

/** Estado inicial de una familia. Conserva origen/destino si se pasan. */
export function stateFromTemplate(id: TemplateId, origin_poi: string, destination_poi: string): MissionState {
  const t = TEMPLATES[id];
  return {
    template_id: id,
    origin_poi,
    destination_poi,
    tasks: t.tasks.map((task) => ({ ...task })),
    departure_local: DEFAULT_DEPARTURE,
    sol: DEFAULT_SOL,
    reserve_s: t.reserve_s,
    time_budget_s: t.time_budget_s,
    profile: structuredClone(DEFAULT_PROFILE),
    mode: "a_pie",
    preferences: { ...t.preferences },
  };
}
