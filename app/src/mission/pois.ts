import { TEMPLATE_IDS, type Poi, type TemplateId } from "./types";

/** Forma mínima del GeoJSON del contrato `poi` (lo que importa un .json). */
export interface PoiCollection {
  fixture?: boolean;
  features: {
    geometry: { coordinates: number[] };
    properties: { id: string; role: string; title: string; hypothetical?: boolean; families?: string[] };
  }[];
}

const isTemplateId = (s: string): s is TemplateId => (TEMPLATE_IDS as readonly string[]).includes(s);

/** Lee un FeatureCollection con el formato del contrato `poi`. Descarta puntos mal formados. */
export function parsePois(geojson: PoiCollection): Poi[] {
  const out: Poi[] = [];
  for (const f of geojson.features) {
    const [lon, lat] = f.geometry.coordinates;
    const role = f.properties.role;
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || (role !== "base" && role !== "destino")) {
      console.warn("Punto de interés ignorado (formato inválido):", f.properties.id);
      continue;
    }
    out.push({
      id: f.properties.id,
      role,
      title: f.properties.title,
      hypothetical: f.properties.hypothetical ?? false,
      families: (f.properties.families ?? []).filter(isTemplateId),
      lonlat: [lon, lat],
      fixture: geojson.fixture === true,
    });
  }
  return out;
}
