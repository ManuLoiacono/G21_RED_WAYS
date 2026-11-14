"""Calculate draft responses on each invocation; never replay a fixed response."""

import argparse
from copy import deepcopy
import json
from pathlib import Path

from .exchange import plan_draft
from .planning import PreparedPlanner
from .prepared import fixture_registry
from .validation import loads_strict


def example_requests():
    baseline = loads_strict((Path(__file__).parent / "examples" / "request.example.json").read_text(encoding="utf-8"))
    result = {"baseline": baseline}
    for name in ("task_edit", "participant_limit", "exact_daylight", "missing_daylight"):
        value = deepcopy(baseline)
        value.update(request_id=f"synthetic-{name}", revision=1)
        if name == "task_edit":
            value["mission"]["tasks"][0]["duration_s"] += 1
        elif name == "participant_limit":
            value["team"]["robots"][0]["mission_overrides"] = {"max_sortie_s": 2599}
        elif name == "exact_daylight":
            value["mission"]["departure_utc"] = "2025-10-25T12:38:20Z"
        else:
            value["scenario"]["id"] = "synthetic_missing_daylight"
        result[name] = value
    return result


def example(case=None):
    planner = PreparedPlanner(fixture_registry())
    requests = example_requests()
    if case:
        return plan_draft(planner, requests[case])
    return {"input_provenance": "synthetic_fixture", "calculation_origin": "engine",
            "label": "Calculated development cases; no real Mars data or operational safety claim.",
            "cases": [{"id": name, "request": request, "response": plan_draft(planner, request)} for name, request in requests.items()]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--case", choices=tuple(example_requests()))
    args = parser.parse_args()
    print(json.dumps(example(args.case), indent=2, allow_nan=False))


if __name__ == "__main__":
    main()
