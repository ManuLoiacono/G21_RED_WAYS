"""Prepare a small immutable source inventory from committed exports, without training or downloads."""

import argparse
import hashlib
import json
from pathlib import Path

from service.environment_package import DEFAULT_PACKAGE, FORMAT, POLICY, load_environment_package
from service.validation import identity

ROOT = Path(__file__).resolve().parent.parent


def prepare(output=DEFAULT_PACKAGE):
    import pandas as pd  # Preparation dependency only; never imported by /plan.

    folder = ROOT / "data/processed/ml"
    weather = pd.read_parquet(folder / "daily_weather.parquet")
    rad = pd.read_parquet(folder / "rad_daily.parquet").set_index("sol")
    summary = json.loads((folder / "daily_weather_summary.json").read_text(encoding="utf-8"))
    daily = []
    keys = ("date_utc", "sunrise_lmst", "sunset_lmst", "rover_lon_deg", "rover_lat_deg", "rover_elev_m", "pressure_pa", "min_temp_c", "max_temp_c")
    for _, row in weather[weather.sol.between(4698, 4749)].iterrows():
        record = {"sol": int(row.sol)}
        for key in keys:
            value = row[key]
            record[key] = None if pd.isna(value) else (value.isoformat().replace("+00:00", "Z") if key == "date_utc" else value)
        value = rad.loc[row.sol, "dose_b_rtgcorr_ugy_day"]
        record["dose_b_rtgcorr_ugy_day"] = None if pd.isna(value) else float(value)
        files = rad.loc[row.sol, "source_files"]
        record["rad_source_files"] = [] if pd.isna(files) else files.split(",")
        daily.append(record)
    paths = [folder / name for name in ("daily_weather.parquet", "rad_daily.parquet", "sunspots_daily.parquet", "daily_weather_summary.json", "rad_daily_summary.json")]
    sources = [{"path": p.relative_to(ROOT).as_posix(), "sha256": hashlib.sha256(p.read_bytes()).hexdigest()} for p in paths]
    sources.extend({"path": p.relative_to(ROOT).as_posix(), "sha256": hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted((folder / "forecasts").glob("sol_*.json")))
    selections = {}
    for family, name in (("A1", "A1_pressure"), ("A2", "A2_temperature"), ("B1", "B1_dose")):
        path = ROOT / "ml/artifacts" / name / "metrics.json"
        metrics = json.loads(path.read_text(encoding="utf-8"))
        sources.append({"path": path.relative_to(ROOT).as_posix(), "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
        specs = metrics["results"] if family == "A2" else {metrics["variable"]: metrics}
        for variable, spec in specs.items():
            selections[variable] = {lead: f"{family}_{candidate}_v1" for lead, candidate in spec["selected_by_cv"].items()}
    for name in ("ml/requirements.txt", "ml/datasets/build_rad_daily.py", "ml/models/b1_dose.py", "ml/evaluation/common.py"):
        path = ROOT / name
        sources.append({"path": name, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
    package = {
        "format": FORMAT, "version": "v2", "availability_policy": POLICY,
        "policy_description": "Retrospective assumption: release after all included sol and Earth-day input intervals and frozen training inputs complete. Zero processing/publication lag is assumed, not an archival NASA timestamp. Modern source revisions remain a limitation.",
        "training_cutoff_utc": "2025-10-25T00:00:00Z", "last_training_sol": int(weather[weather.before_cutoff].sol.max()),
        "replay_sols": [4699, 4739], "sources": sources, "source_provenance": summary["sources"],
        "daily_sources": daily,
        "model_selection": selections,
        "applicability_bounds_lonlat": json.loads((ROOT / "data/processed/gale/analytical/manifest.json").read_text(encoding="utf-8"))["bounds_lonlat"],
        "limitations": ["Historical hindcast, not operational or current Mars weather.", "Source rover locations/elevations are forward-filled waypoints, not a validated weather field at the hypothetical base.", "Daily reports are not hourly weather; RAD is silicon detector B RTG-corrected microgray/day, not human effective dose.", "SILSO uses modern revised daily values; original 2025 revisions are not recoverable."],
    }
    package["content_id"] = identity(package)
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(package, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    load_environment_package(output)
    return package


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_PACKAGE)
    args = parser.parse_args()
    result = prepare(args.output)
    print(f"Prepared {len(result['daily_sources'])} daily sources; identity={result['content_id']}")


if __name__ == "__main__":
    main()
