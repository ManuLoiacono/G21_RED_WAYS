"""Versioned, immutable demonstration roster and mission selection."""

from dataclasses import dataclass


@dataclass(frozen=True)
class Identity:
    profile_id: str
    name: str
    avatar_ref: str
    specialty: str
    traits: tuple[str, ...]
    age_years: int | None = None
    sex: str | None = None
    height_m: float | None = None
    body_mass_kg: float | None = None


@dataclass(frozen=True)
class OperationalDefaults:
    flat_speed_m_s: float
    max_ascent_deg: float
    max_descent_deg: float
    carrying_limit_kg: float
    max_sortie_s: float
    model_id: str = "synthetic_constant_speed_v1"


@dataclass(frozen=True)
class CatalogEntry:
    kind: str
    identity: Identity
    defaults: OperationalDefaults


@dataclass(frozen=True)
class Catalog:
    version: str
    entries: tuple[CatalogEntry, ...]

    def find(self, profile_id: str) -> CatalogEntry | None:
        return next((entry for entry in self.entries if entry.identity.profile_id == profile_id), None)


class SelectionError(ValueError):
    def __init__(self, code: str, path: str, message: str):
        self.code = code
        self.path = path
        super().__init__(message)


CATALOG = Catalog(
    version="synthetic-team-v1",
    entries=(
        CatalogEntry("human", Identity("explorer_01", "Avery Stone", "explorer_01", "geology", ("steady pace",), 34, "female", 1.70, 68.0), OperationalDefaults(0.40, 14.0, 14.0, 10.0, 21600.0)),
        CatalogEntry("human", Identity("explorer_02", "Morgan Vale", "explorer_02", "topography", ("faster pace",), 38, "male", 1.78, 76.0), OperationalDefaults(0.50, 15.0, 15.0, 9.0, 21600.0)),
        CatalogEntry("human", Identity("explorer_03", "Riley Chen", "explorer_03", "environmental measurement", ("greater carrying capacity",), 31, "nonbinary", 1.74, 72.0), OperationalDefaults(0.35, 13.0, 13.0, 14.0, 21600.0)),
        CatalogEntry("human", Identity("explorer_04", "Jordan Reed", "explorer_04", "reconnaissance", ("moderate pace",), 42, "female", 1.66, 64.0), OperationalDefaults(0.45, 17.0, 17.0, 8.0, 21600.0)),
        CatalogEntry("robot", Identity("support_rover", "Light Support Rover", "support_rover", "support", ("narrow grade range",)), OperationalDefaults(0.30, 8.0, 8.0, 20.0, 18000.0)),
        CatalogEntry("robot", Identity("transport_rover", "Transport Rover", "transport_rover", "transport", ("greater carrying capacity",)), OperationalDefaults(0.38, 15.0, 15.0, 40.0, 18000.0)),
    ),
)


def select_team(
    catalog: Catalog, catalog_version: str, human_ids: tuple[str, ...], robot_ids: tuple[str, ...] = ()
) -> tuple[CatalogEntry, ...]:
    """Resolve unique participant IDs in request order without changing the catalog."""
    if catalog_version != catalog.version:
        raise SelectionError("catalog_version_mismatch", "team.catalog_version", "Catalog version is not available.")
    if not isinstance(human_ids, (tuple, list)) or not 1 <= len(human_ids) <= 4:
        raise SelectionError("invalid_team_size", "team.humans", "Select one to four humans.")
    if not isinstance(robot_ids, (tuple, list)) or len(robot_ids) > 2:
        raise SelectionError("invalid_team_size", "team.robots", "Select zero to two robots.")
    selected = []
    seen = set()
    for kind, ids in (("human", human_ids), ("robot", robot_ids)):
        for index, profile_id in enumerate(ids):
            path = f"team.{kind}s[{index}].profile_id"
            if not isinstance(profile_id, str):
                raise SelectionError("invalid_profile_id", path, "Profile ID must be a string.")
            if profile_id in seen:
                raise SelectionError("duplicate_participant", path, "Participant is selected more than once.")
            entry = catalog.find(profile_id)
            if entry is None or entry.kind != kind:
                raise SelectionError("unknown_profile_id", path, "Participant ID is not in this catalog group.")
            seen.add(profile_id)
            selected.append(entry)
    return tuple(selected)
