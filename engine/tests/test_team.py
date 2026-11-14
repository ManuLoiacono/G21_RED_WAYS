from dataclasses import FrozenInstanceError
import math

from engine import CATALOG, SelectionError, resolve_comparison, resolve_team


def request(humans=None, robots=None):
    return {
        "catalog_version": CATALOG.version,
        "humans": [{"profile_id": "explorer_01", "payload_kg": 4.0, "mission_overrides": {}}] if humans is None else humans,
        "robots": [] if robots is None else robots,
    }


def rejects(team, code, path):
    try:
        resolve_team(CATALOG, team)
    except SelectionError as exc:
        assert (exc.code, exc.path) == (code, path), (exc.code, exc.path)
    else:
        raise AssertionError(f"Expected {code} at {path}")


def run():
    first = resolve_team(CATALOG, request())[0]
    changed = request()
    changed["humans"][0]["mission_overrides"] = {"flat_speed_m_s": 0.7, "carrying_limit_kg": 6}
    second = resolve_team(CATALOG, changed)[0]
    assert first.parameters.flat_speed_m_s == 0.4
    assert second.parameters.flat_speed_m_s == 0.7
    assert resolve_team(CATALOG, request())[0].parameters.flat_speed_m_s == 0.4
    try:
        first.identity.name = "Modified"
    except FrozenInstanceError:
        pass
    else:
        raise AssertionError("Catalog identity is mutable")

    for value in (float("nan"), float("inf"), -float("inf"), True, None, "4"):
        bad = request()
        bad["humans"][0]["payload_kg"] = value
        rejects(bad, "invalid_number", "team.humans[0].payload_kg")
    for key, value, code in (("flat_speed_m_s", 0, "out_of_range"), ("max_sortie_s", -1, "out_of_range"), ("max_ascent_deg", 90, "out_of_range"), ("flat_speed_m_s", math.inf, "invalid_number")):
        bad = request()
        bad["humans"][0]["mission_overrides"] = {key: value}
        rejects(bad, code, f"team.humans[0].mission_overrides.{key}")
    bad = request()
    bad["humans"][0]["mission_overrides"] = {"age_years": 25}
    rejects(bad, "invalid_override", "team.humans[0].mission_overrides.age_years")
    bad = request()
    bad["humans"][0]["payload_kg"] = 11
    rejects(bad, "payload_exceeds_limit", "team.humans[0].payload_kg")
    bad = request()
    del bad["humans"][0]["payload_kg"]
    rejects(bad, "missing_field", "team.humans[0].payload_kg")
    bad = request()
    bad["humans"][0]["payload_g"] = 4
    rejects(bad, "unknown_field", "team.humans[0].payload_g")

    original = resolve_team(CATALOG, request(robots=[{"profile_id": "support_rover", "payload_kg": 5}]))
    proposal = request(humans=[{"profile_id": "explorer_03", "payload_kg": 9}])
    assert resolve_comparison(CATALOG, original, proposal)[0].payload_kg == 9
    proposal["humans"][0]["payload_kg"] = 4
    try:
        resolve_comparison(CATALOG, original, proposal)
    except SelectionError as exc:
        assert (exc.code, exc.path) == ("payload_not_preserved", "team")
    else:
        raise AssertionError("Removed payload was silently lost")
    print("mission validation checks passed")


if __name__ == "__main__":
    run()
