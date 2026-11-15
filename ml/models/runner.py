"""Generic CV-by-Mars-year + final-window runner shared by baselines, A1 and A2."""
from __future__ import annotations

import logging
from typing import Callable

import numpy as np
import pandas as pd

from ml.evaluation.common import ClimCache, residual_quantile_intervals, splits

log = logging.getLogger(__name__)

# candidate(frame, train_mask, test_mask) -> DataFrame indexed like frame[test_mask] with p10, p50, p90
Candidate = Callable[[pd.DataFrame, np.ndarray, np.ndarray], pd.DataFrame]
FrameBuilder = Callable[[pd.DataFrame, int, ClimCache], pd.DataFrame]


def run(df: pd.DataFrame, horizons: tuple[int, ...], build_frame: FrameBuilder,
        candidates: dict[str, Candidate], keep_cols: tuple[str, ...] = ()) -> pd.DataFrame:
    """Return a long table: split, lead_sols, issue_sol, target_sol, candidate, y, p10, p50, p90 (+ keep_cols)."""
    rows = []
    for split in splits(df):
        cc = ClimCache(df, split.pool_mask(df))
        for h in horizons:
            frame = build_frame(df, h, cc)
            tr, te = split.train_mask(frame), split.test_mask(frame)
            if te.sum() == 0:
                continue
            meta = frame.loc[te, ["issue_sol", "target_sol", "target_in_window", "y", *keep_cols]].copy()
            meta["split"], meta["lead_sols"] = split.name, h
            for name, cand in candidates.items():
                out = cand(frame, tr, te)
                part = meta.copy()
                part["candidate"] = name
                for q in ("p10", "p50", "p90"):
                    part[q] = out[q].to_numpy() if q in out else np.nan
                rows.append(part)
            log.info("%s h=%d train=%d test=%d", split.name, h, int(tr.sum()), int(te.sum()))
    preds = pd.concat(rows, ignore_index=True)
    return fill_point_intervals(preds)


def fill_point_intervals(preds: pd.DataFrame) -> pd.DataFrame:
    """Candidates that only give p50 get empirical p10/p90 from leave-fold-out residual quantiles."""
    parts = []
    for (cand, lead), g in preds.groupby(["candidate", "lead_sols"], sort=False):
        if g["p10"].isna().all():
            g = residual_quantile_intervals(g)
            g = g.assign(interval_method="residual_quantiles")
        else:
            g = g.assign(interval_method="native")
        parts.append(g)
    return pd.concat(parts, ignore_index=True)


def select_by_cv(preds: pd.DataFrame, candidates: list[str]) -> dict[int, str]:
    """Per lead, the candidate with the lowest pooled out-of-fold MAE (final window not used)."""
    cv = preds[(preds["split"] != "final") & preds["candidate"].isin(candidates)]
    err = (cv["y"] - cv["p50"]).abs().groupby([cv["lead_sols"], cv["candidate"]]).mean()
    return {int(lead): str(g.idxmin()[1]) for lead, g in err.groupby(level=0)}


def best_overall_by_cv(preds: pd.DataFrame, candidates: list[str]) -> str:
    """Candidate with the lowest CV MAE averaged over leads (used to pick a single climatology variant)."""
    cv = preds[(preds["split"] != "final") & preds["candidate"].isin(candidates)]
    err = (cv["y"] - cv["p50"]).abs().groupby([cv["candidate"], cv["lead_sols"]]).mean().groupby(level=0).mean()
    return str(err.idxmin())
