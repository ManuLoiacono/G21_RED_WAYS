"""Case frames (issue sol -> target sol) with baselines and model features for A1 and A2.

Only information available at the issue sol is used as input: observations up to the issue sol,
rover elevation at the issue sol, and calendar quantities of the target sol (Ls is deterministic).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from ml.evaluation.common import ClimCache, anomaly_lags, base_frame, ffill_obs, norm_factor

PRESSURE_SPACES = ("raw", "norm")
_PRESSURE_COL = {"raw": "pressure_pa", "norm": "pressure_norm_pa"}


def pressure_feature_cols(space: str) -> list[str]:
    return [f"p{space}_anom_lag{k}" for k in range(5)] + [f"p{space}_clim_drift", "sin_ls", "cos_ls", "rover_elev_m"]


def pressure_frame(df: pd.DataFrame, horizon: int, cc: ClimCache) -> pd.DataFrame:
    f = base_frame(df, horizon)
    nf_issue = norm_factor(df["rover_elev_m"])
    f["y"] = df["pressure_pa"].shift(-horizon)
    f["persistence"] = ffill_obs(df["pressure_pa"])

    clim_raw = cc.get("pressure_pa")
    clim_norm = cc.get("pressure_norm_pa")
    for q in ("mean", "p10", "p90"):
        f[f"clim_raw_{q}"] = clim_raw[q].shift(-horizon)
        # Normalised climatology converted back to the rover elevation at the issue sol.
        f[f"clim_elev_{q}"] = clim_norm[q].shift(-horizon) / nf_issue

    for space in PRESSURE_SPACES:
        col, clim = _PRESSURE_COL[space], (clim_raw if space == "raw" else clim_norm)
        f = f.join(anomaly_lags(df[col], clim["mean"], f"p{space}"))
        f[f"p{space}_clim_target"] = clim["mean"].shift(-horizon)
        f[f"p{space}_clim_drift"] = clim["mean"].shift(-horizon) - clim["mean"]
        f[f"p{space}_y_anom"] = df[col].shift(-horizon) - clim["mean"].shift(-horizon)
    # Factor to convert a normalised prediction back to Pa at the issue elevation.
    f["norm_to_pa"] = 1.0 / nf_issue

    needed = ["y", "persistence", "clim_raw_mean", "clim_elev_mean", "praw_anom_lag0", "pnorm_anom_lag0",
              "praw_clim_target", "pnorm_clim_target", "rover_elev_m"]
    f["valid"] = f[needed].notna().all(axis=1)
    return f


TEMP_VARS = ("min_temp_c", "max_temp_c")


def temperature_feature_cols() -> list[str]:
    cols = [f"tmin_anom_lag{k}" for k in range(5)] + [f"tmax_anom_lag{k}" for k in range(5)]
    cols += [f"dtr_lag{k}" for k in range(3)]
    cols += ["pnorm_anom_lag0", "clim_target_width", "clim_target_mean", "clim_drift", "sin_ls", "cos_ls", "rover_elev_m"]
    return cols


def temperature_frame(df: pd.DataFrame, horizon: int, cc: ClimCache, target: str) -> pd.DataFrame:
    if target not in TEMP_VARS:
        raise ValueError(f"unknown temperature target {target}")
    f = base_frame(df, horizon)
    f["y"] = df[target].shift(-horizon)
    f["persistence"] = ffill_obs(df[target])

    clim_t = cc.get(target)
    for q in ("mean", "p10", "p90"):
        f[f"clim_{q}"] = clim_t[q].shift(-horizon)
    f["clim_target_mean"] = f["clim_mean"]
    f["clim_target_width"] = f["clim_p90"] - f["clim_p10"]
    f["clim_drift"] = clim_t["mean"].shift(-horizon) - clim_t["mean"]

    f = f.join(anomaly_lags(df["min_temp_c"], cc.get("min_temp_c")["mean"], "tmin"))
    f = f.join(anomaly_lags(df["max_temp_c"], cc.get("max_temp_c")["mean"], "tmax"))
    dtr = ffill_obs(df["dtr_c"])
    for k in range(3):
        f[f"dtr_lag{k}"] = dtr.shift(k)
    f["pnorm_anom_lag0"] = ffill_obs(df["pressure_norm_pa"]) - cc.get("pressure_norm_pa")["mean"]
    f["y_anom"] = f["y"] - f["clim_mean"]

    own = "tmin_anom_lag0" if target == "min_temp_c" else "tmax_anom_lag0"
    needed = ["y", "persistence", "clim_mean", "clim_p10", "clim_p90", own, "rover_elev_m"]
    f["valid"] = f[needed].notna().all(axis=1)
    return f
