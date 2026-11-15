/**
 * REMS daily reports (MSL Curiosity) and the rover's positions, read live from the browser
 * (both feeds allow CORS). If a feed fails, the app uses the backup written by
 * scripts/build_rems_backup.py (CLAUDE.md D4), loaded lazily so it does not weigh on startup.
 *
 * Values are kept as published: "--" becomes null, never zero (CLAUDE.md §4). Not used:
 * wind_speed and abs_humidity (always "--") and atmo_opacity (always "Sunny", not a measurement).
 */

export const REMS_URL = "https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json";
export const WAYPOINTS_URL = "https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json";
const TIMEOUT_MS = 20_000;
/** A departure date without its own report may use the closest earlier one within these days. */
const MAX_GAP_DAYS = 3;

export interface RemsDay {
  sol: number;
  /** Earth date of the report (YYYY-MM-DD). */
  date: string;
  ls: number | null;
  minAirC: number | null;
  maxAirC: number | null;
  minGroundC: number | null;
  maxGroundC: number | null;
  pressurePa: number | null;
  /** REMS UV index category as published (Low, Moderate, High, Very_High, Extreme). */
  uv: string | null;
  /** Local mean solar time "HH:MM". */
  sunrise: string | null;
  sunset: string | null;
}

export interface Waypoint {
  sol: number;
  lon: number;
  lat: number;
  elevGeoidM: number;
}

export interface FeedOrigin {
  origin: "live" | "cache";
  fetchedAt: string;
}

export interface EnvironmentData {
  days: RemsDay[];
  waypoints: Waypoint[];
  rems: FeedOrigin;
  positions: FeedOrigin;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "--" || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => (typeof v === "string" && v !== "--" && v !== "" ? v : null);

function toDay(r: Record<string, unknown>): RemsDay | null {
  const sol = num(r.sol);
  const date = str(r.terrestrial_date);
  if (sol === null || !date) return null;
  return {
    sol,
    date,
    ls: num(r.ls),
    minAirC: num(r.min_temp),
    maxAirC: num(r.max_temp),
    minGroundC: num(r.min_gts_temp),
    maxGroundC: num(r.max_gts_temp),
    pressurePa: num(r.pressure),
    uv: str(r.local_uv_irradiance_index),
    sunrise: str(r.sunrise),
    sunset: str(r.sunset),
  };
}

async function fetchJson(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    window.clearTimeout(timer);
  }
}

type Backup = typeof import("./rems_backup.json");
let backup: Promise<Backup> | null = null;
const loadBackup = () => (backup ??= import("./rems_backup.json").then((m) => (m.default ?? m) as Backup));

async function liveRems(): Promise<RemsDay[]> {
  const body = (await fetchJson(REMS_URL)) as { soles?: Record<string, unknown>[] };
  const days = (body.soles ?? []).map(toDay).filter((d): d is RemsDay => d !== null);
  if (days.length === 0) throw new Error("REMS feed without soles");
  return days;
}

async function backupRems(): Promise<RemsDay[]> {
  const b = await loadBackup();
  const fields = b.rems_fields;
  return b.rems
    .map((row) => toDay(Object.fromEntries(fields.map((f, i) => [f, row[i]]))))
    .filter((d): d is RemsDay => d !== null);
}

async function liveWaypoints(): Promise<Waypoint[]> {
  const body = (await fetchJson(WAYPOINTS_URL)) as { features?: { properties?: Record<string, unknown> }[] };
  const wps = (body.features ?? [])
    .map((f) => f.properties ?? {})
    .map((p) => ({ sol: num(p.sol), lon: num(p.lon), lat: num(p.lat), elevGeoidM: num(p.elev_geoid) }))
    .filter((w): w is Waypoint => w.sol !== null && w.lon !== null && w.lat !== null && w.elevGeoidM !== null);
  if (wps.length === 0) throw new Error("Waypoints feed without points");
  return wps;
}

async function backupWaypoints(): Promise<Waypoint[]> {
  const b = await loadBackup();
  return b.waypoints.map(([sol, lon, lat, elevGeoidM]) => ({ sol, lon, lat, elevGeoidM }));
}

/** Each feed live first, then its backup. Rejects only if both fail for REMS. */
export async function loadEnvironment(): Promise<EnvironmentData> {
  const now = new Date().toISOString();
  const withFallback = async <T>(live: () => Promise<T>, saved: () => Promise<T>): Promise<[T, FeedOrigin]> => {
    try {
      return [await live(), { origin: "live", fetchedAt: now }];
    } catch (err) {
      console.warn("Live feed failed, using the saved backup:", err);
      return [await saved(), { origin: "cache", fetchedAt: (await loadBackup()).fetched_at }];
    }
  };
  const [[days, rems], [waypoints, positions]] = await Promise.all([
    withFallback(liveRems, backupRems),
    withFallback(liveWaypoints, backupWaypoints),
  ]);
  days.sort((a, b) => a.sol - b.sol);
  waypoints.sort((a, b) => a.sol - b.sol);
  return { days, waypoints, rems, positions };
}

export interface DayMatch {
  day: RemsDay;
  /** False when the departure date had no report and the closest earlier one is used. */
  exact: boolean;
}

/** REMS report for an Earth date (YYYY-MM-DD): same date, or the closest earlier within a few days. */
export function dayForDate(days: RemsDay[], date: string): DayMatch | null {
  const exact = days.find((d) => d.date === date);
  if (exact) return { day: exact, exact: true };
  const target = Date.parse(`${date}T00:00:00Z`);
  let best: RemsDay | null = null;
  for (const d of days) {
    const t = Date.parse(`${d.date}T00:00:00Z`);
    if (t < target && target - t <= MAX_GAP_DAYS * 86_400_000 && (!best || d.date > best.date)) best = d;
  }
  return best ? { day: best, exact: false } : null;
}

/** Rover position on a sol: the last waypoint at or before it. */
export function positionAtSol(waypoints: Waypoint[], sol: number): Waypoint | null {
  let found: Waypoint | null = null;
  for (const w of waypoints) {
    if (w.sol > sol) break;
    found = w;
  }
  return found;
}

/** Daylight length in minutes between two "HH:MM" local solar times, or null. */
export function daylightMinutes(sunrise: string | null, sunset: string | null): number | null {
  const m = (s: string | null) => {
    const r = s?.match(/^(\d{1,2}):(\d{2})$/);
    return r ? Number(r[1]) * 60 + Number(r[2]) : null;
  };
  const a = m(sunrise);
  const b = m(sunset);
  return a === null || b === null || b <= a ? null : b - a;
}
