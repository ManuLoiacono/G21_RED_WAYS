"""ML-09 C1: compare DONKI WSA-ENLIL predicted CME arrivals at Mars with RAD measurements (not ML).

Fixed a priori (not tuned):
- Alerts: ENLIL Mars arrivals. For each set of input CMEs, the latest run completed before its predicted
  arrival is kept (lead = arrival - modelCompletionTime). Arrivals closer than MERGE_H are merged into one alert.
- RAD events, from the hourly RTG-corrected B dose (clean observations):
  background = centred 7-day rolling median; robust sigma = 1.4826 * rolling MAD.
  * increase: hourly dose > background + 3 sigma for >= 2 hours (gaps of 1 hour allowed) -> particle event;
  * decrease: 6-hour mean < background - 3 sigma6 for >= 6 hours -> Forbush-like decrease.
- Match: an alert is a hit if a RAD event starts within +-WINDOW_H of the predicted arrival.
  An alert is evaluable only if RAD has >= 75 % of the hours in that window.
- Chance level: the fraction of evaluable hours with a RAD event start within +-WINDOW_H, i.e. the hit rate
  of an alert placed at a random time.
"""
from __future__ import annotations

import logging

import numpy as np
import pandas as pd

from ml import config
from ml.datasets.build_space_weather import EVENTS_OUT, HOURLY_OUT
from ml.evaluation.common import write_json

log = logging.getLogger(__name__)
OUT_DIR = config.ARTIFACTS_DIR / "C1_donki"
WINDOW_H = 24
MERGE_H = 12
Z = 3.0


def _ns(x) -> np.ndarray:
    """tz-aware timestamps -> naive UTC datetime64[ns] array."""
    return pd.DatetimeIndex(x).tz_convert("UTC").tz_localize(None).as_unit("ns").to_numpy()


def _runs(mask: pd.Series, min_len: int, max_gap: int) -> list[tuple[pd.Timestamp, pd.Timestamp]]:
    idx = mask.index[mask.to_numpy()]
    events, start, prev = [], None, None
    for t in idx:
        if start is None:
            start = prev = t
        elif (t - prev) <= pd.Timedelta(hours=max_gap + 1):
            prev = t
        else:
            events.append((start, prev))
            start = prev = t
    if start is not None:
        events.append((start, prev))
    return [(a, b) for a, b in events if (b - a) >= pd.Timedelta(hours=min_len - 1)]


def rad_events(hr: pd.DataFrame) -> pd.DataFrame:
    s = hr.set_index("hour_utc")["dose_ugy_day"]
    bg = s.rolling("7D", center=True, min_periods=72).median()
    mad = (s - bg).abs().rolling("7D", center=True, min_periods=72).median()
    sigma = 1.4826 * mad
    s6 = s.rolling("6h", min_periods=4).mean()
    sigma6 = sigma / np.sqrt(6)
    rows = []
    for a, b in _runs((s > bg + Z * sigma).fillna(False), min_len=2, max_gap=1):
        seg = s[a:b]
        rows.append({"kind": "increase", "start_utc": a, "end_utc": b, "peak_ugy_day": float(seg.max()),
                     "background_ugy_day": float(bg[a]), "ratio_peak_bg": float(seg.max() / bg[a])})
    for a, b in _runs((s6 < bg - Z * sigma6).fillna(False), min_len=6, max_gap=1):
        seg = s6[a:b]
        rows.append({"kind": "decrease", "start_utc": a, "end_utc": b, "peak_ugy_day": float(seg.min()),
                     "background_ugy_day": float(bg[a]), "ratio_peak_bg": float(seg.min() / bg[a])})
    return pd.DataFrame(rows).sort_values("start_utc").reset_index(drop=True)


def alerts(ev: pd.DataFrame) -> pd.DataFrame:
    en = ev[ev["type"] == "ENLIL_MARS_ARRIVAL"].dropna(subset=["time_utc", "issued_utc"])
    en = en[en["issued_utc"] < en["time_utc"]]
    latest = en.sort_values("issued_utc").groupby("cme_inputs").tail(1).sort_values("time_utc")
    groups, cur = [], None
    for _, r in latest.iterrows():
        if cur is not None and (r["time_utc"] - cur["predicted_arrival_utc"]) <= pd.Timedelta(hours=MERGE_H):
            cur["n_runs"] += 1
            cur["cme_inputs"] += ";" + r["cme_inputs"]
            continue
        cur = {"predicted_arrival_utc": r["time_utc"], "issued_utc": r["issued_utc"], "cme_inputs": r["cme_inputs"],
               "is_glancing_blow": r["is_glancing_blow"], "is_minor_impact": r["is_minor_impact"], "n_runs": 1}
        groups.append(cur)
    out = pd.DataFrame(groups)
    out["lead_h"] = (out["predicted_arrival_utc"] - out["issued_utc"]).dt.total_seconds() / 3600
    return out


