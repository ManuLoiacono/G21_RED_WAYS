import type { Provenance } from "../mission/response";
import { esc } from "../ui/format";

/**
 * Registro de fuentes (P1-05). Cada capa, regla o valor de la UI apunta a una entrada por id
 * (botón ⓘ con `data-source="<id>"`). El panel «Fuentes» lista las entradas registradas.
 * Los campos siguen el bloque `provenance` del contrato: class, mission, instrument, product,
 * url, kind, origin, fetched_at.
 */

export type SourceClass = "topografica" | "optica" | "atmosferica" | "termica" | "supuesto";

export interface SourceEntry {
  id: string;
  title: string;
  /** Para qué se usa en la app (papel en la evaluación). */
  role: string;
  group: SourceClass;
  provenance: Provenance;
  notes?: string[];
  fixture?: boolean;
}

export const CESIUM_MARS_ASSET_ID = 3644333;

const DTM_URL =
  "https://astrogeo-ard.s3-us-west-2.amazonaws.com/mars/mro/hirise/controlled/dtm/ESP_019698_1750_ESP_019988_1750/DTEEC_019698_1750_019988_1750_U01.tif";
const REMS_URL = "https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json";

const STATIC_SOURCES: SourceEntry[] = [
  {
    id: "terreno_visual",
    title: "Terreno 3D (solo visual)",
    role: "Lo que se ve en la escena. No interviene en ningún cálculo.",
    group: "optica",
    provenance: {
      class: "optica",
      mission: "MGS/MOLA, Mars Express/HRSC, Viking (bases de Cesium Mars)",
      instrument: "Cesium ion",
      product: `Cesium Mars, asset ${CESIUM_MARS_ASSET_ID} (3D Tiles)`,
      url: "https://ion.cesium.com",
      kind: "derivado",
      origin: "live",
    },
    notes: [
      "Las alturas de Cesium quedan ~71 m por encima de las del DTM HiRISE en Gale. No se mezclan: las rutas se apoyan sobre el terreno y los puntos usan la altura de Cesium solo para dibujarse.",
    ],
  },
  {
    id: "dtm_hirise",
    title: "Modelo de elevación HiRISE (1 m)",
    role: "Base del cálculo de rutas: pendientes, restricciones, distancia y desnivel de ida y vuelta (lo usa el motor).",
    group: "topografica",
    provenance: {
      class: "topografica",
      mission: "MRO",
      instrument: "HiRISE",
      product: "DTEEC_019698_1750_019988_1750_U01",
      url: DTM_URL,
      kind: "observado",
    },
    notes: [
      "Un DTM de 1 m no detecta rocas chicas ni garantiza 1 m de precisión.",
      "Las trazas del rover no prueban que un paso sea transitable para una persona.",
    ],
  },
  {
    id: "rems",
    title: "Ambiente medido por Curiosity (REMS)",
    role: "Regla de luz diurna: salida + ida + tareas + vuelta + reserva ≤ atardecer del sol elegido.",
    group: "atmosferica",
    provenance: {
      class: "atmosferica",
      mission: "MSL (Curiosity)",
      instrument: "REMS",
      product: "Reporte diario por sol (amanecer, atardecer, temperaturas, presión)",
      url: REMS_URL,
      kind: "observado",
    },
    notes: [
      "Es una observación histórica del rover: no es el clima actual ni un pronóstico.",
      "El viento y la humedad no vienen en este reporte; la opacidad figura siempre como «Sunny» y no se usa como medición.",
    ],
  },
  {
    id: "perfil_humano",
    title: "Perfil del explorador",
    role: "Pendiente máxima y velocidad en llano que usa el motor para el astronauta a pie.",
    group: "supuesto",
    provenance: { class: "supuesto", mission: "Apollo 15 (Luna); ensayo del traje Mark III (Tierra)", kind: "supuesto" },
    notes: [
      "Valores de referencia editables, con otra gravedad, otro traje y otro terreno. No son límites operativos para Marte.",
    ],
  },
  {
    id: "plantillas",
    title: "Plantillas de misión",
    role: "Tareas, duraciones, reserva, tiempo máximo y preferencias iniciales de cada familia.",
    group: "supuesto",
    provenance: { class: "supuesto", kind: "supuesto" },
    notes: ["Supuestos de la POC, editables en el formulario."],
  },
  {
    id: "pois_fixture",
    title: "Base y destinos de prueba",
    role: "Puntos de salida y llegada mientras no estén los destinos científicos (P3-05).",
    group: "supuesto",
    provenance: { class: "supuesto", kind: "supuesto", product: "app/src/fixtures/poi.fixture.json" },
    notes: ["Posiciones elegidas a mano cerca de la zona de Curiosity. No son destinos científicos reales."],
    fixture: true,
  },
  {
    id: "respuesta_simulada",
    title: "Respuesta simulada del motor",
    role: "Alternativas que se muestran cuando el servicio de rutas no responde.",
    group: "supuesto",
    provenance: { class: "supuesto", kind: "supuesto", product: "app/src/fixtures/plan_responses.fixture.ts" },
    notes: ["Geometría y números escritos a mano para desarrollar la interfaz. No son un cálculo y no cambian con el formulario."],
    fixture: true,
  },
  {
    id: "ruta_prueba",
    title: "Ruta de prueba inicial",
    role: "Línea de ejemplo al abrir la app, para verificar que las rutas se apoyan sobre el terreno.",
    group: "supuesto",
    provenance: { class: "supuesto", kind: "supuesto", product: "app/src/fixture_route.json" },
    notes: ["Sintética: no es un recorrido real ni un resultado del motor."],
    fixture: true,
  },
];

