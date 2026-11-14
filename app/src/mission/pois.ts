import { language } from "../i18n";
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
 * An optional `title_<lang>` property (e.g. `title_en`) overrides `title` for that UI language.
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
    out.push({
      id: f.properties.id,
      role,
      title: f.properties[`title_${language}`] ?? f.properties.title,
      hypothetical: f.properties.hypothetical ?? false,
      families: (f.properties.families ?? []).filter(isTemplateId),
      lonlat: [lon, lat],
      fixture: geojson.fixture === true,
    });
  }
  return out;
}
