"""DS-S: space_weather_events.parquet, one row per DONKI event (CME, SEP, ENLIL predicted arrival at Mars),
plus rad_hourly.parquet (hourly RAD dose from the cached dose series; clean observations only).
"""
from __future__ import annotations

import logging

import pandas as pd

from ml import config
from ml.datasets.build_rad_daily import TARGET
from ml.sources import donki, rad

log = logging.getLogger(__name__)
EVENTS_OUT = config.PROCESSED_DIR / "space_weather_events.parquet"
HOURLY_OUT = config.PROCESSED_DIR / "rad_hourly.parquet"


def _t(x):
    return pd.to_datetime(x, utc=True, errors="coerce") if x else pd.NaT


def build_events() -> pd.DataFrame:
    rows = []
    for c in donki.load("CME"):
        best = next((a for a in (c.get("cmeAnalyses") or []) if a.get("isMostAccurate")), None) or {}
        rows.append({"type": "CME", "event_id": c.get("activityID"), "time_utc": _t(c.get("startTime")),
                     "speed_km_s": best.get("speed"), "half_angle_deg": best.get("halfAngle"),
                     "latitude_deg": best.get("latitude"), "longitude_deg": best.get("longitude")})
    for s in donki.load("SEP"):
        rows.append({"type": "SEP", "event_id": s.get("sepID"), "time_utc": _t(s.get("eventTime")),
                     "instruments": ",".join(i.get("displayName", "") for i in (s.get("instruments") or []))})
    for sim in donki.load("WSAEnlilSimulations"):
        cme_ids = ",".join(sorted({str(ci.get("activityID") or ci.get("CMEID") or "") for ci in (sim.get("cmeInputs") or [])}))
        speeds = [ci.get("speed") for ci in (sim.get("cmeInputs") or []) if ci.get("speed") is not None]
        for imp in sim.get("impactList") or []:
            if imp.get("location") != "Mars":
                continue
            rows.append({"type": "ENLIL_MARS_ARRIVAL", "event_id": sim.get("simulationID"),
                         "time_utc": _t(imp.get("arrivalTime")), "issued_utc": _t(sim.get("modelCompletionTime")),
                         "cme_inputs": cme_ids, "speed_km_s": max(speeds) if speeds else None,
                         "is_glancing_blow": bool(imp.get("isGlancingBlow")),
                         "is_minor_impact": bool(imp.get("isMinorImpact"))})
    ev = pd.DataFrame(rows).sort_values(["type", "time_utc", "event_id"]).reset_index(drop=True)
    return ev


def build_rad_hourly() -> pd.DataFrame:
    files = sorted(rad.DOSE_DIR.glob("*/msl_rad_dose_*.parquet"))
    obs = pd.concat([pd.read_parquet(f, columns=["epoch_utc", TARGET, "flag"]) for f in files], ignore_index=True)
    obs = obs[(obs["flag"] == "") & obs[TARGET].notna()].drop_duplicates("epoch_utc")
    hourly = obs.groupby(obs["epoch_utc"].dt.floor("h"))[TARGET].agg(["mean", "size"])
    hourly.columns = ["dose_ugy_day", "n_obs"]
    hourly.index.name = "hour_utc"
    full = pd.date_range(hourly.index.min(), hourly.index.max(), freq="h", tz="UTC", name="hour_utc")
    return hourly.reindex(full).reset_index()


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    ev = build_events()
    ev.to_parquet(EVENTS_OUT, index=False)
    hr = build_rad_hourly()
    hr.to_parquet(HOURLY_OUT, index=False)
    log.info("wrote %s (%s) and %s (%d hours)", EVENTS_OUT.name, ev["type"].value_counts().to_dict(), HOURLY_OUT.name, len(hr))


if __name__ == "__main__":
    main()
