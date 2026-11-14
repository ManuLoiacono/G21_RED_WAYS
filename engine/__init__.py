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
from .mission import (
    AssessmentReason, DaylightWindow, Departure, MissionAssessment, MissionCheck,
    MissionInputError, MissionTask, ParticipantMargin, PhysicalTimeline, SnapshotReference,
    evaluate_mission,
)
from .templates import MISSION_TEMPLATES, TEMPLATE_VERSION, MissionTemplate, export_mission_templates

__all__ = [
    "CATALOG", "Catalog", "CatalogEntry", "CellTerrain", "DirectedGridGraph", "DirectedMetricEdge",
    "EffectiveParticipant", "GridInputError", "GroupEdgeResult", "MetricGrid", "SelectionError",
    "RoundTripRoutes", "RouteLeg", "RouteReconstructionError", "RoutingSearch",
    "build_graph", "evaluate_edge", "evaluate_path", "reconstruct_route", "resolve_comparison",
    "resolve_team", "routes_to", "search_from_base", "select_team",
    "AssessmentReason", "DaylightWindow", "Departure", "MISSION_TEMPLATES", "MissionAssessment",
    "MissionCheck", "MissionInputError", "MissionTask", "MissionTemplate", "ParticipantMargin",
    "PhysicalTimeline", "SnapshotReference", "TEMPLATE_VERSION", "evaluate_mission", "export_mission_templates",
]
