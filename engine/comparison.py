"""Two-stage lexicographic optima without mixing metres and physical seconds."""

import numpy as np
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import dijkstra

from .routing import RoutingSearch, _endpoint

METHOD = "lexicographic-tight-edges-physical-time-v1"


def criterion_weights(graph, criterion, states=None):
    result = np.empty(graph.csr.nnz, dtype=np.float64)
    elevation = graph.grid.elevation_m.ravel()
    visibility = None if states is None else states.ravel()
    for begin in range(0, graph.grid.node_count, graph.block_cells):
        end = min(begin + graph.block_cells, graph.grid.node_count)
        lo, hi = graph.csr.indptr[begin], graph.csr.indptr[end]
        source = np.repeat(np.arange(begin, end), np.diff(graph.csr.indptr[begin:end + 1]))
        target = graph.csr.indices[lo:hi]
        if criterion == "lowest_relative_effort":
            result[lo:hi] = np.maximum(elevation[target] - elevation[source], 0)
        elif criterion == "best_geometric_visibility" and visibility is not None:
            result[lo:hi] = graph.csr.data[lo:hi] * ((visibility[source] != 1).astype(float) + (visibility[target] != 1)) / 2
        else:
            raise ValueError("Unsupported optimization criterion or missing visibility layer.")
    return result


def _lexicographic(physical, primary, base):
    """Primary shortest distances first; time search on exactly tight edges.

    Explicit sparse zero primary weights are retained. Equality uses the same
    float64 additions as primary Dijkstra; no arbitrary metre/second epsilon or
    weighted sum admits a worse primary edge. Positive physical costs break
    zero-primary cycles. Each retained edge has an optimal primary prefix.
    """
    objective = csr_matrix((primary, physical.indices, physical.indptr), shape=physical.shape)
    distance = dijkstra(objective, directed=True, indices=base)
    weights = physical.data.copy()
    for begin in range(0, physical.shape[0], 65536):
        end = min(begin + 65536, physical.shape[0])
        lo, hi = physical.indptr[begin], physical.indptr[end]
        source = np.repeat(np.arange(begin, end), np.diff(physical.indptr[begin:end + 1]))
        target = physical.indices[lo:hi]
        tight = np.isfinite(distance[source]) & (distance[source] + primary[lo:hi] == distance[target])
        weights[lo:hi][~tight] = np.inf
    restricted = csr_matrix((weights, physical.indices, physical.indptr), shape=physical.shape)
    return dijkstra(restricted, directed=True, indices=base, return_predecessors=True)


def search_criterion(graph, base, criterion, states=None):
    base_index = _endpoint(graph, base, "base")
    weights = criterion_weights(graph, criterion, states)
    outbound, outbound_pred = _lexicographic(graph.csr, weights, base_index)
    primary_graph = csr_matrix((weights, graph.csr.indices, graph.csr.indptr), shape=graph.csr.shape)
    # Physical and primary transposes have the same ordering of directed edges.
    reverse = graph.csr.transpose().tocsr()
    reverse_primary = primary_graph.transpose().tocsr()
    returning, return_pred = _lexicographic(reverse, reverse_primary.data, base_index)
    for value in (outbound, outbound_pred, returning, return_pred):
        value.flags.writeable = False
    return RoutingSearch(graph, base_index, "complete", None, outbound, outbound_pred, returning, return_pred)
