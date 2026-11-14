import { numberLocale } from "../i18n";

/** Display helpers. Data travels in SI units; conversion happens only for display. */

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const nf = (digits: number) => new Intl.NumberFormat(numberLocale, { maximumFractionDigits: digits });

/** 8450 → "2 h 21 min"; 900 → "15 min". */
export function fmtDuration(s: number): string {
  const sign = s < 0 ? "−" : "";
  const total = Math.round(Math.abs(s) / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${sign}${m} min`;
  return m === 0 ? `${sign}${h} h` : `${sign}${h} h ${m} min`;
}

/** 1110 → "1.11 km" (en) / "1,11 km" (es); 510 → "510 m". */
export function fmtDistance(m: number): string {
  return m >= 1000 ? `${nf(2).format(m / 1000)} km` : `${nf(0).format(m)} m`;
}

export function fmtMeters(m: number): string {
  return `${nf(0).format(m)} m`;
}

export function fmtPercent(fraction: number): string {
  return `${nf(1).format(fraction * 100)} %`;
}

/** Number for display with the UI locale (decimal comma in Spanish). */
export function fmtNumber(n: number, digits = 1): string {
  return nf(digits).format(n);
}
