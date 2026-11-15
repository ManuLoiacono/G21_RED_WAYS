"""S5 - MAVEN SEP total ion flux (sensor 1, forward look) via CDAWeb HAPI, aggregated per hour.

Dataset MVN_SEP_L2_S1-CAL-SVY-FULL, parameter f_ion_flux_tot (HAPI description: total integrated ion flux,
#/cm^2/sec/ster; no `units` field in the HAPI info). Coverage 2014-09-22 to 2025-12-06. No lower-cadence product
exists in the HAPI catalog (checked 14/11/2026), so each day (~43 200 samples at 2 s) is downloaded once,
reduced to hourly median / max / count and cached as
data/raw/ml/maven_sep/hourly/{YYYY}/mvn_sep_s1_ion_{YYYYMMDD}.parquet. The raw CSV is not kept.
Only days around DONKI-predicted Mars arrivals are fetched (docs/ML_PREDICCION.md, risk "MAVEN pesa demasiado").
Note: MAVEN orbits Mars (~4.5 h); the flux depends on the spacecraft position, so hourly values are modulated.
"""
from __future__ import annotations

import io
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
import requests

from ml import config
from ml.sources import _cache  # noqa: F401  (installs the OS trust store)
from ml.sources._cache import USER_AGENT

log = logging.getLogger(__name__)
HAPI_URL = "https://cdaweb.gsfc.nasa.gov/hapi/data"
DATASET = "MVN_SEP_L2_S1-CAL-SVY-FULL"
PARAMETER = "f_ion_flux_tot"
COVERAGE = (date(2014, 9, 23), date(2025, 12, 5))
HOURLY_DIR = config.RAW_DIR / "maven_sep" / "hourly"


def day_path(day: date) -> Path:
    return HOURLY_DIR / f"{day:%Y}" / f"mvn_sep_s1_ion_{day:%Y%m%d}.parquet"


def fetch_day(day: date) -> Path:
    out = day_path(day)
    if out.exists():
        return out
    params = {"id": DATASET, "parameters": PARAMETER, "format": "csv",
              "time.min": f"{day:%Y-%m-%d}T00:00:00Z", "time.max": f"{day + timedelta(days=1):%Y-%m-%d}T00:00:00Z"}
    resp = requests.get(HAPI_URL, params=params, timeout=180, headers={"User-Agent": USER_AGENT})
    if resp.status_code == 404 or not resp.text.strip():  # HAPI: no data for that interval
        raw = pd.DataFrame({"t": pd.Series(dtype="datetime64[ns, UTC]"), "flux": pd.Series(dtype=float)})
    else:
        resp.raise_for_status()
        raw = pd.read_csv(io.StringIO(resp.text), header=None, names=["t", "flux"])
        # Fill timestamps (e.g. 9999-12-31) become NaT and are dropped.
        raw["t"] = pd.to_datetime(raw["t"], utc=True, errors="coerce", format="ISO8601")
        raw = raw.dropna(subset=["t"])
        raw = raw[(raw["t"] >= pd.Timestamp(day, tz="UTC")) & (raw["t"] < pd.Timestamp(day + timedelta(days=1), tz="UTC"))]
    raw["flux"] = raw["flux"].where(raw["flux"] >= 0, np.nan)
    hourly = raw.groupby(raw["t"].dt.floor("h"))["flux"].agg(["median", "max", "count"])
    hourly.columns = ["ion_flux_median", "ion_flux_max", "n_samples"]
    hourly.index.name = "hour_utc"
    hourly = hourly.reset_index()
    hourly["fetched_at"] = pd.Timestamp.now(tz="UTC").strftime("%Y-%m-%dT%H:%M:%SZ")
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_suffix(".part")
    hourly.to_parquet(tmp, index=False)
    tmp.replace(out)
    return out


def fetch_days(days: list[date], workers: int = 6) -> list[Path]:
    days = sorted({d for d in days if COVERAGE[0] <= d <= COVERAGE[1]})
    todo = [d for d in days if not day_path(d).exists()]
    log.info("MAVEN SEP: %d days, %d to download", len(days), len(todo))
    failed = []
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futs = {pool.submit(fetch_day, d): d for d in todo}
        for i, f in enumerate(as_completed(futs), 1):
            try:
                f.result()
            except Exception as exc:
                failed.append((futs[f], repr(exc)))
            if i % 200 == 0:
                log.info("MAVEN SEP: %d/%d done", i, len(todo))
    if failed:
        log.warning("MAVEN SEP: %d days failed (retried on next run): %s", len(failed), failed[:3])
    return [day_path(d) for d in days if day_path(d).exists()]


def load_hourly(days: list[date]) -> pd.DataFrame:
    paths = [day_path(d) for d in sorted(set(days)) if day_path(d).exists()]
    if not paths:
        return pd.DataFrame(columns=["hour_utc", "ion_flux_median", "ion_flux_max", "n_samples"])
    return pd.concat([pd.read_parquet(p) for p in paths], ignore_index=True).sort_values("hour_utc")
