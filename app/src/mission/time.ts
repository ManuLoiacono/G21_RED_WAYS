/** Duration presentation preserves physical seconds; exact minutes remain hh:mm. */

/** Seconds → hh:mm[:ss[.fraction]], with microsecond display precision. */
export function toHhMm(seconds: number): string {
  const total = Math.round(Math.max(0, seconds) * 1e6) / 1e6;
  const h = Math.floor(total / 3600);
  const m = Math.floor(total / 60) % 60;
  const remainder = Number((total % 60).toFixed(6));
  const clock = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  return remainder === 0 ? clock : `${clock}:${remainder < 10 ? "0" : ""}${remainder}`;
}

/** hh:mm[:ss[.fraction]] → physical seconds; null for malformed/nonfinite input. */
export function fromHhMm(text: string): number | null {
  const match = /^\s*(\d+):([0-5]\d)(?::([0-5]\d(?:\.\d+)?))?\s*$/.exec(text);
  if (!match) return null;
  const value = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3] ?? 0);
  return Number.isFinite(value) ? value : null;
}
