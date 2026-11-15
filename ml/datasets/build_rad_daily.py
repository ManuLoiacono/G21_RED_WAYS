"""DS-R (rad_daily.parquet, one row per MSL sol with RAD data) and DS-X (sunspots_daily.parquet).

RAD observations (~17 min cadence) are assigned to MSL sols with
    sol = floor(MSD + lon_east / 360) - 49269
(MSD from marstime). The offset 49269 reproduces the REMS sol/date pairs for 100 % of REMS rows
(checked 14/11/2026). A fixed longitude is used; the rover moved < 0.1 deg, i.e. < 30 s of local time.

Per sol: mean dose rate of the observations without a quality flag (FLAGGED_DATA == ""), the maximum
hourly mean (UTC hours), and observation counts. A sol is usable (has_dose) when it has at least
MIN_CLEAN_OBS clean observations, so partial sols do not bias the mean (the dose rate has a daily cycle).
"""
from __future__ import annotations

import json
import logging

import marstime
import numpy as np
import pandas as pd

from ml import config
from ml.evaluation.common import write_json
from ml.sources import rad, sunspots
from ml.sources._cache import read_meta

log = logging.getLogger(__name__)

RAD_OUT = config.PROCESSED_DIR / "rad_daily.parquet"
SUNSPOTS_OUT = config.PROCESSED_DIR / "sunspots_daily.parquet"
SUMMARY_OUT = config.PROCESSED_DIR / "rad_daily_summary.json"
MSD_TO_MSL_SOL_OFFSET = 49269
GALE_LON_EAST_DEG = 137.42
MIN_CLEAN_OBS = 48  # ~2/3 of the ~84 observations per sol
DOSE_COLS = list(rad.DOSE_COLUMNS.values())
TARGET = "dose_b_rtgcorr_ugy_day"


def msl_sol(epoch_utc: pd.Series) -> np.ndarray:
    ms = epoch_utc.dt.as_unit("ns").astype("int64").to_numpy() / 1e6
    msd = marstime.Mars_Solar_Date(marstime.j2000_offset_tt(marstime.julian_tt(marstime.julian(ms))))
    return np.floor(msd + GALE_LON_EAST_DEG / 360.0).astype(int) - MSD_TO_MSL_SOL_OFFSET


def load_observations() -> pd.DataFrame:
    files = sorted(rad.DOSE_DIR.glob("*/msl_rad_dose_*.parquet"))
    if not files:
        raise FileNotFoundError("no cached RAD dose series; run rad.fetch_all_dose first")
    obs = pd.concat([pd.read_parquet(f) for f in files], ignore_index=True)
    obs = obs.drop_duplicates("epoch_utc").sort_values("epoch_utc").reset_index(drop=True)
    obs["sol"] = msl_sol(obs["epoch_utc"])
    obs["clean"] = (obs["flag"] == "") & obs[TARGET].notna()
    return obs


def aggregate(obs: pd.DataFrame) -> pd.DataFrame:
    clean = obs[obs["clean"]]
    per_sol = clean.groupby("sol")[DOSE_COLS].mean()
    hourly = clean.assign(hour=clean["epoch_utc"].dt.floor("h")).groupby(["sol", "hour"])[TARGET].mean()
    per_sol[f"{TARGET}_max_hourly"] = hourly.groupby(level="sol").max()
    per_sol["n_obs_clean"] = clean.groupby("sol").size()
    counts = obs.groupby("sol").agg(n_obs=("epoch_utc", "size"),
                                    n_obs_flagged=("flag", lambda f: int((f != "").sum())),
                                    source_files=("source_file", lambda s: ",".join(sorted(set(s)))))
    out = counts.join(per_sol, how="left").reset_index()
    out["n_obs_clean"] = out["n_obs_clean"].fillna(0).astype(int)
    out["has_dose"] = out["n_obs_clean"] >= MIN_CLEAN_OBS
    for c in [*DOSE_COLS, f"{TARGET}_max_hourly"]:
        out.loc[~out["has_dose"], c] = np.nan
    return out