MAVEN_RATIO = 5.0  # "more than 5x normal", as in the case described in docs/ML_PREDICCION.md


def maven_events(hourly: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series]:
    """MAVEN SEP ion events: 5-hour median (~1 orbit) > MAVEN_RATIO x centred 7-day median, >= 2 hours."""
    s = hourly.drop_duplicates("hour_utc").set_index("hour_utc")["ion_flux_median"].astype(float)
    full = pd.date_range(s.index.min(), s.index.max(), freq="h", tz="UTC")
    s = s.reindex(full)
    r5 = s.rolling(5, min_periods=3).median()
    bg = r5.rolling("7D", center=True, min_periods=72).median()
    rows = []
    for a, b in _runs((r5 > MAVEN_RATIO * bg).fillna(False), min_len=2, max_gap=1):
        rows.append({"kind": "maven_ion", "start_utc": a, "end_utc": b, "ratio_peak_bg": float((r5[a:b] / bg[a]).max())})
    return pd.DataFrame(rows, columns=["kind", "start_utc", "end_utc", "ratio_peak_bg"]), s.notna() & bg.notna()


def evaluate_maven(al: pd.DataFrame) -> dict:
    """Same matching as RAD, restricted to alerts whose +-WINDOW_H window has >= 75 % MAVEN hourly coverage.

    MAVEN days were downloaded only around alerts, so 'events without alert' and the chance level are
    computed inside the downloaded windows only (biased towards active periods).
    """
    from datetime import timedelta
    from ml.sources import maven_sep
    days = [(t + timedelta(days=k)).date() for t in al.loc[al["evaluable"], "predicted_arrival_utc"] for k in range(-3, 4)]
    cached = maven_sep.fetch_days(days)  # cached days are not downloaded again
    hourly = maven_sep.load_hourly(days)
    if hourly.empty:
        return {"available": False}
    ev, has = maven_events(hourly)
    w = pd.Timedelta(hours=WINDOW_H)
    cov = [has[t - w:t + w].mean() if len(has[t - w:t + w]) else 0.0 for t in al["predicted_arrival_utc"]]
    al["maven_coverage"] = cov
    al["maven_evaluable"] = al["evaluable"] & (al["maven_coverage"] >= 0.75)
    st = np.sort(_ns(ev["start_utc"]))
    errs, hit = [], []
    for t in _ns(al.loc[al["maven_evaluable"], "predicted_arrival_utc"]):
        d = (st - t) / np.timedelta64(1, "h")
        inside = d[np.abs(d) <= WINDOW_H]
        hit.append(inside.size > 0)
        if inside.size:
            errs.append(float(inside[np.argmin(np.abs(inside))]))
    al["hit_maven"] = False
    al.loc[al["maven_evaluable"], "hit_maven"] = hit
    hours = _ns(has.index[has])
    w64 = np.timedelta64(WINDOW_H, "h")
    pos = np.searchsorted(st, hours - w64)
    nxt = np.where(pos < len(st), st[np.minimum(pos, len(st) - 1)], np.datetime64("NaT", "ns"))
    chance = float(np.mean(~np.isnat(nxt) & (nxt <= hours + w64))) if len(hours) else None
    at = np.sort(_ns(al["predicted_arrival_utc"]))
    missed = sum(int(not (np.abs((at - t) / np.timedelta64(1, "h")) <= WINDOW_H).any()) for t in st)
    ev.to_parquet(OUT_DIR / "maven_events.parquet", index=False)
    return {
        "available": True, "ratio_threshold": MAVEN_RATIO, "n_days_downloaded": int(len(cached)),
        "n_alerts": int(len(hit)), "hits": int(np.sum(hit)), "false_alarms": int(len(hit) - np.sum(hit)),
        "observed_events_in_downloaded_windows": int(len(st)), "observed_without_alert": missed,
        "chance_hit_fraction_in_windows": round(chance, 4) if chance is not None else None,
        "timing_error_h_median": round(float(np.median(errs)), 2) if errs else None,
        "timing_error_h_mean_abs": round(float(np.mean(np.abs(errs))), 2) if errs else None,
        "test_window_events": ev[(ev["start_utc"] >= config.TEST_START_UTC) & (ev["start_utc"] <= config.TEST_END_UTC + pd.Timedelta(days=1))]
        .assign(start_utc=lambda x: x["start_utc"].astype(str), end_utc=lambda x: x["end_utc"].astype(str)).round(2).to_dict(orient="records"),
    }


