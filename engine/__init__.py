"""Pure Python team and movement primitives for the navigation engine."""

from .catalog import CATALOG, Catalog, CatalogEntry, SelectionError, select_team
from .team import EffectiveParticipant, resolve_comparison, resolve_team

__all__ = ["CATALOG", "Catalog", "CatalogEntry", "EffectiveParticipant", "SelectionError", "resolve_comparison", "resolve_team", "select_team"]
