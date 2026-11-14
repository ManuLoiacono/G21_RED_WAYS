import { getLanguage } from "../i18n";
import { TEMPLATE_IDS, type Poi, type TemplateId } from "./types";

/** Minimal shape of the `poi` contract GeoJSON (what a .json import gives). */
export interface PoiCollection {
  fixture?: boolean;
  features: {
    geometry: { coordinates: number[] };
    properties: { id: string; role: string; title: string; hypothetical?: boolean; families?: string[] } & Partial<
      Record<`title_${string}`, string>
    >;
  }[];
}

const isTemplateId = (s: string): s is TemplateId => (TEMPLATE_IDS as readonly string[]).includes(s);

/**
 * Reads a FeatureCollection in the `poi` contract format. Drops malformed points.
 * Optional `title_<lang>` properties (e.g. `title_en`) give the title in that UI language.
 */
export function parsePois(geojson: PoiCollection): Poi[] {
  const out: Poi[] = [];
  for (const f of geojson.features) {
    const [lon, lat] = f.geometry.coordinates;
    const role = f.properties.role;
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || (role !== "base" && role !== "destino")) {
      console.warn("Point of interest ignored (invalid format):", f.properties.id);
      continue;
    }
    const titles: Record<string, string> = {};
    for (const [k, v] of Object.entries(f.properties)) {
      if (k.startsWith("title_") && typeof v === "string") titles[k.slice(6)] = v;
    }
    out.push({
      id: f.properties.id,
      role,
      title: f.properties.title,
      titles,
      hypothetical: f.properties.hypothetical ?? false,
      families: (f.properties.families ?? []).filter(isTemplateId),
      lonlat: [lon, lat],
      fixture: geojson.fixture === true,
    });
  }
  return out;
}

/** Title in the current UI language (falls back to the contract title). */
export function poiTitle(poi: Poi): string {
  return poi.titles[getLanguage()] ?? poi.title;
}
