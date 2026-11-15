"""S2 - Curiosity waypoints (MMGIS GeoJSON). Raw copy cached in data/raw/ml/waypoints/."""
from __future__ import annotations

import json
import logging
from pathlib import Path

from ml import config
from ml.sources._cache import fetch_cached

RAW_PATH = config.RAW_DIR / "waypoints" / "MSL_waypoints.json"


def fetch() -> Path:
    return fetch_cached(config.WAYPOINTS_URL, RAW_PATH)


def load_features() -> list[dict]:
    data = json.loads(fetch().read_text(encoding="utf-8"))
    return data["features"]


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    feats = load_features()
    print(f"Waypoints: {len(feats)}; properties: {sorted(feats[0]['properties'].keys())}")
