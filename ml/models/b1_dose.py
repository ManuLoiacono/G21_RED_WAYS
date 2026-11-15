"""ML-08: B1 background dose rate in Gale (RAD, B detector, RTG-corrected, uGy/day) per sol, leads 1, 3, 5, 10.

Reference (docs/ML_PREDICCION.md): trailing 27-sol moving average of the dose at the issue sol ("ma27").
Second baseline: persistence. Candidates predict the anomaly y(target) - ma27(issue):
- ridge_a{alpha}: linear model with a physical basis (pressure and expected pressure change, solar activity).
- lgbm: LightGBM (L1 loss) on the same features.
Features use only information available at the issue sol: RAD dose up to the issue sol, REMS pressure at the
issue sol, the elevation-adjusted pressure climatology of the target sol (A1 climatology, frozen at cutoff),
SILSO sunspot means ending at the issue date, and the target Ls.
Also reports a "physics check": OLS of the daily dose on pressure and lagged sunspots (sols before cutoff).
"""
from __future__ import annotations

import logging

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.impute import SimpleImputer
from sklearn.linear_model import Ridge
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from ml import config
from ml.datasets.build_rad_daily import RAD_OUT, SUNSPOTS_OUT, TARGET
from ml.evaluation.common import (ClimCache, base_frame, ffill_obs, load_daily, norm_factor, summarize_predictions,
                                  write_json)
from ml.models.runner import run, select_by_cv

log = logging.getLogger(__name__)
MODEL_ID = "B1_dose"
OUT_DIR = config.ARTIFACTS_DIR / MODEL_ID
HORIZONS = (1, 3, 5, 10)
MA_SOLS = 27
RIDGE_ALPHAS = (1.0, 10.0, 100.0)
LGBM_PARAMS = dict(objective="l1", n_estimators=400, learning_rate=0.03, num_leaves=15, min_child_samples=40,
                   subsample=0.8, subsample_freq=1, colsample_bytree=0.8, random_state=config.RANDOM_SEED,
                   n_jobs=1, deterministic=True, force_row_wise=True, verbose=-1)
FEATURES = ["dose_anom_lag0", "dose_anom_lag1", "dose_anom_lag2", "ma27", "ma27_minus_ma81",
            "pressure_issue_pa", "expected_dp_pa", "ssn_0_27d", "ssn_27_90d", "ssn_90_180d", "sin_ls", "cos_ls"]


def load_frame_source() -> pd.DataFrame:
    """DS-W joined with the RAD dose per sol and sunspot means known at each sol's date."""
    df = load_daily()
    rad = pd.read_parquet(RAD_OUT)[["sol", TARGET, "has_dose"]]
    df = df.merge(rad, on="sol", how="left")
    ss = pd.read_parquet(SUNSPOTS_OUT).set_index("date_utc")["sn"].asfreq("D")
    windows = {"ssn_0_27d": (0, 27), "ssn_27_90d": (27, 90), "ssn_90_180d": (90, 180)}
    for name, (lag, end) in windows.items():
        series = ss.rolling(end - lag, min_periods=int(0.7 * (end - lag))).mean().shift(lag)
        df[name] = series.reindex(df["date_utc"]).to_numpy()
    return df


def dose_frame(df: pd.DataFrame, horizon: int, cc: ClimCache) -> pd.DataFrame:
    f = base_frame(df, horizon)
    dose = df[TARGET]
    dose_ff = ffill_obs(dose)
    ma27 = dose.rolling(MA_SOLS, min_periods=10).mean()
    ma81 = dose.rolling(81, min_periods=30).mean()
    f["y"] = dose.shift(-horizon)
    f["persistence"] = dose_ff
    f["ma27"] = ma27
    f["ma27_minus_ma81"] = ma27 - ma81
    for k in range(3):
        f[f"dose_anom_lag{k}"] = dose_ff.shift(k) - ma27
    f["pressure_issue_pa"] = ffill_obs(df["pressure_pa"])
    clim_elev_target = cc.get("pressure_norm_pa")["mean"].shift(-horizon) / norm_factor(df["rover_elev_m"])
    f["expected_dp_pa"] = clim_elev_target - f["pressure_issue_pa"]
    for c in ("ssn_0_27d", "ssn_27_90d", "ssn_90_180d"):
        f[c] = df[c]
    f["y_anom"] = f["y"] - f["ma27"]
    needed = ["y", "persistence", "ma27", "dose_anom_lag0", "pressure_issue_pa", "expected_dp_pa",
              "ssn_0_27d", "ssn_27_90d"]
    f["valid"] = f[needed].notna().all(axis=1)
    return f


