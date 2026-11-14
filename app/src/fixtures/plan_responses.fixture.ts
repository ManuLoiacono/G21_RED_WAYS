import type { PlanResponse } from "../mission/response";

/**
 * FIXTURE: respuestas SIMULADAS del motor (contrato v0), una por destino de prueba.
 * No son cálculos: geometría y números están escritos a mano para desarrollar la UI
 * (un caso con dos alternativas, uno con una sola y uno incompatible).
 * Son fijas: no cambian con los parámetros del formulario.
 */

const BASE: [number, number] = [137.3889, -4.826];
const REMS = { class: "atmosferica", mission: "MSL", instrument: "REMS", kind: "observado" } as const;
const NOT_EVALUATED = ["comunicación con la base (P1)", "material suelto THEMIS (P1)"];
const rev = (l: [number, number][]) => [...l].reverse();

const D1_TIEMPO: [number, number][] = [BASE, [137.3874, -4.8228], [137.3858, -4.8189], [137.3836, -4.815], [137.3818, -4.8122], [137.381, -4.81]];
const D1_ESFUERZO: [number, number][] = [BASE, [137.3898, -4.8212], [137.3889, -4.8165], [137.3862, -4.8128], [137.3835, -4.8106], [137.381, -4.81]];
const D3: [number, number][] = [BASE, [137.388, -4.8236], [137.3866, -4.8214], [137.3851, -4.8189]];
const D2: [number, number][] = [BASE, [137.3858, -4.8189], [137.383, -4.812], [137.3808, -4.807], [137.379, -4.802]];

export const SIMULATED_RESPONSES: Record<string, PlanResponse> = {
  poi_001: {
    schema_version: 0,
    fixture: true,
    status: "viable_model",
    summary_reason: "Dos alternativas aceptables en el modelo. La más rápida es más empinada; la de menor esfuerzo cruza celdas sin datos.",
    alternatives: [
      {
        id: "alt_tiempo",
        criterion: "menor_tiempo",
        status: "viable_model",
        outbound: { lonlat: D1_TIEMPO, distance_m: 1110, ascent_m: 58, descent_m: 7, duration_s: 3000 },
        return: { lonlat: rev(D1_TIEMPO), distance_m: 1110, ascent_m: 7, descent_m: 58, duration_s: 2750 },
        tasks_s: 2700,
        reserve_s: 3600,
        budget: { total_s: 12050, time_budget_s: 25200, margin_s: 13150 },
        constraints: [
          { id: "max_slope", status: "ok", detail: "Pendiente máxima en dirección de marcha: 14,2° (límite 16,7°)." },
          { id: "daylight", status: "ok", detail: "Fin con reserva 12:21 ≤ atardecer 18:51 (salida 09:00, hora solar local).", provenance: REMS },
        ],
        preferences: [{ id: "effort", status: "unfavorable", detail: "Más empinada que la de menor esfuerzo (14,2° contra 9,8°)." }],
        evidence: { nodata_fraction: 0, analytic_cell_m: 2, notes: "DTM de 1 m: no detecta rocas menores a ~1 m." },
        warnings: [],
      },
      {
        id: "alt_esfuerzo",
        criterion: "menor_esfuerzo",
        status: "conditional",
        outbound: { lonlat: D1_ESFUERZO, distance_m: 1260, ascent_m: 53, descent_m: 2, duration_s: 3250 },
        return: { lonlat: rev(D1_ESFUERZO), distance_m: 1260, ascent_m: 2, descent_m: 53, duration_s: 3100 },
        tasks_s: 2700,
        reserve_s: 3600,
        budget: { total_s: 12650, time_budget_s: 25200, margin_s: 12550 },
        constraints: [
          { id: "max_slope", status: "ok", detail: "Pendiente máxima en dirección de marcha: 9,8° (límite 16,7°)." },
          { id: "daylight", status: "ok", detail: "Fin con reserva 12:31 ≤ atardecer 18:51 (salida 09:00, hora solar local).", provenance: REMS },
        ],
        preferences: [{ id: "time", status: "unfavorable", detail: "10 min más lenta que la de menor tiempo." }],
        evidence: { nodata_fraction: 0.04, analytic_cell_m: 2, notes: "DTM de 1 m: no detecta rocas menores a ~1 m." },
        warnings: ["El 4 % del recorrido cruza celdas sin datos del DTM: verificar ese tramo antes de elegirla."],
      },
    ],
    not_evaluated: NOT_EVALUATED,
    input_versions: { parcel: "gale_demo_v1", engine: "fixture" },
  },

  poi_003: {
    schema_version: 0,
    fixture: true,
    status: "viable_model",
    summary_reason: "Una sola alternativa distinta en el modelo: las demás coincidían con esta.",
    alternatives: [
      {
        id: "alt_tiempo",
        criterion: "menor_tiempo",
        status: "viable_model",
        outbound: { lonlat: D3, distance_m: 510, ascent_m: 24, descent_m: 3, duration_s: 1350 },
        return: { lonlat: rev(D3), distance_m: 510, ascent_m: 3, descent_m: 24, duration_s: 1250 },
        tasks_s: 2700,
        reserve_s: 3600,
        budget: { total_s: 8900, time_budget_s: 25200, margin_s: 16300 },
        constraints: [
          { id: "max_slope", status: "ok", detail: "Pendiente máxima en dirección de marcha: 8,6° (límite 16,7°)." },
          { id: "daylight", status: "ok", detail: "Fin con reserva 11:28 ≤ atardecer 18:51 (salida 09:00, hora solar local).", provenance: REMS },
        ],
        preferences: [],
        evidence: { nodata_fraction: 0, analytic_cell_m: 2, notes: "DTM de 1 m: no detecta rocas menores a ~1 m." },
        warnings: [],
      },
    ],
    not_evaluated: NOT_EVALUATED,
    input_versions: { parcel: "gale_demo_v1", engine: "fixture" },
  },

  poi_002: {
    schema_version: 0,
    fixture: true,
    status: "incompatible",
    summary_reason: "No hay ruta en el modelo hasta este destino que respete la pendiente máxima de 16,7°. Se muestra la menos empinada para explicar el bloqueo.",
    alternatives: [
      {
        id: "alt_menos_empinada",
        criterion: "menor_pendiente",
        status: "incompatible",
        outbound: { lonlat: D2, distance_m: 1850, ascent_m: 96, descent_m: 11, duration_s: 4700 },
        return: { lonlat: rev(D2), distance_m: 1850, ascent_m: 11, descent_m: 96, duration_s: 4100 },
        tasks_s: 2700,
        reserve_s: 3600,
        budget: { total_s: 15100, time_budget_s: 25200, margin_s: 10100 },
        constraints: [
          { id: "max_slope", status: "violated", detail: "Un tramo de ~40 m llega a 22,5° en la subida final al destino (límite 16,7°)." },
          { id: "daylight", status: "ok", detail: "Fin con reserva 13:12 ≤ atardecer 18:51 (salida 09:00, hora solar local).", provenance: REMS },
        ],
        preferences: [],
        evidence: { nodata_fraction: 0, analytic_cell_m: 2, notes: "DTM de 1 m: no detecta rocas menores a ~1 m." },
        warnings: [],
      },
    ],
    not_evaluated: NOT_EVALUATED,
    input_versions: { parcel: "gale_demo_v1", engine: "fixture" },
  },
};
