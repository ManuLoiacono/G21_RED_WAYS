/** `hh:mm` presentation of durations. The engine always receives seconds. */

/** Seconds → `hh:mm` (hours unbounded, minutes rounded). Display only. */
export function toHhMm(seconds: number): string {
  const total = Math.max(0, Math.round(seconds / 60));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** `hh:mm` (h 0–99, m 0–59) → seconds, or null when the text is not a valid duration. */
export function fromHhMm(text: string): number | null {
  const match = /^\s*(\d{1,2}):([0-5]\d)\s*$/.exec(text);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60;
}
