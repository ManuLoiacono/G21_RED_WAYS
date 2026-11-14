import { t, type MessageKey } from "../i18n";
import type { Provenance } from "../mission/response";
import { esc } from "../ui/format";

/**
 * Source registry (P1-05). Each layer, rule or value in the UI points to an entry by id
 * (ⓘ button with `data-source="<id>"`). The "Sources" panel lists the registered entries.
 * Fields follow the contract `provenance` block: class, mission, instrument, product,
 * url, kind, origin, fetched_at. `class` and `kind` keep the contract (Spanish) values.
 */

/** Contract `class` values used to group the sources. */
export type SourceClass = "topografica" | "optica" | "atmosferica" | "termica" | "supuesto";

export interface SourceEntry {
  id: string;
  title: string;
  /** What it is used for in the app (its role in the evaluation). */
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

/** Title, role and notes of a static entry come from the dictionary (`source.<id>.*`). */
function text(id: string, notes: number) {
  const key = (suffix: string) => `source.${id}.${suffix}` as MessageKey;
  return {
    title: t(key("title")),
    role: t(key("role")),
    notes: Array.from({ length: notes }, (_, i) => t(key(`note${i + 1}`))),
  };
}

const STATIC_SOURCES: SourceEntry[] = [
  {
    id: "visual_terrain",
    ...text("visual_terrain", 1),
    group: "optica",
    provenance: {
      class: "optica",
      mission: t("source.visual_terrain.mission"),
      instrument: "Cesium ion",
      product: `Cesium Mars, asset ${CESIUM_MARS_ASSET_ID} (3D Tiles)`,
      url: "https://ion.cesium.com",
      kind: "derivado",
      origin: "live",
    },
  },
  {
    id: "hirise_mesh",
    ...text("hirise_mesh", 3),
    group: "topografica",
    provenance: {
      class: "topografica",
      mission: "MRO",
      instrument: "HiRISE",
      product: t("source.hirise_mesh.product"),
      url: DTM_URL,
      kind: "derivado",
      origin: "local",
    },
  },
  {
    id: "hirise_dtm",
    ...text("hirise_dtm", 2),
    group: "topografica",
    provenance: {
      class: "topografica",
      mission: "MRO",
      instrument: "HiRISE",
      product: "DTEEC_019698_1750_019988_1750_U01",
      url: DTM_URL,
      kind: "observado",
    },
  },
  {
    id: "rems",
    ...text("rems", 2),
    group: "atmosferica",
    provenance: {
      class: "atmosferica",
      mission: "MSL (Curiosity)",
      instrument: "REMS",
      product: t("source.rems.product"),
      url: REMS_URL,
      kind: "observado",
    },
  },
  {
    id: "human_profile",
    ...text("human_profile", 1),
    group: "supuesto",
    provenance: { class: "supuesto", mission: t("source.human_profile.mission"), kind: "supuesto" },
  },
  {
    id: "mission_templates",
    ...text("mission_templates", 1),
    group: "supuesto",
    provenance: { class: "supuesto", kind: "supuesto" },
  },
  {
    id: "fixture_pois",
    ...text("fixture_pois", 1),
    group: "supuesto",
    provenance: { class: "supuesto", kind: "supuesto", product: "app/src/fixtures/poi.fixture.json" },
    fixture: true,
  },
  {
    id: "simulated_response",
    ...text("simulated_response", 1),
    group: "supuesto",
    provenance: { class: "supuesto", kind: "supuesto", product: "app/src/fixtures/plan_responses.fixture.ts" },
    fixture: true,
  },
  {
    id: "test_route",
    ...text("test_route", 1),
    group: "supuesto",
    provenance: { class: "supuesto", kind: "supuesto", product: "app/src/fixture_route.json" },
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
 * Returns the source id for a received `provenance` block (for example, from a constraint in
 * the response). If it matches a known source (same mission and instrument), it fills in the
 * missing data; otherwise it registers a new entry.
 */
export function sourceIdFor(p: Provenance): string {
  const known = [...entries.values()].find(
    (e) => p.instrument && norm(e.provenance.instrument) === norm(p.instrument) && norm(e.provenance.mission).startsWith(norm(p.mission)),
  );
  if (known) {
    // From the engine only the retrieval data is taken (origin, date, exact product, link);
    // the description of the source (mission, instrument, class, basis) stays as known.
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
      title: [p.mission, p.instrument].filter(Boolean).join(" · ") || p.product || t("src.unnamed"),
      role: t("src.fromEngine"),
      group: (["topografica", "optica", "atmosferica", "termica"].includes(p.class ?? "") ? p.class : "supuesto") as SourceClass,
      provenance: p,
    });
    listeners.forEach((cb) => cb());
  }
  return id;
}

/** ⓘ button that opens the "Sources" panel at the given entry. */
export function infoButton(sourceId: string, label: string): string {
  return `<button type="button" class="info-btn" data-source="${esc(sourceId)}" aria-label="${esc(t("src.info.aria", { label }))}" title="${esc(t("src.info.title"))}">ⓘ</button>`;
}
