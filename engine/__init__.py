"""Pure Python team and movement primitives for the navigation engine."""

from .catalog import CATALOG, Catalog, CatalogEntry, SelectionError, select_team
from .team import EffectiveParticipant, resolve_comparison, resolve_team
from .movement import CellTerrain, DirectedMetricEdge, GroupEdgeResult, evaluate_edge, evaluate_path
from .grid import GridInputError, MetricGrid
from .graph import DirectedGridGraph, build_graph

__all__ = [
    "CATALOG", "Catalog", "CatalogEntry", "CellTerrain", "DirectedGridGraph", "DirectedMetricEdge",
    "EffectiveParticipant", "GridInputError", "GroupEdgeResult", "MetricGrid", "SelectionError",
    "build_graph", "evaluate_edge", "evaluate_path", "resolve_comparison", "resolve_team", "select_team",
]
