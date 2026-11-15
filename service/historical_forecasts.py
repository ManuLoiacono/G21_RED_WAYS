"""Read-only, allowlisted hindcast importer. No fitting, ML imports or network."""

from datetime import datetime, timedelta, timezone
import hashlib
import re
from pathlib import Path

from .environment_package import POLICY
from .prepared import PreparedRecord
from .solar import SOURCE_LON, sol_instant, source_interval
from .validation import PlanningInputError, integer, loads_strict, number, text, utc

ROOT = Path(__file__).resolve().parent.parent
PROVIDER = "exported-hindcast-provider-v1"
VARIABLES = {
    "pressure_pa": ("pressure_pa", "Pa"),
    "min_temp_c": ("daily_min_temp_c", "degC"),
    "max_temp_c": ("daily_max_temp_c", "degC"),
    "dose_b_rtgcorr_ugy_day": ("dose_b_rtgcorr_ugy_day", "microgray/day"),
}
APPLICABILITY = "Reference-rover context assumed useful for this nearby parcel; not a validated cellwise weather field. No altitude/spatial transformation or movement effect."
RAD_LIMIT = "RAD RTG-corrected silicon detector B background rate; not human effective dose, suit/battery use, exposure integration or a particle-event predictor."


def latest(*instants):
    return max(instants, key=lambda value: utc(value, "availability"))


def next_earth_midnight(date):
    return (utc(date, "date") + timedelta(days=1)).isoformat().replace("+00:00", "Z")


def dependencies(row, *, rad=False):
    if row["rover_lon_deg"] is None:
        return ()  # Unknown timing is excluded, never assigned an invented instant.
    result = [{"source": "REMS daily summary and end-of-sol waypoint", "start_utc": source_interval(row["sol"], row["rover_lon_deg"])[0],
               "end_utc": source_interval(row["sol"], row["rover_lon_deg"])[1]}]
    if rad:
        files = row.get("rad_source_files", [])
        if not files:
            return ()
        daily_intervals = []
        for name in files:
            match = re.fullmatch(r"msl_rad_obs-l2_(\d{7})_v\d{2}\.cdf", name)
            if not match:
                raise PlanningInputError("unknown_rad_file_interval", "daily.rad_source_files", "Cannot establish the RAD daily dependency interval.")
            day = datetime.strptime(match[1], "%Y%j").replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")
            daily_intervals.append({"source": name, "start_utc": day, "end_utc": next_earth_midnight(day)})
        result.extend((
            {"source": "RAD daily aggregate at fixed source longitude", "start_utc": source_interval(row["sol"], SOURCE_LON)[0], "end_utc": source_interval(row["sol"], SOURCE_LON)[1]},
            {"source": "SILSO trailing Earth daily windows, latest included day", "start_utc": row["date_utc"], "end_utc": next_earth_midnight(row["date_utc"])}))
        result.extend(daily_intervals)
    return tuple(result)


