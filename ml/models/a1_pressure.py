"""ML-04: A1 daily pressure (pressure_pa) at leads 1, 3, 5, 10 sols.

Candidates (all predict the anomaly w.r.t. the Ls climatology of the target sol, then add it back):
- ridge_{raw|norm}_a{alpha}: StandardScaler + Ridge on anomaly lags, climatological drift, sin/cos Ls, elevation.
- lgbm_{raw|norm}: LightGBM (L1 loss) on the same features.
"raw" works in Pa; "norm" works on elevation-normalised pressure and converts back with the issue elevation.
Point candidates get p10/p90 from leave-fold-out residual quantiles.
Selection: per lead, lowest pooled CV MAE among baselines and models (the final window is never used).
"""
from __future__ import annotations

import logging

import lightgbm as lgb
import pandas as pd
from sklearn.linear_model import Ridge
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from ml import config
from ml.evaluation import baselines
from ml.evaluation.common import load_daily, summarize_predictions, write_json
from ml.models import features
from ml.models.runner import run, select_by_cv

log = logging.getLogger(__name__)
MODEL_ID = "A1_pressure"
OUT_DIR = config.ARTIFACTS_DIR / MODEL_ID
RIDGE_ALPHAS = (0.1, 1.0, 10.0, 100.0)
LGBM_PARAMS = dict(objective="l1", n_estimators=400, learning_rate=0.03, num_leaves=15, min_child_samples=40,
                   subsample=0.8, subsample_freq=1, colsample_bytree=0.8, random_state=config.RANDOM_SEED,
                   n_jobs=1, deterministic=True, force_row_wise=True, verbose=-1)


def _to_pa(frame: pd.DataFrame, te, space: str, anom_hat) -> pd.Series:
    p = frame.loc[te, f"p{space}_clim_target"] + anom_hat
    return p * frame.loc[te, "norm_to_pa"] if space == "norm" else p


def ridge(space: str, alpha: float):
    cols = features.pressure_feature_cols(space)

    def cand(frame, tr, te):
        model = make_pipeline(StandardScaler(), Ridge(alpha=alpha))
        model.fit(frame.loc[tr, cols], frame.loc[tr, f"p{space}_y_anom"])
        return pd.DataFrame({"p50": _to_pa(frame, te, space, model.predict(frame.loc[te, cols]))})
    return cand


def lgbm(space: str):
    cols = features.pressure_feature_cols(space)

    def cand(frame, tr, te):
        model = lgb.LGBMRegressor(**LGBM_PARAMS)
        model.fit(frame.loc[tr, cols], frame.loc[tr, f"p{space}_y_anom"])
        return pd.DataFrame({"p50": _to_pa(frame, te, space, model.predict(frame.loc[te, cols]))})
    return cand


def candidates() -> dict:
    c = dict(baselines.PRESSURE_BASELINES)
    for space in features.PRESSURE_SPACES:
        for a in RIDGE_ALPHAS:
            c[f"ridge_{space}_a{a:g}"] = ridge(space, a)
        c[f"lgbm_{space}"] = lgbm(space)
    return c


def main() -> None:
    logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(name)s: %(message)s")
    df = load_daily()
    cands = candidates()
    preds = run(df, config.PRESSURE_HORIZONS, features.pressure_frame, cands)
    ref = baselines.pressure_reference(preds)
    selected = select_by_cv(preds, list(cands))
    models_only = [c for c in cands if c.startswith(("ridge", "lgbm"))]
    best_model = select_by_cv(preds, models_only)

    preds["selected"] = [selected[int(lead)] == cand for lead, cand in zip(preds["lead_sols"], preds["candidate"])]
    final = preds[preds["split"] == "final"]
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    final.to_parquet(OUT_DIR / "predictions_final.parquet", index=False)

    metrics = summarize_predictions(preds, list(cands), ref, "persistence")
    write_json(OUT_DIR / "metrics.json", {
        "model": MODEL_ID,
        "variable": "pressure_pa",
        "cutoff_utc": config.CUTOFF_UTC.isoformat(),
        "test_window_utc": [config.TEST_START_UTC.isoformat(), config.TEST_END_UTC.isoformat()],
        "climatology_reference": ref,
        "selected_by_cv": {str(k): v for k, v in selected.items()},
        "best_ml_model_by_cv": {str(k): v for k, v in best_model.items()},
        "lgbm_params": LGBM_PARAMS,
        "ridge_alphas": RIDGE_ALPHAS,
        "scale_height_m": config.SCALE_HEIGHT_M,
        "metrics": metrics,
    })
    show = ["persistence", ref, *sorted(set(best_model.values()))]
    for part in ("cv", "final"):
        for cand in show:
            print(part, cand, {k: (v["mae"], v.get("coverage_p10_p90"), v["n"]) for k, v in metrics[part][cand].items()})
    print("selected:", selected, "best ML:", best_model)


if __name__ == "__main__":
    main()
