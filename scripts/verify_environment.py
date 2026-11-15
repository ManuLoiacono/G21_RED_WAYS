"""Verify real deterministic acceptance cases, emit requests and compact scientific evidence."""

from copy import deepcopy
import json
from pathlib import Path
import sys
from time import perf_counter

from service.environment_package import load_environment_package
from service.exchange import plan_draft
from service.gale import gale_registry
from service.planning import PreparedPlanner
from service.solar import daylight_interval, iso, sol_instant, sol_lmst

ROOT = Path(__file__).resolve().parent.parent


def main():
    planner = PreparedPlanner(gale_registry(ROOT / "data/processed/gale/analytical/manifest.json"))
    baseline = json.loads((ROOT / "service/examples/gale-replay.request.json").read_text(encoding="utf-8"))
    start = perf_counter()
    valid = plan_draft(planner, baseline)
    latency = perf_counter()-start
    metrics = valid["alternatives"][0]["metrics"]
    total = metrics["reserved_total_s"]
    sunset = valid["environment"]["daylight"]["end_s"]
    cases = {"gale-replay": (baseline, "viable_model")}
    late = deepcopy(baseline); late["mission"]["departure_utc"] = "2025-10-26T12:30:00Z"
    cases["gale-replay-late"] = late, "incompatible"
    missing = deepcopy(baseline); missing["scenario"]["id"] = "gale_historical_missing_daylight"
    cases["gale-replay-missing"] = missing, "insufficient_evidence"
    early = deepcopy(baseline)
    early["scenario"]["as_of_utc"] = early["mission"]["departure_utc"] = "2025-10-25T03:26:03Z"
    cases["gale-replay-early"] = early, "viable_model"
    boundary = deepcopy(baseline); boundary["mission"]["departure_utc"] = iso(sunset-total)
    cases["gale-replay-boundary"] = boundary, "viable_model"
    evidence = {}
    for name, (request, expected) in cases.items():
        result = valid if name == "gale-replay" else plan_draft(planner, request)
        assert result["assessment"] == expected, (name, result["assessment"])
        if name != "gale-replay":
            assert result["movement_reuse"] == {"graph": True, "base_search": True}
        if name == "gale-replay-early":
            assert len(result["environment"]["missing_forecast_variables"]) == 4
        (ROOT / f"service/examples/{name}.request.json").write_text(json.dumps(request, indent=2)+"\n", encoding="utf-8")
        evidence[name] = {"assessment": result["assessment"], "metrics": result["alternatives"][0]["metrics"],
                          "missing_forecasts": result["environment"]["missing_forecast_variables"], "movement_reuse": result["movement_reuse"]}
    plus_one = deepcopy(boundary); plus_one["mission"]["tasks"][0]["duration_s"] += 1
    changed = plan_draft(planner, plus_one)
    assert changed["assessment"] == "incompatible"
    assert abs(changed["alternatives"][0]["metrics"]["elapsed_s"] - metrics["elapsed_s"] - 1) < 1e-6
    references = []
    for row in load_environment_package()["daily_sources"]:
        if row["sol"] not in (4699, 4719, 4739):
            continue
        lon, lat = row["rover_lon_deg"], row["rover_lat_deg"]
        _, times = daylight_interval(sol_instant(row["sol"], 9, lon), lon, lat)
        computed = [sol_lmst(iso(t), lon)[1]*60 for t in times]
        reference = [sum(int(v)*m for v, m in zip(row[key].split(":"), (60, 1))) for key in ("sunrise_lmst", "sunset_lmst")]
        references.append({"sol": row["sol"], "reference_location": [lon, lat], "rems_lmst_minutes": reference,
                           "derived_lmst_minutes": computed, "absolute_error_lmst_minutes": [abs(a-b) for a, b in zip(reference, computed)],
                           "limitation": "Rounded report at rover location, independent reference only; not exact base sunlight."})
    assert not any(name in sys.modules for name in ("pandas", "lightgbm", "marstime"))
    output = {"cases": evidence, "boundary_plus_one_task_s": changed["assessment"], "first_calculation_latency_s": latency,
              "environment": valid["environment"], "solar_references": references,
              "runtime_imports": "No pandas, LightGBM or marstime; no training or network in planning."}
    (ROOT / "docs/evidence/gale-environment-acceptance.json").write_text(json.dumps(output, indent=2)+"\n", encoding="utf-8")
    print("5 real acceptance cases passed; exact boundary +1 s failed as required; graph/base searches reused; 3 separated solar references checked.")


if __name__ == "__main__":
    main()