def persistence(frame, tr, te):
    return pd.DataFrame({"p50": frame.loc[te, "persistence"]})


def moving_average(frame, tr, te):
    return pd.DataFrame({"p50": frame.loc[te, "ma27"]})


def ridge(alpha: float):
    def cand(frame, tr, te):
        model = make_pipeline(SimpleImputer(strategy="median"), StandardScaler(), Ridge(alpha=alpha))
        model.fit(frame.loc[tr, FEATURES], frame.loc[tr, "y_anom"])
        return pd.DataFrame({"p50": frame.loc[te, "ma27"] + model.predict(frame.loc[te, FEATURES])})
    return cand


def lgbm(frame, tr, te):
    model = lgb.LGBMRegressor(**LGBM_PARAMS)
    model.fit(frame.loc[tr, FEATURES], frame.loc[tr, "y_anom"])
    return pd.DataFrame({"p50": frame.loc[te, "ma27"] + model.predict(frame.loc[te, FEATURES])})


def candidates() -> dict:
    c = {"persistence": persistence, "ma27": moving_average}
    for a in RIDGE_ALPHAS:
        c[f"ridge_a{a:g}"] = ridge(a)
    c["lgbm"] = lgbm
    return c


def physics_check(df: pd.DataFrame) -> dict:
    """OLS on sols before the cutoff: dose = b0 + b1 * pressure_pa + b2 * ssn_27_90d."""
    d = df[df["before_cutoff"]][[TARGET, "pressure_pa", "ssn_27_90d"]].dropna()
    x = np.column_stack([np.ones(len(d)), d["pressure_pa"], d["ssn_27_90d"]])
    coef, *_ = np.linalg.lstsq(x, d[TARGET].to_numpy(), rcond=None)
    resid = d[TARGET].to_numpy() - x @ coef
    r2 = 1 - resid.var() / d[TARGET].var(ddof=0)
    return {
        "n": int(len(d)),
        "intercept_ugy_day": round(float(coef[0]), 3),
        "slope_ugy_day_per_pa": round(float(coef[1]), 4),
        "slope_ugy_day_per_sunspot": round(float(coef[2]), 4),
        "r2": round(float(r2), 4),
        "corr_dose_pressure": round(float(d[TARGET].corr(d["pressure_pa"])), 4),
        "corr_dose_ssn_27_90d": round(float(d[TARGET].corr(d["ssn_27_90d"])), 4),
        "note": "descriptive (in-sample), not a forecast; pressure and solar activity are partly confounded with season and time",
    }


def main() -> None:
    logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(name)s: %(message)s")
    df = load_frame_source()
    cands = candidates()
    preds = run(df, HORIZONS, dose_frame, cands)
    selected = select_by_cv(preds, list(cands))
    best_model = select_by_cv(preds, [c for c in cands if c.startswith(("ridge", "lgbm"))])
    preds["variable"] = TARGET
    preds["selected"] = [selected[int(lead)] == cand for lead, cand in zip(preds["lead_sols"], preds["candidate"])]
    metrics = summarize_predictions(preds, list(cands), "ma27", "persistence", ref_key="moving_average")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    preds[preds["split"] == "final"].to_parquet(OUT_DIR / "predictions_final.parquet", index=False)
    phys = physics_check(df)
    write_json(OUT_DIR / "metrics.json", {
        "model": MODEL_ID,
        "variable": TARGET,
        "units": "uGy/day (silicon, RTG-corrected)",
        "cutoff_utc": config.CUTOFF_UTC.isoformat(),
        "test_window_utc": [config.TEST_START_UTC.isoformat(), config.TEST_END_UTC.isoformat()],
        "reference": "ma27",
        "reference_definition": "trailing mean of the daily dose over the last 27 sols up to the issue sol (min 10 sols)",
        "selected_by_cv": {str(k): v for k, v in selected.items()},
        "best_ml_model_by_cv": {str(k): v for k, v in best_model.items()},
        "features": FEATURES,
        "lgbm_params": LGBM_PARAMS,
        "ridge_alphas": RIDGE_ALPHAS,
        "physics_check": phys,
        "metrics": metrics,
    })
    for part in ("cv", "final"):
        for cand in ["persistence", "ma27", *sorted(set(best_model.values()))]:
            print(part, cand, {k: (v["mae"], v.get("coverage_p10_p90"), v["n"]) for k, v in metrics[part][cand].items()})
    print("selected:", selected, "best ML:", best_model)
    print("physics:", phys)


if __name__ == "__main__":
    main()
