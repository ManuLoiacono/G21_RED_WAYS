import * as Cesium from "cesium";
import type { Pair } from "./draft";

/**
 * Animated "flow" material for route polylines (display only): chevrons that move along the line in
 * the direction of travel (first vertex → last), over a softly lit band of the leg colour.
 * `repeat` = number of chevrons along the whole line; `speed` = cycles per second.
 */
const TYPE = "RedWaysRouteFlow";
let registered = false;

function register() {
  if (registered) return;
  registered = true;
  // Cesium exposes no public API to register a material type; _materialCache is the documented-in-source hook.
  (Cesium.Material as unknown as { _materialCache: { addMaterial(type: string, def: unknown): void } })._materialCache.addMaterial(TYPE, {
    fabric: {
      type: TYPE,
      uniforms: { color: new Cesium.Color(1, 1, 1, 1), repeat: 10, speed: 0.6 },
      source: `
        czm_material czm_getMaterial(czm_materialInput materialInput) {
          czm_material m = czm_getDefaultMaterial(materialInput);
          vec2 st = materialInput.st;
          float t = fract(czm_frameNumber * speed / 60.0);
          float across = abs(st.t - 0.5) * 2.0;              // 0 at the centre line, 1 at the edges
          float x = fract(st.s * repeat - t);                // position inside one chevron cell
          float d = x - across * 0.32;                       // bend the stripe into a ">" shape
          float chevron = smoothstep(0.0, 0.06, d) * (1.0 - smoothstep(0.16, 0.24, d)) * (1.0 - smoothstep(0.55, 0.9, across));
          float edge = 1.0 - smoothstep(0.8, 1.0, across);   // soft borders
          vec3 base = color.rgb * 0.78;
          vec3 bright = min(color.rgb * 1.35 + 0.12, vec3(1.0));
          m.diffuse = mix(base, bright, chevron);
          m.emission = m.diffuse * (0.15 + 0.35 * chevron);
          m.alpha = color.a * mix(0.7, 1.0, edge);
          return m;
        }`,
    },
    translucent: () => true,
  });
}

/** MaterialProperty for entities (constant uniforms; the animation comes from czm_frameNumber). */
export class FlowMaterialProperty {
  readonly definitionChanged = new Cesium.Event();
  readonly isConstant = true;
  constructor(private readonly color: Cesium.Color, private readonly repeat: number, private readonly speed = 0.6) { register(); }
  getType() { return TYPE; }
  getValue(_time?: Cesium.JulianDate, result: Record<string, unknown> = {}) {
    result.color = this.color; result.repeat = this.repeat; result.speed = this.speed;
    return result;
  }
  equals(other?: unknown) { return other === this; }
}

/**
 * Chaikin corner cutting for DRAWING only: rounds the 45° steps of the 8-neighbour grid route.
 * Endpoints are kept. The drawn line can deviate up to about one search cell (~2 m) from the
 * calculated vertices; analytical data and metrics are unchanged.
 */
export function smoothForDisplay(points: Pair[], iterations = 2): Pair[] {
  let pts = points;
  for (let k = 0; k < iterations && pts.length > 2; k++) {
    const out: Pair[] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[i + 1];
      out.push([0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1], [0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1]);
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}

/** True when the return leg retraces the outbound cells in reverse (same path both ways). */
export function sharesPath(outbound: { status: string; cells: Pair[] }, ret: { status: string; cells: Pair[] }): boolean {
  if (outbound.status !== "found" || ret.status !== "found" || outbound.cells.length !== ret.cells.length || !outbound.cells.length) return false;
  const n = outbound.cells.length;
  return outbound.cells.every((c, i) => c[0] === ret.cells[n - 1 - i][0] && c[1] === ret.cells[n - 1 - i][1]);
}

export function lengthOf(points: Pair[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return total;
}
