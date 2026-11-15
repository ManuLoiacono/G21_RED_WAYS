"""Complete source-limited movement searches and verified directed route legs."""

from dataclasses import dataclass
import math

import numpy as np
from scipy.sparse.csgraph import dijkstra

from .graph import DirectedGridGraph, MODEL_VERSION
from .grid import GridInputError
from .movement import GroupEdgeResult, evaluate_edge


COST_REL_TOL = 1e-9
COST_ABS_TOL_S = 1e-6
NOT_EVALUATED = ("material", "mission_budget", "daylight", "effort", "communication", "physiology", "real_movement_validation")


class RouteReconstructionError(RuntimeError):
    """Corrupt/inconsistent search state is a technical error, never no-path evidence."""


@dataclass(frozen=True)
class RoutingSearch:
    graph: DirectedGridGraph
    base_index: int
    status: str
    reason: str | None
    outbound_cost_s: np.ndarray | None = None
    outbound_predecessors: np.ndarray | None = None
    return_cost_s: np.ndarray | None = None
    return_predecessors: np.ndarray | None = None

    @property
    def array_bytes(self) -> int:
        return sum(value.nbytes for value in (self.outbound_cost_s, self.outbound_predecessors, self.return_cost_s, self.return_predecessors) if value is not None)


@dataclass(frozen=True)
class RouteLeg:
    status: str
    reason: str | None
    cells: tuple[tuple[int, int], ...] = ()
    xy_m: tuple[tuple[float, float], ...] = ()
    duration_s: float | None = None
    search_cost_s: float | None = None
    horizontal_distance_m: float | None = None
    ascent_m: float | None = None
    descent_m: float | None = None
    edge_results: tuple[GroupEdgeResult, ...] = ()


@dataclass(frozen=True)
class RoundTripRoutes:
    outbound: RouteLeg
    return_leg: RouteLeg
    fixture: bool
    data_version: str
    movement_model_version: str = MODEL_VERSION
    not_evaluated: tuple[str, ...] = NOT_EVALUATED


def _endpoint(graph, cell, name):
    try:
        index = graph.grid.index(cell)
    except GridInputError as error:
        raise GridInputError(error.code, name, str(error)) from error
    if not graph.grid.coverage.ravel()[index]:
        raise GridInputError("missing_endpoint_coverage", name, "Endpoint has no essential analytical coverage.")
    if graph.grid.excluded.ravel()[index]:
        raise GridInputError("excluded_endpoint", name, "Endpoint is excluded from traversal.")
    if not graph.traversable[index]:
        raise GridInputError("endpoint_terrain_limit", name, "Endpoint terrain summary exceeds a selected participant's limit.")
    return index


def search_from_base(graph: DirectedGridGraph, base: tuple[int, int]) -> RoutingSearch:
    """Search once from base on CSR and once on its transpose; never all-pairs."""
    if not isinstance(graph, DirectedGridGraph):
        raise GridInputError("invalid_graph", "graph", "Supply a built DirectedGridGraph.")
    base_index = _endpoint(graph, base, "base")
    try:
        outbound_cost, outbound_pred = dijkstra(graph.csr, directed=True, indices=base_index, return_predecessors=True)
        # Transpose is a shared CSC view; SciPy allocates the needed CSR scratch.
        return_cost, return_pred = dijkstra(graph.csr.transpose(copy=False), directed=True, indices=base_index, return_predecessors=True)
    except KeyboardInterrupt:
        # Do not expose one complete leg as evidence that the entire search completed.
        return RoutingSearch(graph, base_index, "search_inconclusive", "search_interrupted")
    for value in (outbound_cost, outbound_pred, return_cost, return_pred):
        value.flags.writeable = False
    return RoutingSearch(graph, base_index, "complete", None, outbound_cost, outbound_pred, return_cost, return_pred)


def reconstruct_route(search: RoutingSearch, destination: tuple[int, int], *, leg: str = "outbound") -> RouteLeg:
    """For return, transpose predecessors already lead from destination to base."""
    if leg not in ("outbound", "return"):
        raise GridInputError("invalid_leg", "leg", "Select outbound or return.")
    graph = search.graph
    target = _endpoint(graph, destination, "destination")
    if search.status == "search_inconclusive":
        return RouteLeg("search_inconclusive", search.reason)
    if search.status != "complete":
        raise RouteReconstructionError("Search state is not complete.")
    costs = search.outbound_cost_s if leg == "outbound" else search.return_cost_s
    predecessors = search.outbound_predecessors if leg == "outbound" else search.return_predecessors
    if costs is None or predecessors is None or costs.shape != (graph.grid.node_count,) or predecessors.shape != costs.shape:
        raise RouteReconstructionError("Complete search requires source-limited cost and predecessor arrays.")
    cost = float(costs[target])
    if cost == math.inf:
        return RouteLeg("no_path_in_domain", "No directed path exists inside the evaluated grid for this team and model.")
    if not math.isfinite(cost) or cost < 0:
        raise RouteReconstructionError("Search returned an invalid physical cost.")
    nodes = [target]
    seen = {target}
    while nodes[-1] != search.base_index:
        previous = int(predecessors[nodes[-1]])
        if previous < 0 or previous >= graph.grid.node_count:
            raise RouteReconstructionError("Reachable route has a sentinel or out-of-range predecessor.")
        if previous in seen or len(nodes) >= graph.grid.node_count:
            raise RouteReconstructionError("Predecessor chain contains a cycle or exceeds the grid.")
        nodes.append(previous)
        seen.add(previous)
    if leg == "outbound":
        nodes.reverse()
    cells = tuple(divmod(node, graph.grid.shape[1]) for node in nodes)
    results, weights, runs, rises = [], [], [], []
    for source, target, source_cell, target_cell in zip(nodes, nodes[1:], cells, cells[1:]):
        weight = float(graph.csr[source, target])
        if not math.isfinite(weight) or weight <= 0:
            raise RouteReconstructionError("Reconstructed movement is absent from the original directed graph.")
        edge = graph.edge(source_cell, target_cell)
        result = evaluate_edge(graph.team, edge)
        if not result.allowed or not math.isclose(weight, result.duration_s, rel_tol=1e-12, abs_tol=1e-9):
            raise RouteReconstructionError("Original graph weight disagrees with scalar movement evidence.")
        results.append(result)
        weights.append(weight)
        runs.append(edge.run_m)
        rises.append(edge.rise_m)
    duration = math.fsum(result.duration_s for result in results)
    if not all(math.isclose(value, cost, rel_tol=COST_REL_TOL, abs_tol=COST_ABS_TOL_S) for value in (math.fsum(weights), duration)):
        raise RouteReconstructionError("Reconstructed physical duration disagrees with Dijkstra cost.")
    return RouteLeg("found", None, cells, tuple(graph.grid.xy_m(cell) for cell in cells), duration, cost,
                    math.fsum(runs), math.fsum(max(rise, 0) for rise in rises),
                    math.fsum(max(-rise, 0) for rise in rises), tuple(results))


def routes_to(search: RoutingSearch, destination: tuple[int, int]) -> RoundTripRoutes:
    """Return both movement legs without asserting complete-mission viability."""
    return RoundTripRoutes(reconstruct_route(search, destination), reconstruct_route(search, destination, leg="return"),
                           search.graph.grid.fixture, search.graph.grid.data_version)
