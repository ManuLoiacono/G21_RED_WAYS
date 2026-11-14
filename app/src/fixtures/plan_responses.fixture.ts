import { language } from "../i18n";
import type { PlanResponse } from "../mission/response";

/**
 * FIXTURE: SIMULATED engine responses (contract v0), one per test destination.
 * They are not computations: geometry and numbers are written by hand to develop the UI
 * (one case with two alternatives, one with a single alternative and one incompatible).
 * They are fixed: they do not change with the form parameters.
 *
 * The real engine will answer in its own language; this fixture carries both so the
 * simulated demo matches the selected UI language.
 */

/** Picks the Spanish or English text of the fixture. */
const tx = (es: string, en: string) => (language === "es" ? es : en);

const BASE: [number, number] = [137.3889, -4.826];
const REMS = { class: "atmosferica", mission: "MSL", instrument: "REMS", kind: "observado" } as const;
const NOT_EVALUATED = [
  tx("comunicación con la base (P1)", "communication with base (P1)"),
  tx("material suelto THEMIS (P1)", "THEMIS loose material (P1)"),
];
const DTM_NOTE = tx("DTM de 1 m: no detecta rocas menores a ~1 m.", "1 m DTM: does not detect rocks smaller than ~1 m.");
const rev = (l: [number, number][]) => [...l].reverse();
const slope = (deg: string, degEn: string) =>
  tx(`Pendiente máxima en dirección de marcha: ${deg}° (límite 16,7°).`, `Maximum slope in the walking direction: ${degEn}° (limit 16.7°).`);
const daylight = (end: string) =>
  tx(
    `Fin con reserva ${end} ≤ atardecer 18:51 (salida 09:00, hora solar local).`,
    `End with reserve ${end} ≤ sunset 18:51 (departure 09:00, local solar time).`,
  );

const D1_FASTEST: [number, number][] = [BASE, [137.3874, -4.8228], [137.3858, -4.8189], [137.3836, -4.815], [137.3818, -4.8122], [137.381, -4.81]];
const D1_LEAST_EFFORT: [number, number][] = [BASE, [137.3898, -4.8212], [137.3889, -4.8165], [137.3862, -4.8128], [137.3835, -4.8106], [137.381, -4.81]];
const D3: [number, number][] = [BASE, [137.388, -4.8236], [137.3866, -4.8214], [137.3851, -4.8189]];
const D2: [number, number][] = [BASE, [137.3858, -4.8189], [137.383, -4.812], [137.3808, -4.807], [137.379, -4.802]];

