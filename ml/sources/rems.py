"""S1 - REMS daily summary (MSL). Raw JSON cached in data/raw/ml/rems/."""
from __future__ import annotations

import json
import logging
from pathlib import Path

from ml import config
from ml.sources._cache import fetch_cached

RAW_PATH = config.RAW_DIR / "rems" / "rems_msl_weather.json"


def fetch() -> Path:
    return fetch_cached(config.REMS_URL, RAW_PATH)


def load_records() -> list[dict]:
    """Return the list of per-sol records exactly as delivered (newest first)."""
    data = json.loads(fetch().read_text(encoding="utf-8"))
    return data["soles"]


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    recs = load_records()
    print(f"REMS records: {len(recs)}; keys: {sorted(recs[0].keys())}")
