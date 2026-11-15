"""Shared paths, dates and constants for the ML pipeline (see docs/ML_PREDICCION.md)."""
from __future__ import annotations

from pathlib import Path

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parent.parent
ML_DIR = REPO_ROOT / "ml"
RAW_DIR = REPO_ROOT / "data" / "raw" / "ml"
PROCESSED_DIR = REPO_ROOT / "data" / "processed" / "ml"
FORECASTS_DIR = PROCESSED_DIR / "forecasts"
ARTIFACTS_DIR = ML_DIR / "artifacts"
CONTRACTS_DIR = REPO_ROOT / "contracts"
DOCS_DIR = REPO_ROOT / "docs"

# --- Sources -----------------------------------------------------------------
REMS_URL = "https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json"
WAYPOINTS_URL = "https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json"

# --- Hindcast dates (UTC) ----------------------------------------------------
# Models are trained only with data strictly before CUTOFF_UTC.
# The final test window is evaluated once per model and never used for selection.
CUTOFF_UTC = pd.Timestamp("2025-10-25T00:00:00Z")
TEST_START_UTC = pd.Timestamp("2025-10-25T00:00:00Z")
TEST_END_UTC = pd.Timestamp("2025-12-05T23:59:59Z")  # inclusive day

# --- Gale constants ----------------------------------------------------------
GALE_LAT_DEG = -4.59
# Approximate atmospheric scale height used for the altitude correction of pressure.
# Assumed value (docs/ML_PREDICCION.md section 5); documented as "supuesto".
SCALE_HEIGHT_M = 11_000.0

# --- Modelling ---------------------------------------------------------------
CLIMATOLOGY_HALF_WINDOW_LS_DEG = 5.0
PRESSURE_HORIZONS = (1, 3, 5, 10)
TEMPERATURE_HORIZONS = (1, 3, 5)
QUANTILES = (0.1, 0.5, 0.9)
RANDOM_SEED = 42
