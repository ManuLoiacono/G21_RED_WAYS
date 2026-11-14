"""Shared evaluation machinery: climatology by Ls, forecast cases, Mars-year folds and metrics.

Protocol (docs/ML_PREDICCION.md section 7):
- Model selection: leave-one-Mars-year-out CV over sols dated before the cutoff.
  Fold k: training cases have issue and target outside year k; test cases have target in year k.
- Final exam: models trained on every case whose target is before the cutoff, evaluated once on
  targets inside the test window (sols 4699-4739). Inputs at issue time are observations up to the
  issue sol (rolling origin); model parameters and climatology are frozen at the cutoff.
- Climatology for a row = statistics of the pool rows of OTHER Mars years within +-5 deg of Ls.
  The pool contains only sols before the cutoff (and, in CV, outside the held-out year).
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

from ml import config

DAILY_PATH = config.PROCESSED_DIR / "daily_weather.parquet"
SUMMARY_PATH = config.PROCESSED_DIR / "daily_weather_summary.json"

# A forecast needs a recent observation at the issue sol: values are carried forward at most this many sols.
FFILL_LIMIT_SOLS = 3
MIN_CLIM_SAMPLES = 10
N_LAGS = 5


def load_daily() -> pd.DataFrame:
    df = pd.read_parquet(DAILY_PATH).sort_values("sol").reset_index(drop=True)
    if not (np.diff(df["sol"].to_numpy()) == 1).all():
        raise ValueError("daily_weather.parquet must have one row per consecutive sol")
    return df


def elev_ref_m() -> float:
    return float(json.loads(SUMMARY_PATH.read_text(encoding="utf-8"))["elev_ref_m"])


def norm_factor(elev_m: pd.Series | np.ndarray) -> np.ndarray:
    """pressure_norm_pa = pressure_pa * norm_factor(rover_elev_m)."""
    return np.exp((np.asarray(elev_m, dtype=float) - elev_ref_m()) / config.SCALE_HEIGHT_M)


def cv_years(df: pd.DataFrame) -> list[int]:
    pre = df[df["before_cutoff"] & df["has_rems_record"]]
    return sorted(int(y) for y in pre["mars_year"].unique())


# --- Climatology ----------------------------------------------------------------------------------

def climatology(df: pd.DataFrame, col: str, pool_mask: np.ndarray,
                half_window_deg: float = config.CLIMATOLOGY_HALF_WINDOW_LS_DEG) -> pd.DataFrame:
    """Per-row climatology of `col` excluding the row's own Mars year.

    Rows are grouped by (mars_year, 1-degree Ls bin); the window is centred on the bin centre,
    so the effective window is +-5 deg with a 0.5 deg approximation. Returns mean, p10, p50, p90, n.
    """
    v = df[col].to_numpy(dtype=float)
    ls = df["ls_deg"].to_numpy(dtype=float)
    yr = df["mars_year"].to_numpy()
    pm = np.asarray(pool_mask, dtype=bool) & np.isfinite(v)
    pv, pls, pyr = v[pm], ls[pm], yr[pm]

    bins = np.floor(ls).astype(int)
    out = np.full((len(df), 5), np.nan)
    keys = pd.DataFrame({"y": yr, "b": bins}).drop_duplicates().to_numpy()
    for y, b in keys:
        d = np.abs((pls - (b + 0.5) + 180.0) % 360.0 - 180.0)
        vals = pv[(d <= half_window_deg) & (pyr != y)]
        rows = (yr == y) & (bins == b)
        if vals.size >= MIN_CLIM_SAMPLES:
            q10, q50, q90 = np.quantile(vals, config.QUANTILES)
            out[rows] = [vals.mean(), q10, q50, q90, vals.size]
        else:
            out[rows, 4] = vals.size
    return pd.DataFrame(out, columns=["mean", "p10", "p50", "p90", "n"], index=df.index)


class ClimCache:
    """Memoises climatologies for one pool definition."""

    def __init__(self, df: pd.DataFrame, pool_mask: np.ndarray):
        self.df = df
        self.pool_mask = pool_mask
        self._cache: dict[str, pd.DataFrame] = {}

    def get(self, col: str) -> pd.DataFrame:
        if col not in self._cache:
            self._cache[col] = climatology(self.df, col, self.pool_mask)
        return self._cache[col]


# --- Folds ------------------------------------------------------------------------------------------

@dataclass(frozen=True)
class Split:
    name: str            # "cv_my32" or "final"
    held_out_year: int | None

    def pool_mask(self, df: pd.DataFrame) -> np.ndarray:
        m = df["before_cutoff"].to_numpy()
        if self.held_out_year is not None:
            m = m & (df["mars_year"].to_numpy() != self.held_out_year)
        return m

    def train_mask(self, frame: pd.DataFrame) -> np.ndarray:
        m = frame["valid"] & frame["target_before_cutoff"]
        if self.held_out_year is not None:
            m &= (frame["target_year"] != self.held_out_year) & (frame["issue_year"] != self.held_out_year)
        return m.to_numpy()

    def test_mask(self, frame: pd.DataFrame) -> np.ndarray:
        if self.held_out_year is None:
            # Targets in the window are scored; issue sols in the window are also predicted (for export),
            # but only rows with target_in_window enter the final metrics.
            return (frame["valid"] & (frame["target_in_window"] | frame["issue_in_window"])).to_numpy()
        return (frame["valid"] & frame["target_before_cutoff"] & (frame["target_year"] == self.held_out_year)).to_numpy()


def splits(df: pd.DataFrame) -> list[Split]:
    return [Split(f"cv_my{y}", y) for y in cv_years(df)] + [Split("final", None)]


# --- Case frames ---------------------------------------------------------------------------------------

def base_frame(df: pd.DataFrame, horizon: int) -> pd.DataFrame:
    """Issue sol i -> target sol i + horizon, with calendar info (known in advance) of the target."""
    tgt = df.shift(-horizon)
    ls_t = np.radians(tgt["ls_deg"].to_numpy(dtype=float))
    return pd.DataFrame(
        {
            "issue_sol": df["sol"],
            "issue_year": df["mars_year"],
            "target_sol": df["sol"] + horizon,
            "target_year": tgt["mars_year"],
            "target_date_utc": tgt["date_utc"],
            "target_ls_deg": tgt["ls_deg"],
            "target_before_cutoff": tgt["before_cutoff"].fillna(False).astype(bool),
            "target_in_window": tgt["in_test_window"].fillna(False).astype(bool),
            "issue_in_window": df["in_test_window"].astype(bool),
            "sin_ls": np.sin(ls_t),
            "cos_ls": np.cos(ls_t),
            "rover_elev_m": df["rover_elev_m"],
            "lead_sols": horizon,
        },
        index=df.index,
    )


def ffill_obs(series: pd.Series) -> pd.Series:
    return series.ffill(limit=FFILL_LIMIT_SOLS)


def anomaly_lags(series: pd.Series, clim_mean: pd.Series, prefix: str, n_lags: int = N_LAGS) -> pd.DataFrame:
    """Anomaly (value - climatology) at the issue sol and the previous n_lags-1 sols.

    Missing older lags are filled with the most recent available anomaly (lag0).
    """
    anom = ffill_obs(series) - clim_mean
    cols = {f"{prefix}_anom_lag{k}": anom.shift(k) for k in range(n_lags)}
    out = pd.DataFrame(cols, index=series.index)
    for k in range(1, n_lags):
        out[f"{prefix}_anom_lag{k}"] = out[f"{prefix}_anom_lag{k}"].fillna(out[f"{prefix}_anom_lag{k - 1}"])
    return out


# --- Metrics ---------------------------------------------------------------------------------------------

def mae(y: np.ndarray, p: np.ndarray) -> float:
    return float(np.mean(np.abs(np.asarray(y) - np.asarray(p))))


def point_metrics(y, p, p_clim=None, p_pers=None) -> dict:
    y, p = np.asarray(y, float), np.asarray(p, float)
    out = {"n": int(y.size), "mae": round(mae(y, p), 4), "bias": round(float(np.mean(p - y)), 4)}
    if p_clim is not None and y.size:
        m_c = mae(y, p_clim)
        out["mae_climatology"] = round(m_c, 4)
        out["skill_vs_climatology"] = round(1 - out["mae"] / m_c, 4) if m_c > 0 else None
    if p_pers is not None and y.size:
        m_p = mae(y, p_pers)
        out["mae_persistence"] = round(m_p, 4)
        out["skill_vs_persistence"] = round(1 - out["mae"] / m_p, 4) if m_p > 0 else None
    return out


def interval_metrics(y, p10, p90) -> dict:
    y, p10, p90 = (np.asarray(a, float) for a in (y, p10, p90))
    inside = (y >= p10) & (y <= p90)
    return {
        "coverage_p10_p90": round(float(inside.mean()), 4) if y.size else None,
        "mean_width_p10_p90": round(float(np.mean(p90 - p10)), 4) if y.size else None,
        "below_p10": round(float((y < p10).mean()), 4) if y.size else None,
        "above_p90": round(float((y > p90).mean()), 4) if y.size else None,
    }


def residual_quantile_intervals(oof: pd.DataFrame, value_col: str = "p50") -> pd.DataFrame:
    """Add p10/p90 = p50 + quantiles of residuals (y - p50) estimated on OTHER folds' out-of-fold rows.

    For the final split, residual quantiles come from all CV folds (all before the cutoff).
    """
    out = oof.copy()
    cv = out[out["split"] != "final"]
    for split_name in out["split"].unique():
        ref = cv if split_name == "final" else cv[cv["split"] != split_name]
        resid = ref["y"] - ref[value_col]
        q10, q90 = np.quantile(resid, [config.QUANTILES[0], config.QUANTILES[-1]])
        m = out["split"] == split_name
        out.loc[m, "p10"] = out.loc[m, value_col] + q10
        out.loc[m, "p90"] = out.loc[m, value_col] + q90
    return out


def summarize_predictions(preds: pd.DataFrame, candidates: list[str], clim_name: str, pers_name: str) -> dict:
    """preds: long table with columns split, lead_sols, candidate, y, p10, p50, p90 (one row per case).

    Returns {"cv": {cand: {lead: metrics}}, "final": {...}, "cv_per_fold": {...}}.
    """
    preds = preds[(preds["split"] != "final") | preds["target_in_window"]]
    res: dict = {"cv": {}, "final": {}, "cv_per_fold": {}}
    wide = preds.pivot_table(index=["split", "lead_sols", "target_sol"], columns="candidate", values="p50")
    y = preds.drop_duplicates(["split", "lead_sols", "target_sol"]).set_index(["split", "lead_sols", "target_sol"])["y"]
    wide = wide.join(y)
    for cand in candidates:
        sub = preds[preds["candidate"] == cand]
        for part, mask in (("cv", sub["split"] != "final"), ("final", sub["split"] == "final")):
            res[part].setdefault(cand, {})
            for lead, g in sub[mask].groupby("lead_sols"):
                w = wide.loc[g.set_index(["split", "lead_sols", "target_sol"]).index]
                m = point_metrics(g["y"], g["p50"], w[clim_name], w[pers_name])
                if g["p10"].notna().all() and g["p90"].notna().all():
                    m.update(interval_metrics(g["y"], g["p10"], g["p90"]))
                res[part][cand][str(int(lead))] = m
        res["cv_per_fold"][cand] = {
            f"{s}|{int(lead)}": {"n": int(len(g)), "mae": round(mae(g["y"], g["p50"]), 4)}
            for (s, lead), g in sub[sub["split"] != "final"].groupby(["split", "lead_sols"])
        }
    return res


def write_json(path: Path, obj: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, default=str), encoding="utf-8")
