"""Three bounded counterfactuals, evaluated with unchanged requirements/cutoff."""

from copy import deepcopy
from datetime import timedelta
import math

from engine import CATALOG, resolve_team
from engine.team import resolve_comparison
from engine.catalog import SelectionError
from .exchange import decode_request, plan_draft
from .planning import PlannerBusyError
from .validation import PlanningInputError, canonical, utc

CAP = 3


def allocate(team, total):
    """Explicit deterministic allocation; reject insufficient capacity."""
    for group in ("humans", "robots"):
        for member in team[group]:
            member["payload_kg"] = 0
    effective = resolve_team(CATALOG, team)
    capacity = {m.identity.profile_id: m.parameters.carrying_limit_kg for m in effective}
    remaining = total
    for member in sorted((*team["humans"], *team["robots"]), key=lambda m: m["profile_id"]):
        load = min(remaining, capacity[member["profile_id"]])
        member["payload_kg"] = load
        remaining -= load
    return remaining <= 1e-9


def recommendations(planner, payload):
    decode_request(payload)
    if not planner._lock.acquire(blocking=False):
        raise PlannerBusyError("A calculation is already active on this planner instance.")
    try:
        return _evaluate(planner, payload)
    finally:
        planner._lock.release()


def _evaluate(planner, payload):
    baseline_request = deepcopy(payload)
    baseline_request["criterion"] = "fastest"
    baseline_request.setdefault("options", {})["visibility"] = True
    baseline = plan_draft(planner, baseline_request, internal=True)
    original = resolve_team(CATALOG, payload["team"])
    total = math.fsum(member.payload_kg for member in original)
    proposals = []
    # Earliest supported daylight after the unchanged information cutoff.
    daylight = baseline["environment"]["daylight"]
    if daylight is not None:
        clock = baseline["environment"]["clock_mapping"]
        rise = utc(clock["utc_epoch"], "clock") + timedelta(seconds=math.ceil(daylight["start_s"] - clock["offset_at_epoch_s"]))
        departure = max(rise, utc(payload["scenario"]["as_of_utc"], "cutoff"), utc(clock["valid_from_utc"], "coverage"))
        text = departure.isoformat().replace("+00:00", "Z")
        if departure != utc(payload["mission"]["departure_utc"], "departure") and departure < utc(clock["valid_to_utc"], "coverage"):
            candidate = deepcopy(baseline_request)
            candidate["mission"]["departure_utc"] = text
            proposals.append(("earliest_supported_daylight", candidate))
    # Remove a co-travelling robot or an additional human, retaining all payload.
    team = deepcopy(payload["team"])
    if team["robots"]:
        team["robots"].pop()
    elif len(team["humans"]) > 1:
        team["humans"].pop()
    if team != payload["team"] and allocate(team, total):
        candidate = deepcopy(baseline_request); candidate["team"] = team
        proposals.append(("reallocate_without_last_member", candidate))
    # Fixed catalog identities; no demographic inference. Existing selected
    # members retain their explicit overrides when included in a proposal.
    selected = {m["profile_id"]: m for m in (*payload["team"]["humans"], *payload["team"]["robots"])}
    ranked = sorted((entry for entry in CATALOG.entries if entry.kind == "human"),
                    key=lambda e: (-e.defaults.flat_speed_m_s, e.identity.profile_id))
    for entry in ranked:
        team = {"catalog_version": CATALOG.version, "humans": [deepcopy(selected.get(entry.identity.profile_id,
                    {"profile_id": entry.identity.profile_id, "payload_kg": 0}))], "robots": []}
        if allocate(team, total) and team != payload["team"]:
            candidate = deepcopy(baseline_request); candidate["team"] = team
            proposals.append(("catalog_pace_comparison", candidate))
            break
    unique, seen = [], set()
    for name, candidate in proposals:
        key = canonical({"team": candidate["team"], "departure": candidate["mission"]["departure_utc"]})
        if key not in seen:
            unique.append((name, candidate)); seen.add(key)
    evaluated, rejected = [], []
    before = baseline["alternatives"][0]
    for index, (name, candidate) in enumerate(unique[:CAP]):
        candidate["request_id"] = f'{payload["request_id"]}:proposal:{index + 1}'
        resolve_comparison(CATALOG, original, candidate["team"])
        try:
            result = plan_draft(planner, candidate, internal=True)
        except (PlanningInputError, SelectionError) as exc:
            rejected.append({"id": name, "reason": exc.code}); continue
        after = result["alternatives"][0]
        delta = {}
        for key in ("elapsed_s", "reserved_total_s", "mission_margin_s", "temporal_budget_limiting_margin_s", "daylight_reserved_return_margin_s"):
            a, b = before["metrics"][key], after["metrics"][key]
            delta[key] = b - a if a is not None and b is not None else None
        for key in ("visible_s", "occluded_s", "unknown_s", "max_without_confirmed_s"):
            a, b = before["communication"].get(key), after["communication"].get(key)
            delta[key] = b - a if a is not None and b is not None else None
        def ascent(alt):
            legs = (alt["outbound"], alt["return"])
            return math.fsum(leg["ascent_m"] for leg in legs) if all(leg["ascent_m"] is not None for leg in legs) else None
        a, b = ascent(before), ascent(after)
        delta["ascent_m"] = b - a if a is not None and b is not None else None
        improvement = any(delta[key] is not None and delta[key] < -1e-6 for key in ("elapsed_s", "max_without_confirmed_s", "ascent_m")) or any(
            delta[key] is not None and delta[key] > 1e-6 for key in ("mission_margin_s", "temporal_budget_limiting_margin_s", "daylight_reserved_return_margin_s"))
        if result["assessment"] not in ("viable_model", "insufficient_evidence") or not improvement:
            rejected.append({"id": name, "reason": result["assessment"] or result["search_status"]}); continue
        changes = {key: {"before": payload[key], "after": candidate[key]} for key in ("team",) if payload[key] != candidate[key]}
        if payload["mission"]["departure_utc"] != candidate["mission"]["departure_utc"]:
            changes["departure_utc"] = {"before": payload["mission"]["departure_utc"], "after": candidate["mission"]["departure_utc"]}
        evaluated.append({"id": name, "proposed_request": candidate, "changes": changes, "assessment": result["assessment"],
            "evidence_status": "evaluated_viable_model" if result["assessment"] == "viable_model" else "numerical_improvement_not_proven_viable",
            "delta": delta, "metrics": after["metrics"], "communication": after["communication"], "total_payload_kg": total,
            "team_summary": [{"id": m.identity.profile_id, "name": m.identity.name, "payload_kg": m.payload_kg}
                             for m in resolve_team(CATALOG, candidate["team"])]})
    return {"schema_version": "p2-recommendations-1", "request_echo": deepcopy(payload), "proposals": evaluated,
            "attempted": min(len(unique), CAP), "cap": CAP, "rejected": rejected, "coverage": "bounded deterministic proposals; not exhaustive",
            "preserved": ["base", "destination", "tasks", "reserve", "mission_budget", "total_payload", "decision_cutoff"],
            "scope": "Explicit application and fresh calculation required; assumed capabilities, not operational advice."}
