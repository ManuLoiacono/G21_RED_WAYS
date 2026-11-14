"""S6 - SILSO daily total sunspot number (V2.0). Cached in data/raw/ml/sunspots/.

Format (verified 14/11/2026): `year;month;day;decimal_year;SN;SN_std;n_obs;definitive`, no header.
SN = -1 means missing. Last column: 1 = definitive value, 0 = provisional (SILSO convention).
"""
from __future__ import annotations

import logging
from pathlib import Path

import numpy as np
import pandas as pd

from ml import config
from ml.sources._cache import fetch_cached

SILSO_URL = "https://www.sidc.be/SILSO/DATA/SN_d_tot_V2.0.csv"
RAW_PATH = config.RAW_DIR / "sunspots" / "SN_d_tot_V2.0.csv"


def fetch() -> Path:
    return fetch_cached(SILSO_URL, RAW_PATH)


def load() -> pd.DataFrame:
    df = pd.read_csv(fetch(), sep=";", header=None,
                     names=["year", "month", "day", "decimal_year", "sn", "sn_std", "n_obs", "definitive"])
    df["date_utc"] = pd.to_datetime(df[["year", "month", "day"]], utc=True).dt.as_unit("ns")
    df["sn"] = df["sn"].astype(float).where(df["sn"] >= 0, np.nan)
    return df[["date_utc", "sn", "sn_std", "n_obs", "definitive"]]


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    d = load()
    print(f"SILSO: {len(d)} days, {d['date_utc'].min():%Y-%m-%d} to {d['date_utc'].max():%Y-%m-%d}, "
          f"missing {int(d['sn'].isna().sum())}, provisional {int((d['definitive'] == 0).sum())}, "
          f"first provisional {d.loc[d['definitive'] == 0, 'date_utc'].min():%Y-%m-%d}")