const entries = new Map<string, SourceEntry>(STATIC_SOURCES.map((s) => [s.id, s]));
const listeners: (() => void)[] = [];

export function getSource(id: string): SourceEntry | undefined {
  return entries.get(id);
}

export function allSources(): SourceEntry[] {
  return [...entries.values()];
}

export function onSourcesChange(cb: () => void) {
  listeners.push(cb);
}

const norm = (s?: string) => (s ?? "").toLowerCase();

/**
 * Devuelve el id de la fuente que corresponde a un bloque `provenance` recibido (por ejemplo,
 * de una restricción en la respuesta). Si coincide con una fuente conocida (misma misión e
 * instrumento), completa los datos que falten; si no, registra una entrada nueva.
 */
export function sourceIdFor(p: Provenance): string {
  const known = [...entries.values()].find(
    (e) => p.instrument && norm(e.provenance.instrument) === norm(p.instrument) && norm(e.provenance.mission).startsWith(norm(p.mission)),
  );
  if (known) {
    // Del motor se toman solo los datos de obtención (origen, fecha, producto exacto, enlace);
    // la descripción de la fuente (misión, instrumento, clase, sustento) queda la conocida.
    const fromEngine = Object.fromEntries(
      (["origin", "fetched_at", "product", "url"] as const).filter((k) => p[k]).map((k) => [k, p[k]]),
    );
    known.provenance = { ...known.provenance, ...fromEngine };
    listeners.forEach((cb) => cb());
    return known.id;
  }
  const id = `prov:${[p.class, p.mission, p.instrument, p.product].map(norm).join("|")}`;
  if (!entries.has(id)) {
    entries.set(id, {
      id,
      title: [p.mission, p.instrument].filter(Boolean).join(" · ") || p.product || "Fuente sin nombre",
      role: "Informada por el motor en la respuesta.",
      group: (["topografica", "optica", "atmosferica", "termica"].includes(p.class ?? "") ? p.class : "supuesto") as SourceClass,
      provenance: p,
    });
    listeners.forEach((cb) => cb());
  }
  return id;
}

/** Botón ⓘ que abre el panel «Fuentes» en la entrada indicada. */
export function infoButton(sourceId: string, label: string): string {
  return `<button type="button" class="info-btn" data-source="${esc(sourceId)}" aria-label="Fuente: ${esc(label)}" title="Ver fuente">ⓘ</button>`;
}
