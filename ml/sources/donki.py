"""S4 - NASA DONKI (CME, SEP, WSAEnlilSimulations; FLR currently unavailable) in 60-day chunks. Cached in data/raw/ml/donki/.

The API key is read from the NASA_API_KEY environment variable; it is passed as a secret parameter and
never written to files or logs (metadata stores the key-free URL and the date parameters only).
"""
from __future__ import annotations

import json
import logging
import os
from datetime import date, timedelta
from pathlib import Path

from ml import config
from ml.sources._cache import fetch_cached

log = logging.getLogger(__name__)
BASE_URL = "https://api.nasa.gov/DONKI"
# FLR answered HTTP 404 for every range on 14/11/2026 (also 2014); left out until it works again.
TYPES = ("CME", "SEP", "WSAEnlilSimulations")
UNAVAILABLE_TYPES = ("FLR",)
RAW_DIR = config.RAW_DIR / "donki"
CHUNK_DAYS = 60  # the API rejects longer ranges (HTTP 400)
START = date(2013, 1, 1)
END = date(2025, 12, 31)


def _key() -> str:
    key = os.environ.get("NASA_API_KEY")
    if not key:
        raise RuntimeError("NASA_API_KEY is not set; define it as an environment variable (never in the repo)")
    return key


def chunks(start: date = START, end: date = END):
    cur = start
    while cur <= end:
        stop = min(cur + timedelta(days=CHUNK_DAYS - 1), end)
        yield cur, stop
        cur = stop + timedelta(days=1)


def fetch_chunk(kind: str, start: date, end: date) -> Path:
    dest = RAW_DIR / kind / f"{kind}_{start:%Y%m%d}_{end:%Y%m%d}.json"
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    return fetch_cached(f"{BASE_URL}/{kind}", dest,
                        params={"startDate": f"{start:%Y-%m-%d}", "endDate": f"{end:%Y-%m-%d}"},
                        secret_params={"api_key": _key()})


def load(kind: str) -> list[dict]:
    """All records of one DONKI type over START..END (empty responses are stored as empty files)."""
    out = []
    for a, b in chunks():
        text = fetch_chunk(kind, a, b).read_text(encoding="utf-8").strip()
        if text:
            out.extend(json.loads(text))
    return out


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    for k in TYPES:
        print(k, len(load(k)))