def build_sunspots() -> pd.DataFrame:
    ss = sunspots.load()
    ss = ss[ss["date_utc"] >= pd.Timestamp("2011-01-01", tz="UTC")].set_index("date_utc").sort_index()
    ss["sn_mean_27d"] = ss["sn"].rolling("27D", min_periods=20).mean()
    return ss.reset_index()


def build() -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    weather = pd.read_parquet(config.PROCESSED_DIR / "daily_weather.parquet")
    obs = load_observations()
    daily = aggregate(obs)
    cols = ["sol", "date_utc", "ls_deg", "mars_year", "before_cutoff", "in_test_window"]
    rad_daily = weather[cols].merge(daily, on="sol", how="left")
    rad_daily["has_dose"] = rad_daily["has_dose"].fillna(False).astype(bool)
    rad_daily["n_obs"] = rad_daily["n_obs"].fillna(0).astype(int)
    rad_daily["n_obs_flagged"] = rad_daily["n_obs_flagged"].fillna(0).astype(int)
    rad_daily["n_obs_clean"] = rad_daily["n_obs_clean"].fillna(0).astype(int)

    # Consistency check of the sol assignment: RAD observations should fall on or next to the REMS date.
    first_obs = obs.groupby("sol")["epoch_utc"].min().dt.floor("D")
    chk = weather.set_index("sol").join(first_obs.rename("first_obs_day"), how="inner")
    chk = chk[chk["has_rems_record"]]
    day_diff = (chk["first_obs_day"] - chk["date_utc"]).dt.days

    ss = build_sunspots()
    has = rad_daily[rad_daily["has_dose"]]
    pre = has[has["before_cutoff"]]
    win = rad_daily[rad_daily["in_test_window"]]
    summary = {
        "n_observations": int(len(obs)),
        "n_observations_flagged": int((obs["flag"] != "").sum()),
        "flags": {k: int(v) for k, v in obs["flag"].value_counts().items()},
        "n_sols_with_any_obs": int((rad_daily["n_obs"] > 0).sum()),
        "n_sols_with_dose": int(len(has)),
        "min_clean_obs_per_sol": MIN_CLEAN_OBS,
        "sol_range_with_dose": [int(has["sol"].min()), int(has["sol"].max())],
        "first_obs_utc": str(obs["epoch_utc"].min()),
        "last_obs_utc": str(obs["epoch_utc"].max()),
        "n_sols_with_dose_before_cutoff": int(len(pre)),
        "test_window": {"n_sols": int(len(win)), "n_sols_with_dose": int(win["has_dose"].sum()),
                        "sols_without_dose": [int(s) for s in win.loc[~win["has_dose"], "sol"]]},
        "sol_assignment_check": {"n": int(len(day_diff)),
                                 "first_obs_day_minus_rems_date_days": {str(k): int(v) for k, v in day_diff.value_counts().sort_index().items()}},
        "dose_by_mars_year": json.loads(
            has.groupby("mars_year")[TARGET].agg(["count", "mean", "min", "max"]).round(2).reset_index().to_json(orient="records")),
        "missing_per_column": {c: int(v) for c, v in rad_daily.isna().sum().items()},
        "sunspots": {"source": read_meta(sunspots.RAW_PATH), "last_date": str(ss["date_utc"].max().date()),
                     "first_provisional": str(ss.loc[ss["definitive"] == 0, "date_utc"].min().date())},
        "units": "uGy/day (RAD DOSIMETRY_TOTAL; B = silicon, E = tissue-equivalent plastic)",
    }
    return rad_daily, ss, summary


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    rad_daily, ss, summary = build()
    rad_daily.to_parquet(RAD_OUT, index=False)
    ss.to_parquet(SUNSPOTS_OUT, index=False)
    write_json(SUMMARY_OUT, summary)
    log.info("wrote %s (%d sols with dose) and %s", RAD_OUT.name, summary["n_sols_with_dose"], SUNSPOTS_OUT.name)


if __name__ == "__main__":
    main()
