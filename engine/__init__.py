"""Pure Python team and movement primitives for the navigation engine."""

from .catalog import CATALOG, Catalog, CatalogEntry, SelectionError, select_team
from .team import EffectiveParticipant, resolve_comparison, resolve_team
from .movement import CellTerrain, DirectedMetricEdge, GroupEdgeResult, evaluate_edge, evaluate_path
from .grid import GridInputError, MetricGrid
from .graph import DirectedGridGraph, build_graph
from .routing import (
    RoundTripRoutes, RouteLeg, RouteReconstructionError, RoutingSearch,
    reconstruct_route, routes_to, search_from_base,
)

__all__ = [
    "CATALOG", "Catalog", "CatalogEntry", "CellTerrain", "DirectedGridGraph", "DirectedMetricEdge",
    "EffectiveParticipant", "GridInputError", "GroupEdgeResult", "MetricGrid", "SelectionError",
    "RoundTripRoutes", "RouteLeg", "RouteReconstructionError", "RoutingSearch",
    "build_graph", "evaluate_edge", "evaluate_path", "reconstruct_route", "resolve_comparison",
    "resolve_team", "routes_to", "search_from_base", "select_team",
]
