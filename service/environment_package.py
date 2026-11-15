"""Bounded, offline environmental source package; no ML imports in the runtime."""

from pathlib import Path

from .validation import PlanningInputError, identity, integer, loads_strict, number, utc

FORMAT = "gale-environment-sources-1"
POLICY = "completed-inputs-retrospective-v1"
DEFAULT_PACKAGE = Path(__file__).resolve().parent.parent / "data/processed/gale/environment/sources.json"
MAX_BYTES = 1_500_000


def _load_environment_package(path=DEFAULT_PACKAGE):
    path = Path(path)
    if not path.is_file():
        raise PlanningInputError("missing_environment_package", "environment", "Prepare the local package with python -m scripts.prepare_environment.")
    if path.stat().st_size > MAX_BYTES:
        raise PlanningInputError("environment_size_limit", "environment", "Environmental package exceeds the byte envelope.")
    data = loads_strict(path.read_text(encoding="utf-8"))
    digest = data.pop("content_id", None)
    if identity(data) != digest:
        raise PlanningInputError("environment_identity_mismatch", "environment.content_id", "Environmental content identity does not match.")
    if data.get("format") != FORMAT or data.get("version") != "v2" or data.get("availability_policy") != POLICY:
        raise PlanningInputError("unsupported_environment_version", "environment", "Unsupported environmental package or reconstruction policy.")
    rows = data.get("daily_sources")
    if not isinstance(rows, list) or not 41 <= len(rows) <= 100:
        raise PlanningInputError("environment_inventory_limit", "environment.daily_sources", "Expected a bounded daily-source inventory.")
    seen = set()
    for row in rows:
        sol = integer(row["sol"], "daily.sol", minimum=1)
        if sol in seen:
            raise PlanningInputError("duplicate_record", "daily.sol", "Duplicate daily source sol.")
        seen.add(sol)
        utc(row["date_utc"], "daily.date_utc")
        for key in ("rover_lon_deg", "rover_lat_deg", "rover_elev_m", "pressure_pa", "min_temp_c", "max_temp_c", "dose_b_rtgcorr_ugy_day"):
            if row[key] is not None:
                number(row[key], f"daily.{key}")
    utc(data["training_cutoff_utc"], "environment.training_cutoff_utc")
    for source in data["sources"]:
        if len(source["sha256"]) != 64:
            raise PlanningInputError("invalid_source_identity", "environment.sources", "Source SHA-256 identity is required.")
    data["content_id"] = digest
    return data


def load_environment_package(path=DEFAULT_PACKAGE):
    try:
        return _load_environment_package(path)
    except PlanningInputError:
        raise
    except (KeyError, TypeError, AttributeError, ValueError) as exc:
        raise PlanningInputError("malformed_environment_package", "environment", "Malformed environmental fields or dependencies.") from exc


def source_metadata(data):
    """Discovery exposes identities and policies, never raw future daily values."""
    return {key: data[key] for key in ("format", "version", "content_id", "availability_policy", "policy_description", "sources", "replay_sols", "training_cutoff_utc", "last_training_sol", "limitations", "applicability_bounds_lonlat")}