export const SIMULATED_RESPONSES: Record<string, PlanResponse> = {
  poi_001: {
    schema_version: 0,
    fixture: true,
    status: "viable_model",
    summary_reason: tx(
      "Dos alternativas aceptables en el modelo. La más rápida es más empinada; la de menor esfuerzo cruza celdas sin datos.",
      "Two acceptable alternatives in the model. The fastest is steeper; the least-effort one crosses cells without data.",
    ),
    alternatives: [
      {
        id: "alt_fastest",
        criterion: "menor_tiempo",
        status: "viable_model",
        outbound: { lonlat: D1_FASTEST, distance_m: 1110, ascent_m: 58, descent_m: 7, duration_s: 3000 },
        return: { lonlat: rev(D1_FASTEST), distance_m: 1110, ascent_m: 7, descent_m: 58, duration_s: 2750 },
        tasks_s: 2700,
        reserve_s: 3600,
        budget: { total_s: 12050, time_budget_s: 25200, margin_s: 13150 },
        constraints: [
          { id: "max_slope", status: "ok", detail: slope("14,2", "14.2") },
          { id: "daylight", status: "ok", detail: daylight("12:21"), provenance: REMS },
        ],
        preferences: [
          {
            id: "effort",
            status: "unfavorable",
            detail: tx("Más empinada que la de menor esfuerzo (14,2° contra 9,8°).", "Steeper than the least-effort one (14.2° vs 9.8°)."),
          },
        ],
        evidence: { nodata_fraction: 0, analytic_cell_m: 2, notes: DTM_NOTE },
        warnings: [],
      },
      {
        id: "alt_least_effort",
        criterion: "menor_esfuerzo",
        status: "conditional",
        outbound: { lonlat: D1_LEAST_EFFORT, distance_m: 1260, ascent_m: 53, descent_m: 2, duration_s: 3250 },
        return: { lonlat: rev(D1_LEAST_EFFORT), distance_m: 1260, ascent_m: 2, descent_m: 53, duration_s: 3100 },
        tasks_s: 2700,
        reserve_s: 3600,
        budget: { total_s: 12650, time_budget_s: 25200, margin_s: 12550 },
        constraints: [
          { id: "max_slope", status: "ok", detail: slope("9,8", "9.8") },
          { id: "daylight", status: "ok", detail: daylight("12:31"), provenance: REMS },
        ],
        preferences: [
          { id: "time", status: "unfavorable", detail: tx("10 min más lenta que la de menor tiempo.", "10 min slower than the fastest one.") },
        ],
        evidence: { nodata_fraction: 0.04, analytic_cell_m: 2, notes: DTM_NOTE },
        warnings: [
          tx(
            "El 4 % del recorrido cruza celdas sin datos del DTM: verificar ese tramo antes de elegirla.",
            "4 % of the route crosses cells without DTM data: check that stretch before choosing it.",
          ),
        ],
      },
    ],
    not_evaluated: NOT_EVALUATED,
    input_versions: { parcel: "gale_demo_v1", engine: "fixture" },
  },

  poi_003: {
    schema_version: 0,
    fixture: true,
    status: "viable_model",
    summary_reason: tx(
      "Una sola alternativa distinta en el modelo: las demás coincidían con esta.",
      "Only one distinct alternative in the model: the others matched this one.",
    ),
    alternatives: [
      {
        id: "alt_fastest",
        criterion: "menor_tiempo",
        status: "viable_model",
        outbound: { lonlat: D3, distance_m: 510, ascent_m: 24, descent_m: 3, duration_s: 1350 },
        return: { lonlat: rev(D3), distance_m: 510, ascent_m: 3, descent_m: 24, duration_s: 1250 },
        tasks_s: 2700,
        reserve_s: 3600,
        budget: { total_s: 8900, time_budget_s: 25200, margin_s: 16300 },
        constraints: [
          { id: "max_slope", status: "ok", detail: slope("8,6", "8.6") },
          { id: "daylight", status: "ok", detail: daylight("11:28"), provenance: REMS },
        ],
        preferences: [],
        evidence: { nodata_fraction: 0, analytic_cell_m: 2, notes: DTM_NOTE },
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
    summary_reason: tx(
      "No hay ruta en el modelo hasta este destino que respete la pendiente máxima de 16,7°. Se muestra la menos empinada para explicar el bloqueo.",
      "No route in the model to this destination respects the 16.7° maximum slope. The least steep one is shown to explain the block.",
    ),
    alternatives: [
      {
        id: "alt_least_steep",
        criterion: "menor_pendiente",
        status: "incompatible",
        outbound: { lonlat: D2, distance_m: 1850, ascent_m: 96, descent_m: 11, duration_s: 4700 },
        return: { lonlat: rev(D2), distance_m: 1850, ascent_m: 11, descent_m: 96, duration_s: 4100 },
        tasks_s: 2700,
        reserve_s: 3600,
        budget: { total_s: 15100, time_budget_s: 25200, margin_s: 10100 },
        constraints: [
          {
            id: "max_slope",
            status: "violated",
            detail: tx(
              "Un tramo de ~40 m llega a 22,5° en la subida final al destino (límite 16,7°).",
              "A ~40 m stretch reaches 22.5° on the final climb to the destination (limit 16.7°).",
            ),
          },
          { id: "daylight", status: "ok", detail: daylight("13:12"), provenance: REMS },
        ],
        preferences: [],
        evidence: { nodata_fraction: 0, analytic_cell_m: 2, notes: DTM_NOTE },
        warnings: [],
      },
    ],
    not_evaluated: NOT_EVALUATED,
    input_versions: { parcel: "gale_demo_v1", engine: "fixture" },
  },
};