def _import_document(doc, package, *, source_identity):
    if doc.get("schema_version") != 0 or doc.get("fixture") is not False or doc.get("mode") != "hindcast":
        raise PlanningInputError("unsupported_forecast_version", "forecast", "Expected real exported hindcast v0.")
    if doc.get("cutoff_utc") != package["training_cutoff_utc"]:
        raise PlanningInputError("training_cutoff_mismatch", "forecast.cutoff_utc", "Frozen training cutoff differs from the prepared package.")
    issue = integer(doc.get("issued_for_sol"), "forecast.issue_sol", minimum=1)
    daily = {r["sol"]: r for r in package["daily_sources"]}
    if issue not in daily or doc.get("issued_for_date_utc") != daily[issue]["date_utc"][:10]:
        raise PlanningInputError("forecast_sol_date_mismatch", "forecast.issue_sol", "Issue sol/date differs from the source inventory.")
    forecasts = doc.get("forecasts")
    if not isinstance(forecasts, list) or len(forecasts) > 32:
        raise PlanningInputError("forecast_inventory_limit", "forecast.forecasts", "Expected a bounded forecast inventory.")
    result, seen = [], set()
    for raw in forecasts:
        variable = raw.get("variable")
        if variable not in VARIABLES:
            raise PlanningInputError("unsupported_forecast_variable", "forecast.variable", "No explicit variable/unit mapping exists.")
        target = integer(raw.get("target_sol"), "forecast.target_sol", minimum=1)
        lead = integer(raw.get("lead_sols"), "forecast.lead_sols", minimum=1)
        key = variable, lead, target
        if key in seen:
            raise PlanningInputError("duplicate_record", "forecast", "Duplicate variable/lead/target forecast.")
        seen.add(key)
        if target != issue + lead or target not in daily or raw.get("target_date_utc") != daily[target]["date_utc"][:10]:
            raise PlanningInputError("forecast_target_mismatch", "forecast.target_sol", "Target sol/date/lead is inconsistent.")
        model = text(raw.get("model_id"), "forecast.model_id")
        if package["model_selection"].get(variable, {}).get(str(lead)) != model:
            raise PlanningInputError("model_selection_mismatch", "forecast.model_id", "Model is not the frozen validation selection.")
        quantiles = {q: None if raw.get(q) is None else number(raw[q], f"forecast.{q}") for q in ("p10", "p50", "p90")}
        ordered = [v for v in quantiles.values() if v is not None]
        if ordered != sorted(ordered):
            raise PlanningInputError("unordered_quantiles", "forecast.quantiles", "Quantiles must be ordered; nulls remain missing.")
        is_rad = variable == "dose_b_rtgcorr_ugy_day"
        intervals = dependencies(daily[issue], rad=is_rad)
        training_intervals = dependencies(daily[package["last_training_sol"]], rad=is_rad)
        model_available = latest(package["training_cutoff_utc"], *(r["end_utc"] for r in training_intervals)) if training_intervals else None
        availability = latest(model_available, *(r["end_utc"] for r in intervals)) if intervals and model_available else None
        provenance = raw.get("provenance")
        if not isinstance(provenance, dict):
            raise PlanningInputError("missing_forecast_provenance", "forecast.provenance", "Source provenance is required.")
        fetched = provenance.get("fetched_at")
        utc(fetched, "forecast.fetched_at")
        # Construct only decision-safe fields. observed, baselines and skill_summary never cross this boundary.
        safe_provenance = {k: text(provenance.get(k), f"forecast.provenance.{k}") for k in ("class", "mission", "instrument", "kind", "origin", "url", "product")}
        safe_provenance.update(source_identity=source_identity, provider_version=PROVIDER,
                               issued_at_basis="Reconstructed after included input intervals complete; not an archival issuance.",
                               source_location={k: daily[issue][k] for k in ("rover_lon_deg", "rover_lat_deg", "rover_elev_m")})
        source_variable, units = VARIABLES[variable]
        result.append(PreparedRecord(
            record_id=f"hindcast:{issue}:{variable}:{lead}:r1", series_id=f"{variable}:lead-{lead}:target-{target}", revision=1,
            kind="forecast", variable=source_variable, value=None, quantiles=quantiles, units=units, evidence_kind="forecast",
            source_id=PROVIDER, source_location_id=f"curiosity-waypoint-as-of-sol-{issue}", spatial_scope="Curiosity reference rover, issue-time elevation; nearby-parcel applicability assumed.",
            fetched_at_utc=fetched, issued_at_utc=latest(*(r["end_utc"] for r in intervals)) if intervals else sol_instant(issue+1),
            valid_from_utc=source_interval(target-1, SOURCE_LON)[1] if is_rad else sol_instant(target, lon_east_deg=daily[issue]["rover_lon_deg"] or SOURCE_LON),
            valid_to_utc=source_interval(target, SOURCE_LON)[1] if is_rad else sol_instant(target+1, lon_east_deg=daily[issue]["rover_lon_deg"] or SOURCE_LON),
            reconstructed_available_at_utc=availability, availability_assumption=f"{POLICY}: {package['policy_description']}",
            model_id=model, model_version="v1", training_cutoff_utc=package["training_cutoff_utc"], model_available_at_utc=model_available,
            issue_sol=issue, target_sol=target, lead_sols=lead, interval_method=text(raw.get("interval_method"), "forecast.interval_method"),
            provenance=safe_provenance, applicability=APPLICABILITY + (" " + RAD_LIMIT if is_rad else ""), input_intervals=(*training_intervals, *intervals)))
    return tuple(result)


