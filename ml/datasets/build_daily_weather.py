"""DS-W: one row per sol (1..last REMS sol) with REMS daily values, Ls, Mars year and rover elevation.

Output: data/processed/ml/daily_weather.parquet (+ daily_weather_summary.json).

Rules (docs/ML_PREDICCION.md, CLAUDE.md):
- REMS '--' -> NaN, never 0. wind_speed / abs_humidity / atmo_opacity are not used.
- Sols without a REMS record are kept as rows with NaN values (has_rems_record = False), so that
  lags by sol are correct. Their date_utc is interpolated from neighbouring sols (derived).
- Rover elevation: waypoints are not daily; elevation is forward-filled by sol.
- Ls and Mars year come from `marstime` at 12:00 UTC of date_utc; REMS `ls` (integer) is kept for comparison.
"""
from __future__ import annotations

import json
import logging

import marstime
import numpy as np
import pandas as pd

from ml import config
from ml.sources import rems, waypoints
from ml.sources._cache import read_meta

log = logging.getLogger(__name__)

OUT_PATH = config.PROCESSED_DIR / "daily_weather.parquet"
SUMMARY_PATH = config.PROCESSED_DIR / "daily_weather_summary.json"

UV_ORDER = ["Low", "Moderate", "High", "Very_High"]


def _num(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series.replace("--", np.nan), errors="coerce")


def _hhmm_to_min(series: pd.Series) -> pd.Series:
    parts = series.replace("--", np.nan).str.split(":", expand=True)
    return pd.to_numeric(parts[0], errors="coerce") * 60 + pd.to_numeric(parts[1], errors="coerce")


def _mars_time(date_utc: pd.Series) -> tuple[np.ndarray, np.ndarray]:
    """Ls (deg) and Mars year (Clancy/Piqueux convention via marstime.Mars_Year) at 12:00 UTC."""
    noon_ms = (date_utc + pd.Timedelta(hours=12)).dt.as_unit("ns").astype("int64") // 10**6
    ls, my = [], []
    for ms in noon_ms:
        ott = marstime.j2000_offset_tt(marstime.julian_tt(marstime.julian(float(ms))))
        ls.append(float(marstime.Mars_Ls(ott)) % 360.0)
        my.append(int(np.floor(marstime.Mars_Year(ott))))
    return np.asarray(ls), np.asarray(my)


def load_rems_frame() -> pd.DataFrame:
    raw = pd.DataFrame(rems.load_records())
    df = pd.DataFrame(
        {
            "sol": raw["sol"].astype(int),
            "date_utc": pd.to_datetime(raw["terrestrial_date"], utc=True).dt.as_unit("ns"),
            "rems_ls_deg": _num(raw["ls"]),
            "pressure_pa": _num(raw["pressure"]),
            "min_temp_c": _num(raw["min_temp"]),
            "max_temp_c": _num(raw["max_temp"]),
            "min_gts_temp_c": _num(raw["min_gts_temp"]),
            "max_gts_temp_c": _num(raw["max_gts_temp"]),
            "uv_category": raw["local_uv_irradiance_index"].replace("--", np.nan),
            "sunrise_lmst": raw["sunrise"].replace("--", np.nan),
            "sunset_lmst": raw["sunset"].replace("--", np.nan),
        }
    )
    df["sunrise_lmst_min"] = _hhmm_to_min(df["sunrise_lmst"])
    df["sunset_lmst_min"] = _hhmm_to_min(df["sunset_lmst"])
    return df.sort_values("sol").reset_index(drop=True)


def load_elevation_by_sol() -> pd.DataFrame:
    feats = waypoints.load_features()
    wp = pd.DataFrame([f["properties"] for f in feats])[["sol", "elev_geoid", "lon", "lat"]]
    # Several waypoints per sol: keep the last one of each sol (end-of-sol position).
    wp = wp.sort_values("sol", kind="stable").groupby("sol", as_index=False).last()
    return wp.rename(columns={"elev_geoid": "rover_elev_m", "lon": "rover_lon_deg", "lat": "rover_lat_deg"})