def evaluate() -> dict:
    hr = pd.read_parquet(HOURLY_OUT)
    ev = pd.read_parquet(EVENTS_OUT)
    obs = rad_events(hr)
    al = alerts(ev)
    has = hr.set_index("hour_utc")["dose_ugy_day"].notna()
    w = pd.Timedelta(hours=WINDOW_H)
    first, last = has.index[has][0], has.index[has][-1]
    al = al[(al["predicted_arrival_utc"] >= first) & (al["predicted_arrival_utc"] <= last)].copy()

    def coverage(t):
        return has[t - w:t + w].mean()

    al["rad_coverage"] = [coverage(t) for t in al["predicted_arrival_utc"]]
    al["evaluable"] = al["rad_coverage"] >= 0.75
    res = {"window_h": WINDOW_H, "z": Z, "n_alerts_total": int(len(al)), "n_alerts_evaluable": int(al["evaluable"].sum()),
           "rad_events": obs["kind"].value_counts().to_dict(), "by_kind": {}}
    starts = {k: _ns(obs.loc[obs["kind"] == k, "start_utc"]) for k in ("increase", "decrease")}
    starts["any"] = _ns(obs["start_utc"])
    hours = _ns(has.index[has])
    w64 = np.timedelta64(WINDOW_H, "h")
    for kind, st in starts.items():
        st = np.sort(st)
        errs, hit = [], []
        for t in _ns(al.loc[al["evaluable"], "predicted_arrival_utc"]):
            d = (st - t) / np.timedelta64(1, "h")
            inside = d[np.abs(d) <= WINDOW_H]
            hit.append(inside.size > 0)
            if inside.size:
                errs.append(float(inside[np.argmin(np.abs(inside))]))
        # Chance: fraction of evaluable hours with an event start within +-WINDOW_H.
        pos = np.searchsorted(st, hours - w64)
        nxt = np.where(pos < len(st), st[np.minimum(pos, len(st) - 1)], np.datetime64("NaT", "ns"))
        chance = float(np.mean(~np.isnat(nxt) & (nxt <= hours + w64)))
        al[f"hit_{kind}"] = False
        al.loc[al["evaluable"], f"hit_{kind}"] = hit
        # Missed: observed events with no alert within +-WINDOW_H (during RAD coverage).
        at = np.sort(_ns(al["predicted_arrival_utc"]))
        missed = 0
        for t in st:
            d = np.abs((at - t) / np.timedelta64(1, "h"))
            missed += int(not (d <= WINDOW_H).any())
        res["by_kind"][kind] = {
            "hits": int(np.sum(hit)), "false_alarms": int(len(hit) - np.sum(hit)), "n_alerts": int(len(hit)),
            "observed_events": int(len(st)), "observed_without_alert": missed,
            "chance_hit_fraction": round(chance, 4),
            "timing_error_h_median": round(float(np.median(errs)), 2) if errs else None,
            "timing_error_h_mean_abs": round(float(np.mean(np.abs(errs))), 2) if errs else None,
        }
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    res["maven"] = evaluate_maven(al)
    res["lead_h_median"] = round(float(al.loc[al["evaluable"], "lead_h"].median()), 1)
    win = al[(al["predicted_arrival_utc"] >= config.TEST_START_UTC) & (al["predicted_arrival_utc"] <= config.TEST_END_UTC + pd.Timedelta(days=1))]
    res["test_window_alerts"] = win.assign(predicted_arrival_utc=win["predicted_arrival_utc"].astype(str),
                                           issued_utc=win["issued_utc"].astype(str)).to_dict(orient="records")
    wobs = obs[(obs["start_utc"] >= config.TEST_START_UTC) & (obs["start_utc"] <= config.TEST_END_UTC + pd.Timedelta(days=1))]
    res["test_window_rad_events"] = wobs.assign(start_utc=wobs["start_utc"].astype(str), end_utc=wobs["end_utc"].astype(str)).round(2).to_dict(orient="records")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    al.to_parquet(OUT_DIR / "alerts.parquet", index=False)
    obs.to_parquet(OUT_DIR / "rad_events.parquet", index=False)
    return res


def main() -> None:
    logging.basicConfig(level=logging.WARNING)
    res = evaluate()
    write_json(OUT_DIR / "metrics.json", {"model": "C1_donki", **res})
    print({k: v for k, v in res.items() if not k.startswith("test_window")})
    print("window alerts:", [(a["predicted_arrival_utc"], a.get("hit_any")) for a in res["test_window_alerts"]])
    print("window rad events:", [(e["kind"], e["start_utc"], e["ratio_peak_bg"]) for e in res["test_window_rad_events"]])


if __name__ == "__main__":
    main()
