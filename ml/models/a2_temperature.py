"""ML-05: A2 daily min_temp_c and max_temp_c with a p10-p50-p90 range, leads 1, 3, 5 sols.

Candidates (predict the anomaly w.r.t. the Ls climatology of the target sol, then add it back):
- lgbm_q: three LightGBM models with quantile loss (alpha 0.1, 0.5, 0.9); quantiles sorted to avoid crossing.
- ridge_a{alpha}: median imputation (fit on train) + StandardScaler + Ridge (p50), p10/p90 from leave-fold-out residual quantiles.
Baselines: persistence and climatology (with its historical p10-p90).
Selection: per variable and lead, lowest pooled CV MAE of p50 (the final window is never used).
"""
from __future__ import annotations

import logging
from functools import partial

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.impute import SimpleImputer
from sklearn.linear_model import Ridge
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from ml import config
from ml.evaluation import baselines
from ml.evaluation.common import load_daily, summarize_predictions, write_json
from ml.models import features
from ml.models.runner import run, select_by_cv

log = logging.getLogger(__name__)
MODEL_ID = "A2_temperature"
OUT_DIR = config.ARTIFACTS_DIR / MODEL_ID
RIDGE_ALPHAS = (1.0, 10.0, 100.0)
LGBM_PARAMS = dict(objective="quantile", n_estimators=400, learning_rate=0.03, num_leaves=15, min_child_samples=40,
                   subsample=0.8, subsample_freq=1, colsample_bytree=0.8, random_state=config.RANDOM_SEED,
                   n_jobs=1, deterministic=True, force_row_wise=True, verbose=-1)
COLS = features.temperature_feature_cols()


def lgbm_quantiles(frame, tr, te):
    preds = []
    for q in config.QUANTILES:
        model = lgb.LGBMRegressor(alpha=q, **LGBM_PARAMS)
        model.fit(frame.loc[tr, COLS], frame.loc[tr, "y_anom"])
        preds.append(model.predict(frame.loc[te, COLS]))
    qs = np.sort(np.vstack(preds), axis=0) + frame.loc[te, "clim_mean"].to_numpy()
    return pd.DataFrame({"p10": qs[0], "p50": qs[1], "p90": qs[2]}, index=frame.index[te])


def ridge(alpha: float):
    def cand(frame, tr, te):
        model = make_pipeline(SimpleImputer(strategy="median"), StandardScaler(), Ridge(alpha=alpha))
        model.fit(frame.loc[tr, COLS], frame.loc[tr, "y_anom"])
        return pd.DataFrame({"p50": frame.loc[te, "clim_mean"] + model.predict(frame.loc[te, COLS])})
    return cand


def candidates() -> dict:
    c = dict(baselines.TEMPERATURE_BASELINES)
    for a in RIDGE_ALPHAS:
        c[f"ridge_a{a:g}"] = ridge(a)
    c["lgbm_q"] = lgbm_quantiles
    return c


def run_variable(df: pd.DataFrame, var: str) -> tuple[pd.DataFrame, dict]:
    cands = candidates()
    preds = run(df, config.TEMPERATURE_HORIZONS, partial(features.temperature_frame, target=var), cands)
    selected = select_by_cv(preds, list(cands))
    best_model = select_by_cv(preds, [c for c in cands if c.startswith(("ridge", "lgbm"))])
    preds["variable"] = var
    preds["selected"] = [selected[int(lead)] == cand for lead, cand in zip(preds["lead_sols"], preds["candidate"])]
    metrics = summarize_predictions(preds, list(cands), "climatology", "persistence")
    return preds, {
        "selected_by_cv": {str(k): v for k, v in selected.items()},
        "best_ml_model_by_cv": {str(k): v for k, v in best_model.items()},
        "metrics": metrics,
    }


def main() -> None:
    logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(name)s: %(message)s")
    df = load_daily()
    out, finals = {}, []
    for var in features.TEMP_VARS:
        preds, res = run_variable(df, var)
        finals.append(preds[preds["split"] == "final"])
        out[var] = res
        m = res["metrics"]
        show = ["persistence", "climatology", *sorted(set(res["best_ml_model_by_cv"].values()))]
        for part in ("cv", "final"):
            for cand in show:
                print(var, part, cand, {k: (v["mae"], v.get("coverage_p10_p90"), v["n"]) for k, v in m[part][cand].items()})
        print(var, "selected:", res["selected_by_cv"])
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    pd.concat(finals, ignore_index=True).to_parquet(OUT_DIR / "predictions_final.parquet", index=False)
    write_json(OUT_DIR / "metrics.json", {
        "model": MODEL_ID,
        "variables": list(features.TEMP_VARS),
        "cutoff_utc": config.CUTOFF_UTC.isoformat(),
        "test_window_utc": [config.TEST_START_UTC.isoformat(), config.TEST_END_UTC.isoformat()],
        "climatology_reference": "climatology",
        "lgbm_params": LGBM_PARAMS,
        "ridge_alphas": RIDGE_ALPHAS,
        "features": COLS,
        "results": out,
    })


if __name__ == "__main__":
    main()
