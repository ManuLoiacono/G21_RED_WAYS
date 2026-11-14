"""Pure Python team and movement primitives for the navigation engine."""

from .catalog import CATALOG, Catalog, CatalogEntry, SelectionError, select_team

__all__ = ["CATALOG", "Catalog", "CatalogEntry", "SelectionError", "select_team"]
