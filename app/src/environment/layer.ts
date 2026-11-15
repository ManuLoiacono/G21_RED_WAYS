import * as Cesium from "cesium";
import { numberLocale, onLanguageChange, t, type MessageKey } from "../i18n";
import { esc, fmtNumber } from "../ui/format";
import type { LayerStatus } from "../ui/layers";
import {
  dayForDate,
  daylightMinutes,
  loadEnvironment,
  positionAtSol,
  type DayMatch,
  type EnvironmentData,
  type Waypoint,
} from "./rems";

/**
 * "Environment of the chosen sol" layer (atmospheric class): the REMS daily report for the mission
 * departure date, and a marker where Curiosity was that sol ("measured by Curiosity at …").
 *
 * The departure date (UTC, from the mission panel) is matched to the REMS report of the same Earth
 * date. It is a HISTORICAL observation of the rover, shown as context: never current weather or a
 * forecast. It does not enter the route evaluation yet (the engine's daylight rule is P2's).
 */

/** Cesium Mars heights ≈ rover elev_geoid + 71.2 m (CLAUDE.md); used only to draw the marker. */
const CESIUM_MINUS_GEOID_M = 71.2;
const COLOR = "#b9a6ff"; // same as the atmospheric class tag
const UV_KEYS: Record<string, MessageKey> = {
  Low: "layers.rems.uv.Low",
  Moderate: "layers.rems.uv.Moderate",
  High: "layers.rems.uv.High",
  Very_High: "layers.rems.uv.Very_High",
  Extreme: "layers.rems.uv.Extreme",
};

export interface EnvironmentLayer {
  status(): LayerStatus;
  isVisible(): boolean;
  setVisible(on: boolean): void;
  /** Mission departure (ISO UTC); picks the REMS report of that Earth date. */
  setDeparture(utc: string | null | undefined): void;
  /** Card HTML for the Layers panel (escaped). */
  legend(): string;
  /** Called when data arrives or the chosen sol changes (to refresh the Layers panel). */
  onUpdate(cb: () => void): void;
}

export function createEnvironmentLayer(viewer: Cesium.Viewer): EnvironmentLayer {
  let data: EnvironmentData | null = null;
  let failed = false;
  let date: string | null = null;
  let match: DayMatch | null = null;
  let where: Waypoint | null = null;
  const listeners: (() => void)[] = [];

  const source = new Cesium.CustomDataSource("rems-environment");
  void viewer.dataSources.add(source);
  const marker = source.entities.add({
    id: "rems:curiosity",
    show: false,
    point: {
      pixelSize: 12,
      color: Cesium.Color.fromCssColorString(COLOR),
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    label: {
      text: "",
      font: "12px system-ui, sans-serif",
      fillColor: Cesium.Color.fromCssColorString(COLOR),
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      // Below the point, clear of a rover icon: Curiosity may stand where a panorama was taken.
      verticalOrigin: Cesium.VerticalOrigin.TOP,
      pixelOffset: new Cesium.Cartesian2(0, 26),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });

  function update() {
    match = data && date ? dayForDate(data.days, date) : null;
    where = match && data ? positionAtSol(data.waypoints, match.day.sol) : null;
    if (where && match) {
      marker.position = new Cesium.ConstantPositionProperty(
        Cesium.Cartesian3.fromDegrees(where.lon, where.lat, where.elevGeoidM + CESIUM_MINUS_GEOID_M, Cesium.Ellipsoid.MARS),
      );
      marker.label!.text = new Cesium.ConstantProperty(t("layers.rems.marker", { sol: String(match.day.sol) }));
    }
    marker.show = Boolean(where);
    listeners.forEach((cb) => cb());
  }

  loadEnvironment()
    .then((d) => {
      data = d;
      update();
    })
    .catch((err) => {
      console.warn("REMS unavailable (live and backup):", err);
      failed = true;
      update();
    });
  onLanguageChange(update);

  const deg = (n: number) =>
    new Intl.NumberFormat(numberLocale(), { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(Math.abs(n));
  const temp = (n: number | null) => (n === null ? "—" : fmtNumber(n, 0));
  const hours = (min: number) => `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min`;

  function legend(): string {
    if (failed) return `<p class="ly-note">${esc(t("layers.rems.error"))}</p>`;
    if (!data) return `<p class="ly-note">${esc(t("layers.rems.loading"))}</p>`;
    if (!match) {
      const first = data.days[0]?.date ?? "—";
      const last = data.days[data.days.length - 1]?.date ?? "—";
      return `<p class="ly-note">${esc(t("layers.rems.none", { date: date ?? "—", first, last }))}</p>`;
    }
    const d = match.day;
    const light = daylightMinutes(d.sunrise, d.sunset);
    const rows: [MessageKey, string][] = [
      [
        "layers.rems.daylight",
        d.sunrise && d.sunset
          ? t("layers.rems.daylightValue", { sunrise: d.sunrise, sunset: d.sunset, hours: light === null ? "—" : hours(light) })
          : "—",
      ],
      ["layers.rems.air", t("layers.rems.range", { min: temp(d.minAirC), max: temp(d.maxAirC) })],
      ["layers.rems.ground", t("layers.rems.range", { min: temp(d.minGroundC), max: temp(d.maxGroundC) })],
      ["layers.rems.pressure", d.pressurePa === null ? "—" : `${fmtNumber(d.pressurePa, 0)} Pa`],
      ["layers.rems.uv", d.uv ? (UV_KEYS[d.uv] ? t(UV_KEYS[d.uv]) : d.uv) : "—"],
    ];
    const origin = (o: EnvironmentData["rems"]) =>
      o.origin === "live" ? t("layers.rems.live") : t("layers.rems.cache", { date: o.fetchedAt.slice(0, 10) });
    return `
      <div class="env-card">
        <div class="env-head">${esc(
          t("layers.rems.sol", { sol: String(d.sol), date: d.date, ls: d.ls === null ? "—" : String(d.ls) }),
        )}</div>
        ${match.exact ? "" : `<div class="env-warn">${esc(t("layers.rems.nearest", { date: date ?? "—" }))}</div>`}
        <dl>${rows.map(([k, v]) => `<div><dt>${esc(t(k))}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
        ${
          where
            ? `<div class="env-where">${esc(
                t("layers.rems.position", {
                  lat: `${deg(where.lat)}° ${where.lat < 0 ? "S" : "N"}`,
                  lon: `${deg(where.lon)}° E`,
                  sol: String(where.sol),
                }),
              )}</div>`
            : ""
        }
        <p class="ly-note">${esc(t("layers.rems.note"))} · ${esc(origin(data.rems))}</p>
      </div>`;
  }

  return {
    status: () => (failed ? "missing" : !data ? "pending" : data.rems.origin === "live" ? "streaming" : "loaded"),
    isVisible: () => source.show,
    setVisible(on) {
      source.show = on;
      listeners.forEach((cb) => cb());
    },
    setDeparture(utc) {
      const next = utc ? utc.slice(0, 10) : null;
      if (next === date) return;
      date = next;
      update();
    },
    legend,
    onUpdate: (cb) => void listeners.push(cb),
  };
}
