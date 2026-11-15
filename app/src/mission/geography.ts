import type { GeographicAdapter, Pair } from "./draft";

/** Native equirectangular metres and source latitude, with no extra latitude conversion. */
export function metricToGeographic([x, y]: Pair, a: GeographicAdapter): Pair {
  return [x / a.radius_m * 180 / Math.PI, y / a.radius_m * 180 / Math.PI];
}
export function geographicToMetric([lon, lat]: Pair, a: GeographicAdapter): Pair {
  return [lon * Math.PI / 180 * a.radius_m, lat * Math.PI / 180 * a.radius_m];
}
/** Apply P1's registered display translation once, after analytical calculations. */
export function metricToScene([x, y]: Pair, a: GeographicAdapter): Pair {
  return metricToGeographic([x + a.horizontal_shift_m.east, y + a.horizontal_shift_m.north], a);
}
export function sceneToMetric(lonlat: Pair, a: GeographicAdapter): Pair {
  const [x, y] = geographicToMetric(lonlat, a);
  return [x - a.horizontal_shift_m.east, y - a.horizontal_shift_m.north];
}