def build() -> pd.DataFrame:
    rems_df = load_rems_frame()
    all_sols = pd.DataFrame({"sol": np.arange(1, rems_df["sol"].max() + 1)})
    df = all_sols.merge(rems_df, on="sol", how="left")
    df["has_rems_record"] = df["date_utc"].notna()

    # Interpolate missing dates linearly in sol (derived, flagged by has_rems_record).
    secs = df["date_utc"].dt.as_unit("ns").astype("int64").where(df["has_rems_record"]).astype(float)
    secs = secs.interpolate(method="linear", limit_direction="both")
    df["date_utc"] = pd.to_datetime(secs.round().astype("int64"), unit="ns", utc=True).dt.floor("D")

    df["ls_deg"], df["mars_year"] = _mars_time(df["date_utc"])
    diff = (df["ls_deg"] - df["rems_ls_deg"] + 180.0) % 360.0 - 180.0
    df["ls_minus_rems_ls_deg"] = diff

    df["dtr_c"] = df["max_temp_c"] - df["min_temp_c"]
    df["uv_level"] = df["uv_category"].map({k: i for i, k in enumerate(UV_ORDER)}).astype("float")

    elev = load_elevation_by_sol()
    df = df.merge(elev, on="sol", how="left")
    df["has_waypoint"] = df["rover_elev_m"].notna()
    for col in ("rover_elev_m", "rover_lon_deg", "rover_lat_deg"):
        df[col] = df[col].ffill()

    elev_ref = float(elev.sort_values("sol")["rover_elev_m"].iloc[0])
    df["pressure_norm_pa"] = df["pressure_pa"] * np.exp((df["rover_elev_m"] - elev_ref) / config.SCALE_HEIGHT_M)

    df["before_cutoff"] = df["date_utc"] < config.CUTOFF_UTC
    df["in_test_window"] = (df["date_utc"] >= config.TEST_START_UTC) & (df["date_utc"] <= config.TEST_END_UTC)

    cols = [
        "sol", "date_utc", "has_rems_record", "ls_deg", "rems_ls_deg", "ls_minus_rems_ls_deg", "mars_year",
        "pressure_pa", "pressure_norm_pa", "min_temp_c", "max_temp_c", "dtr_c",
        "min_gts_temp_c", "max_gts_temp_c", "uv_category", "uv_level",
        "sunrise_lmst", "sunset_lmst", "sunrise_lmst_min", "sunset_lmst_min",
        "rover_elev_m", "rover_lon_deg", "rover_lat_deg", "has_waypoint",
        "before_cutoff", "in_test_window",
    ]
    df = df[cols]
    df.attrs["elev_ref_m"] = elev_ref
    return df


def summarize(df: pd.DataFrame) -> dict:
    rec = df[df["has_rems_record"]]
    by_year = (
        df.groupby("mars_year")
        .agg(sol_min=("sol", "min"), sol_max=("sol", "max"), n_sols=("sol", "size"),
             n_rems_records=("has_rems_record", "sum"), n_pressure=("pressure_pa", "count"),
             date_min=("date_utc", "min"), date_max=("date_utc", "max"),
             ls_min=("ls_deg", "min"), ls_max=("ls_deg", "max"))
        .reset_index()
    )
    by_year["date_min"] = by_year["date_min"].dt.strftime("%Y-%m-%d")
    by_year["date_max"] = by_year["date_max"].dt.strftime("%Y-%m-%d")
    win = df[df["in_test_window"]]
    win_rec = win[win["has_rems_record"]]
    cut = df[df["before_cutoff"]]
    ls_diff = rec["ls_minus_rems_ls_deg"].abs()
    return {
        "n_rows": int(len(df)),
        "n_rems_records": int(rec.shape[0]),
        "sol_range": [int(df["sol"].min()), int(df["sol"].max())],
        "missing_per_column": {c: int(v) for c, v in df.isna().sum().items()},
        "missing_per_column_rems_rows_only": {c: int(v) for c, v in rec.isna().sum().items()},
        "sols_by_mars_year": json.loads(by_year.to_json(orient="records")),
        "test_window": {
            "dates_utc": [config.TEST_START_UTC.strftime("%Y-%m-%d"), config.TEST_END_UTC.strftime("%Y-%m-%d")],
            "sol_min": int(win["sol"].min()),
            "sol_max": int(win["sol"].max()),
            "n_sols": int(len(win)),
            "n_rems_records": int(len(win_rec)),
            "rems_record_sol_min": int(win_rec["sol"].min()),
            "rems_record_sol_max": int(win_rec["sol"].max()),
            "sols_without_rems_record": [int(s) for s in win.loc[~win["has_rems_record"], "sol"]],
            "n_pressure": int(win["pressure_pa"].count()),
            "n_min_temp": int(win["min_temp_c"].count()),
            "n_max_temp": int(win["max_temp_c"].count()),
            "mars_year": sorted({int(y) for y in win["mars_year"]}),
            "ls_range_deg": [round(float(win["ls_deg"].min()), 2), round(float(win["ls_deg"].max()), 2)],
        },
        "last_sol_before_cutoff": int(cut["sol"].max()),
        "ls_vs_rems": {
            "abs_diff_mean_deg": round(float(ls_diff.mean()), 3),
            "abs_diff_p99_deg": round(float(ls_diff.quantile(0.99)), 3),
            "abs_diff_max_deg": round(float(ls_diff.max()), 3),
        },
        "elev_ref_m": df.attrs.get("elev_ref_m"),
        "scale_height_m": config.SCALE_HEIGHT_M,
        "sources": {
            "rems": read_meta(rems.RAW_PATH),
            "waypoints": read_meta(waypoints.RAW_PATH),
        },
    }


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    df = build()
    config.PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    df.to_parquet(OUT_PATH, index=False)
    summary = summarize(df)
    SUMMARY_PATH.write_text(json.dumps(summary, indent=2, default=str), encoding="utf-8")
    log.info("wrote %s (%d rows) and %s", OUT_PATH.name, len(df), SUMMARY_PATH.name)


if __name__ == "__main__":
    main()