def import_document(doc, package, *, source_identity):
    try:
        return _import_document(doc, package, source_identity=source_identity)
    except PlanningInputError:
        raise
    except (KeyError, TypeError, AttributeError, ValueError) as exc:
        raise PlanningInputError("malformed_forecast_package", "forecasts", "Malformed or ambiguous forecast dependencies/provenance.") from exc


def load_forecasts(package, root=ROOT):
    folder = Path(root) / "data/processed/ml/forecasts"
    files = sorted(folder.glob("sol_*.json"))
    inventory = {s["path"]: s["sha256"] for s in package["sources"] if "/forecasts/" in s["path"]}
    if not 1 <= len(files) <= 64 or {p.relative_to(root).as_posix() for p in files} != set(inventory):
        raise PlanningInputError("forecast_inventory_mismatch", "forecasts", "Local forecast inventory differs from the prepared source package.")
    records, issue_sols = [], set()
    for path in files:
        if path.stat().st_size > 65536:
            raise PlanningInputError("forecast_size_limit", "forecasts", "Forecast document exceeds its technical byte bound.")
        raw = path.read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        if digest != inventory[path.relative_to(root).as_posix()]:
            raise PlanningInputError("forecast_identity_mismatch", "forecasts", "Forecast file differs from its prepared content identity.")
        doc = loads_strict(raw)
        if doc.get("issued_for_sol") in issue_sols:
            raise PlanningInputError("duplicate_record", "forecasts", "Duplicate issue-sol document.")
        issue_sols.add(doc.get("issued_for_sol"))
        records.extend(import_document(doc, package, source_identity=digest))
    return tuple(records)


def load_observations(package):
    records = []
    for row in package["daily_sources"]:
        weather_intervals = dependencies(row)
        intervals = dependencies(row, rad=True)
        for variable, (mapped, units) in VARIABLES.items():
            is_rad = variable == "dose_b_rtgcorr_ugy_day"
            selected_intervals = intervals if is_rad else weather_intervals
            availability = latest(*(r["end_utc"] for r in selected_intervals)) if selected_intervals else None
            # RAD daily means are sol-based; SILSO is a forecast dependency only.
            if is_rad and intervals:
                selected_intervals = (*intervals[:2], *intervals[3:])
                availability = latest(*(r["end_utc"] for r in selected_intervals))
            records.append(PreparedRecord(
                record_id=f"historical:{row['sol']}:{variable}", series_id=variable, revision=row["sol"],
                kind="observation", variable=mapped, value=row[variable], units=units, evidence_kind="observed",
                source_id="RAD" if is_rad else "REMS", source_location_id=f"curiosity-waypoint-as-of-sol-{row['sol']}",
                spatial_scope="Historical rover daily summary; not a validated weather field at the base.",
                fetched_at_utc=None if is_rad else package["source_provenance"]["rems"]["fetched_at"],
                observation_start_utc=selected_intervals[0]["start_utc"] if selected_intervals else source_interval(row["sol"])[0],
                observation_end_utc=latest(*(r["end_utc"] for r in selected_intervals)) if selected_intervals else source_interval(row["sol"])[1],
                reconstructed_available_at_utc=availability, availability_assumption=package["policy_description"],
                provenance={"source_location": {k: row[k] for k in ("rover_lon_deg", "rover_lat_deg", "rover_elev_m")},
                            "source_retrieval_state": "Per-observation RAD retrieval timestamp unavailable in the committed aggregate." if is_rad else "Archived REMS source retrieval timestamp.",
                            "source_files": row.get("rad_source_files", []) if is_rad else [],
                            "url": "https://cdaweb.gsfc.nasa.gov/sp_phys/data/msl/rad/cdf/obs-l2" if is_rad else "https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json"},
                applicability=APPLICABILITY + (" " + RAD_LIMIT if is_rad else ""), input_intervals=selected_intervals))
    return tuple(records)
