"""S3 - MSL RAD level-2 observation CDFs from CDAWeb. Cached in data/raw/ml/rad/.

URL pattern: https://cdaweb.gsfc.nasa.gov/sp_phys/data/msl/rad/cdf/obs-l2/{YYYY}/msl_rad_obs-l2_{YYYY}{DDD}_v{NN}.cdf
When several versions of a day exist, the highest vNN is used. The yearly directory listing is cached too
(delete data/raw/ml/rad/index_{YYYY}.html to refresh it).
"""
from __future__ import annotations

import logging
import re
import sys
from pathlib import Path

from ml import config
from ml.sources._cache import fetch_cached

log = logging.getLogger(__name__)

BASE_URL = "https://cdaweb.gsfc.nasa.gov/sp_phys/data/msl/rad/cdf/obs-l2"
RAW_DIR = config.RAW_DIR / "rad"
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


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    y = int(sys.argv[1]) if len(sys.argv) > 1 else 2025
    files = list_year(y)
    print(f"{y}: {len(files)} days, first {next(iter(files.values()))}, last {list(files.values())[-1]}")
