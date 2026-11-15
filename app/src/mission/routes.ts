import { t } from "../i18n";
import { esc } from "../ui/format";
import type { Alternative, Leg, Pair, PlanResponse } from "./draft";

/** Equal-scale local Cartesian display only. There is deliberately no Cesium/geographic adapter. */
export function metricProjection(points: Pair[]) {
  if (points.length === 0) throw new Error("Metric projection requires at least one returned point.");
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const width = Math.max(maxX - minX, 1), height = Math.max(maxY - minY, 1);
  const scale = Math.min(240 / width, 140 / height);
  const centerX = minX + (maxX - minX) / 2, centerY = minY + (maxY - minY) / 2;
  return {
    project: ([x, y]: Pair): Pair => [160 + (x - centerX) * scale, 100 - (y - centerY) * scale],
    minX: centerX - 120 / scale, maxX: centerX + 120 / scale,
    minY: centerY - 70 / scale, maxY: centerY + 70 / scale,
  };
}

export function renderMetricPreview(a: Alternative, locations: PlanResponse["locations"], index: number): string {
  const origin = locations.origin.effective_xy_m;
  const destination = locations.destination.effective_xy_m;
  const projection = metricProjection([...a.outbound.xy_m, ...a.return.xy_m, origin, destination]);
  const svgPoint = (p: Pair) => projection.project(p).join(",");
  const tick = (value: number) => Number(value.toPrecision(4));
  const path = (leg: Leg, name: "outbound" | "return") => {
    // A one-vertex found leg is a same-cell route; an unavailable leg remains empty.
    if (leg.xy_m.length === 0) return "";
    const first = projection.project(leg.xy_m[0]);
    return leg.xy_m.length === 1 ?
      `<circle data-leg="${name}" cx="${first[0]}" cy="${first[1]}" r="${name === "outbound" ? 7 : 4}" fill="none" stroke="${name === "outbound" ? "#3ff0ff" : "#ffb347"}" stroke-width="2" />` :
      `<polyline data-leg="${name}" points="${leg.xy_m.map(svgPoint).join(" ")}" fill="none" stroke="${name === "outbound" ? "#3ff0ff" : "#ffb347"}" stroke-width="${name === "outbound" ? 6 : 3}" ${name === "return" ? 'stroke-dasharray="7 5"' : ""} marker-end="url(#metric-arrow-${index}-${name})" />`;
  };
  return `<figure class="nav-preview" data-coordinate-frame="parcel_metric">
    <figcaption>${esc(t("nav.previewTitle"))}</figcaption>
    <p class="mp-hint">${esc(t("nav.previewHint"))}</p>
    <svg viewBox="0 0 320 220" role="img" aria-labelledby="metric-title-${index} metric-description-${index}">
      <title id="metric-title-${index}">${esc(t("nav.previewTitle"))}</title>
      <desc id="metric-description-${index}">${esc(t("nav.previewDescription"))}</desc>
      <defs>${(["outbound", "return"] as const).map((name) => `<marker id="metric-arrow-${index}-${name}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M 0 0 L 8 4 L 0 8 z" fill="${name === "outbound" ? "#3ff0ff" : "#ffb347"}" /></marker>`).join("")}</defs>
      <path d="M 40 30 V 170 H 280" fill="none" stroke="#737786" stroke-width="1" />
      <text x="8" y="15">y (m)</text><text x="270" y="210">x (m)</text>
      <text x="40" y="190">${tick(projection.minX)}</text><text x="280" y="190" text-anchor="end">${tick(projection.maxX)}</text>
      <text x="5" y="34">${tick(projection.maxY)}</text><text x="5" y="170">${tick(projection.minY)}</text>
      ${path(a.outbound, "outbound")}${path(a.return, "return")}
      <circle cx="${projection.project(origin)[0]}" cy="${projection.project(origin)[1]}" r="3" fill="#fff" />
      <circle cx="${projection.project(destination)[0]}" cy="${projection.project(destination)[1]}" r="3" fill="#ffd166" />
    </svg>
    <p class="nav-legend"><span class="nav-outbound">━ ${esc(t("nav.outbound"))}</span> · <span class="nav-return">┄ ${esc(t("nav.return"))}</span></p>
    <p class="mp-hint">${esc(t("nav.previewOverlap"))}</p>
    <p class="mp-hint">${esc(t("nav.previewEndpoints", { origin: origin.join(", "), destination: destination.join(", ") }))}</p>
    <details data-detail="geometry:${esc(a.id)}"><summary>${esc(t("nav.geometry"))}</summary>
      ${(["outbound", "return"] as const).map((name) => `<p data-leg-status="${esc(a[name].status)}">${esc(t(`nav.${name}`))}: ${esc(a[name].status)}${a[name].reason ? ` · ${esc(a[name].reason)}` : ""}</p>
        <pre class="nav-json">${a[name].xy_m.length ? esc(JSON.stringify(a[name].xy_m)) : esc(t("nav.noGeometry"))}</pre>`).join("")}
    </details>
  </figure>`;
}
