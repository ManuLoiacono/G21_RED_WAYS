"""ML-03: persistence and Ls-climatology baselines, evaluated with leave-one-Mars-year-out CV and once
on the final window. Output: ml/artifacts/baselines/metrics.json.

- persistence: last observed value at the issue sol (carried forward at most 3 sols).
  p10/p90 from residual quantiles of other folds.
- climatology: mean (p10/p90) of other Mars years within +-5 deg Ls of the target sol.
  Pressure has two variants: raw Pa ("clim_raw") and elevation-adjusted ("clim_elev": climatology of
  pressure_norm_pa converted back to the rover elevation at the issue sol). CV picks the reference.
"""
from __future__ import annotations

import logging
from functools import partial

import pandas as pd

from ml import config
from ml.evaluation.common import load_daily, summarize_predictions, write_json
from ml.models import features
from ml.models.runner import best_overall_by_cv, run

log = logging.getLogger(__name__)
OUT_DIR = config.ARTIFACTS_DIR / "baselines"


def persistence(frame: pd.DataFrame, tr, te) -> pd.DataFrame:
    return pd.DataFrame({"p50": frame.loc[te, "persistence"]})


def climatology(prefix: str):
    def cand(frame: pd.DataFrame, tr, te) -> pd.DataFrame:
        return pd.DataFrame({"p10": frame.loc[te, f"{prefix}_p10"], "p50": frame.loc[te, f"{prefix}_mean"],
                             "p90": frame.loc[te, f"{prefix}_p90"]})
    return cand


PRESSURE_BASELINES = {"persistence": persistence, "clim_raw": climatology("clim_raw"),
                      "clim_elev": climatology("clim_elev")}
TEMPERATURE_BASELINES = {"persistence": persistence, "climatology": climatology("clim")}


def pressure_reference(preds: pd.DataFrame) -> str:
    return best_overall_by_cv(preds, ["clim_raw", "clim_elev"])


def evaluate_all(df: pd.DataFrame) -> dict:
    out = {}
    p = run(df, config.PRESSURE_HORIZONS, features.pressure_frame, PRESSURE_BASELINES)
    ref = pressure_reference(p)
    out["pressure_pa"] = {"climatology_reference": ref,
                          "metrics": summarize_predictions(p, list(PRESSURE_BASELINES), ref, "persistence")}
    for var in features.TEMP_VARS:
        t = run(df, config.TEMPERATURE_HORIZONS, partial(features.temperature_frame, target=var), TEMPERATURE_BASELINES)
        out[var] = {"climatology_reference": "climatology",
                    "metrics": summarize_predictions(t, list(TEMPERATURE_BASELINES), "climatology", "persistence")}
    return out


def main() -> None:
    logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(name)s: %(message)s")
    df = load_daily()
    res = evaluate_all(df)
    write_json(OUT_DIR / "metrics.json", {
        "model": "baselines",
        "cutoff_utc": config.CUTOFF_UTC.isoformat(),
        "test_window_utc": [config.TEST_START_UTC.isoformat(), config.TEST_END_UTC.isoformat()],
        "protocol": "leave-one-Mars-year-out CV on sols before cutoff; final = targets in test window, evaluated once",
        "results": res,
    })
    for var, r in res.items():
        for part in ("cv", "final"):
            for cand, by_lead in r["metrics"][part].items():
                print(var, part, cand, {k: (v["mae"], v["n"]) for k, v in by_lead.items()})


if __name__ == "__main__":
    main()
