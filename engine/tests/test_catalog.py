from engine import CATALOG, SelectionError, select_team


def run():
    assert sum(entry.kind == "human" for entry in CATALOG.entries) == 4
    assert sum(entry.kind == "robot" for entry in CATALOG.entries) == 2
    team = select_team(CATALOG, CATALOG.version, ("explorer_02", "explorer_01"), ("support_rover",))
    assert [entry.identity.profile_id for entry in team] == ["explorer_02", "explorer_01", "support_rover"]
    cases = [
        ("wrong", ("explorer_01",), (), "catalog_version_mismatch"),
        (CATALOG.version, (), (), "invalid_team_size"),
        (CATALOG.version, ("explorer_01", "explorer_01"), (), "duplicate_participant"),
        (CATALOG.version, ("missing",), (), "unknown_profile_id"),
        (CATALOG.version, ("support_rover",), (), "unknown_profile_id"),
    ]
    for version, humans, robots, code in cases:
        try:
            select_team(CATALOG, version, humans, robots)
        except SelectionError as exc:
            assert exc.code == code, (exc.code, code)
        else:
            raise AssertionError(f"Expected {code}")
    print("catalog selection checks passed")


if __name__ == "__main__":
    run()
