import { t } from "../i18n";
import type { Catalogs, Health, Parcel, PlanRequest, PlanResponse, Recommendations } from "./draft";
import { isCatalogs, isDraftResponse, isHealth, isParcel, isRecommendations, object } from "./validation";

export const SERVICE_URL = (import.meta.env.VITE_SERVICE_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
export interface ServiceMetadata { health: Health; parcel: Parcel; catalogs: Catalogs }
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function read<T>(path: string, validate: (x: unknown) => x is T, init?: RequestInit): Promise<Result<T>> {
  try {
    const response = await fetch(`${SERVICE_URL}${path}`, { cache: "no-store", ...init, signal: AbortSignal.timeout(30_000) });
    let body: unknown;
    try { body = await response.json(); }
    catch { return { ok: false, error: t("api.notJson") }; }
    if (!response.ok) {
      const detail = object(body) && object(body.error) ? body.error : null;
      return { ok: false, error: `${t("api.httpError", { status: response.status })} ${detail ? [detail.code, detail.path, detail.message].filter((v) => typeof v === "string").join(" · ") : ""}` };
    }
    return validate(body) ? { ok: true, data: body } : { ok: false, error: t("api.badShape") };
  } catch {
    return { ok: false, error: t("nav.unavailable", { url: SERVICE_URL }) };
  }
}

export async function loadMetadata(): Promise<Result<ServiceMetadata>> {
  const [health, catalogs] = await Promise.all([read("/health", isHealth), read("/catalogs", isCatalogs)]);
  if (!health.ok) return health;
  if (!catalogs.ok) return catalogs;
  // The service explicitly selects an exact default; never infer a newest package.
  const selected = health.data.default_parcel;
  const registered = health.data.registered_parcels.find((p) => p.id === selected.id && p.version === selected.version);
  if (!registered) return { ok: false, error: t("nav.noParcel") };
  const parcel = await read(`/parcel?id=${encodeURIComponent(registered.id)}&version=${encodeURIComponent(registered.version)}`, isParcel);
  if (!parcel.ok) return parcel;
  if (parcel.data.id !== registered.id || parcel.data.version !== registered.version) return { ok: false, error: t("api.badShape") };
  return { ok: true, data: { health: health.data, catalogs: catalogs.data, parcel: parcel.data } };
}

export async function loadParcel(id: string, version: string): Promise<Result<Parcel>> {
  const result = await read(`/parcel?id=${encodeURIComponent(id)}&version=${encodeURIComponent(version)}`, isParcel);
  return result.ok && (result.data.id !== id || result.data.version !== version) ? { ok: false, error: t("api.badShape") } : result;
}

export function requestPlan(req: PlanRequest): Promise<Result<PlanResponse>> {
  return read("/plan", isDraftResponse, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) });
}
export function requestRecommendations(req: PlanRequest): Promise<Result<Recommendations>> {
  return read("/recommendations", isRecommendations, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) });
}
