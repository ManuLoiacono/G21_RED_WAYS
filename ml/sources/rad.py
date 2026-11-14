"""S3 - MSL RAD level-2 observation CDFs from CDAWeb. Cached in data/raw/ml/rad/.

URL pattern: https://cdaweb.gsfc.nasa.gov/sp_phys/data/msl/rad/cdf/obs-l2/{YYYY}/msl_rad_obs-l2_{YYYY}{DDD}_v{NN}.cdf
When several versions of a day exist, the highest vNN is used. The yearly directory listing is cached too
(delete data/raw/ml/rad/index_{YYYY}.html to refresh it).

Compact cache (agreed 14/11): for bulk use only the dose time series of each file is kept, as
data/raw/ml/rad/dose/{YYYY}/msl_rad_dose_{YYYY}{DDD}_v{NN}.parquet (epoch, 3 dose columns, alive time,
quality flag, source file and fetch time). The full CDF is deleted after extraction, except for days of
the hindcast window and files that were already on disk.
"""
from __future__ import annotations

import json
import logging
import re
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import cdflib
import numpy as np
import pandas as pd

from ml import config
from ml.sources._cache import fetch_cached, read_meta

log = logging.getLogger(__name__)

BASE_URL = "https://cdaweb.gsfc.nasa.gov/sp_phys/data/msl/rad/cdf/obs-l2"
RAW_DIR = config.RAW_DIR / "rad"
DOSE_DIR = RAW_DIR / "dose"
DOSE_COLUMNS = {"Total Dose B": "dose_b_total_ugy_day", "RTG Corrected Dose B": "dose_b_rtgcorr_ugy_day",
                "Total Dose E": "dose_e_total_ugy_day"}
_FILE_RE = re.compile(r"msl_rad_obs-l2_(\d{4})(\d{3})_v(\d{2})\.cdf")


def list_year(year: int) -> dict[int, str]:
    """{day_of_year: file name with the highest version} for one year."""
    index = fetch_cached(f"{BASE_URL}/{year}/", RAW_DIR / f"index_{year}.html")
    best: dict[int, tuple[int, str]] = {}
    for m in _FILE_RE.finditer(index.read_text(encoding="utf-8", errors="replace")):
        yy, doy, ver = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if yy != year:
            continue
        if doy not in best or ver > best[doy][0]:
            best[doy] = (ver, m.group(0))
    return {doy: name for doy, (ver, name) in sorted(best.items())}


def fetch_file(year: int, file_name: str) -> Path:
    return fetch_cached(f"{BASE_URL}/{year}/{file_name}", RAW_DIR / str(year) / file_name)


def fetch_day(year: int, doy: int) -> Path | None:
    files = list_year(year)
    if doy not in files:
        return None
    return fetch_file(year, files[doy])


def _keep_full_cdf(year: int, doy: int) -> bool:
    start, end = config.TEST_START_UTC, config.TEST_END_UTC
    day = pd.Timestamp(year=year, month=1, day=1, tz="UTC") + pd.Timedelta(days=doy - 1)
    return start.normalize() <= day <= end.normalize()


def extract_dose(cdf_path: Path) -> pd.DataFrame:
    """Observation-level dose series of one RAD CDF. Fill values and values <= 0 become NaN."""
    c = cdflib.CDF(str(cdf_path))
    labels = [str(x) for x in np.asarray(c.varget("DOSIMETRY_OBS_LABEL")).ravel()]
    if labels != list(DOSE_COLUMNS):
        raise ValueError(f"unexpected DOSIMETRY_OBS_LABEL in {cdf_path.name}: {labels}")
    units = str(c.varattsget("DOSIMETRY_TOTAL").get("UNITS"))
    if units != "uGray/day":
        raise ValueError(f"unexpected dose units in {cdf_path.name}: {units}")
    dose = np.asarray(c.varget("DOSIMETRY_TOTAL"), dtype=float).reshape(-1, 3)
    fill = float(c.varattsget("DOSIMETRY_TOTAL")["FILLVAL"])
    dose[(dose == fill) | (dose <= 0)] = np.nan
    alive = np.asarray(c.varget("ALIVE_TIME"), dtype=float)
    alive[alive < 0] = np.nan
    out = pd.DataFrame(dose, columns=list(DOSE_COLUMNS.values()))
    out.insert(0, "epoch_utc", pd.to_datetime(cdflib.cdfepoch.to_datetime(c.varget("EPOCH"))).tz_localize("UTC"))
    out["alive_time_s"] = alive
    out["flag"] = np.asarray(c.varget("FLAGGED_DATA")).astype(str)
    return out


def dose_path(year: int, file_name: str) -> Path:
    return DOSE_DIR / str(year) / file_name.replace("msl_rad_obs-l2_", "msl_rad_dose_").replace(".cdf", ".parquet")


def fetch_dose(year: int, doy: int, file_name: str) -> Path:
    """Cached dose series for one day; downloads the CDF only if the series is not cached yet."""
    out = dose_path(year, file_name)
    if out.exists():
        return out
    cdf_path = RAW_DIR / str(year) / file_name
    existed = cdf_path.exists()
    fetch_file(year, file_name)
    meta = read_meta(cdf_path)
    df = extract_dose(cdf_path)
    df["source_file"] = file_name
    df["fetched_at"] = meta.get("fetched_at")
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_suffix(".part")
    df.to_parquet(tmp, index=False)
    tmp.replace(out)
    if not existed and not _keep_full_cdf(year, doy):
        cdf_path.unlink()
        cdf_path.with_name(cdf_path.name + ".meta.json").unlink(missing_ok=True)
    return out


def fetch_all_dose(years: range, workers: int = 8) -> list[Path]:
    """Dose series of every available day (highest version) in `years`, downloading in parallel."""
    jobs = [(y, doy, name) for y in years for doy, name in list_year(y).items()]
    todo = [j for j in jobs if not dose_path(j[0], j[2]).exists()]
    log.info("RAD dose series: %d days, %d to download", len(jobs), len(todo))
    failures = []
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(fetch_dose, *j): j for j in todo}
        for i, fut in enumerate(as_completed(futures), 1):
            try:
                fut.result()
            except Exception as exc:  # keep going; failures are reported and retried on the next run
                failures.append({"job": futures[fut], "error": repr(exc)})
            if i % 250 == 0:
                log.info("RAD dose series: %d/%d done", i, len(todo))
    if failures:
        (RAW_DIR / "dose_failures.json").write_text(json.dumps(failures, indent=2, default=str), encoding="utf-8")
        log.warning("RAD dose series: %d failures (see dose_failures.json)", len(failures))
    return [dose_path(y, name) for y, _, name in jobs if dose_path(y, name).exists()]


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    y = int(sys.argv[1]) if len(sys.argv) > 1 else 2025
    files = list_year(y)
    print(f"{y}: {len(files)} days, first {next(iter(files.values()))}, last {list(files.values())[-1]}")
