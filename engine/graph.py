"""Two-pass, blocked construction of directed synthetic movement CSR weights."""

from dataclasses import dataclass
import math
from numbers import Integral

import numpy as np
from scipy.sparse import csr_matrix

from .grid import GridInputError, MetricGrid
from .movement import DirectedMetricEdge
from .team import EffectiveParticipant


OFFSETS = tuple((row, col) for row in (-1, 0, 1) for col in (-1, 0, 1) if row or col)
MODEL_VERSION = "synthetic_constant_speed_v1"


@dataclass(frozen=True)
class DirectedGridGraph:
    grid: MetricGrid
    team: tuple[EffectiveParticipant, ...]
    csr: csr_matrix
    traversable: np.ndarray
    block_cells: int

    @property
    def csr_bytes(self) -> int:
        return self.csr.data.nbytes + self.csr.indices.nbytes + self.csr.indptr.nbytes

    def edge(self, source: tuple[int, int], target: tuple[int, int]) -> DirectedMetricEdge:
        """Regenerate scalar evidence only when inspecting a reconstructed path."""
        self.grid.index(source)
        self.grid.index(target)
        dr, dc = target[0] - source[0], target[1] - source[1]
        if (dr, dc) not in OFFSETS:
            raise GridInputError("invalid_neighbor", "edge", "Cells must be distinct eight-neighbors.")
        run = math.hypot(dr * self.grid.spacing_m[0], dc * self.grid.spacing_m[1])
        start, end = self.grid.cell(source), self.grid.cell(target)
        return DirectedMetricEdge(start, end, run, end.elevation_m - start.elevation_m)


def _validate_team(team):
    if not isinstance(team, tuple) or not team or not all(isinstance(member, EffectiveParticipant) for member in team):
        raise GridInputError("invalid_team", "team", "Supply a nonempty resolved participant tuple.")
    for member in team:
        parameters = member.parameters
        if member.kind not in ("human", "robot") or parameters.model_id != MODEL_VERSION:
            raise GridInputError("unsupported_model", "team", "Vectorized construction supports only the declared synthetic models.")
        values = (parameters.flat_speed_m_s, parameters.max_ascent_deg, parameters.max_descent_deg)
        if not all(math.isfinite(value) for value in values) or parameters.flat_speed_m_s <= 0 or not all(0 <= value < 90 for value in values[1:]):
            raise GridInputError("invalid_parameters", "team", "Resolve finite positive speeds and valid grade limits before construction.")


def _grade(elevation, source, target, run):
    with np.errstate(over="ignore", invalid="ignore"):
        rise = elevation[target] - elevation[source]
    if not np.all(np.isfinite(rise)):
        raise GridInputError("invalid_geometry", "grid.elevation_m", "An evaluated elevation difference is nonfinite.")
    return np.degrees(np.arctan2(rise, run))


def _blocks(grid, team, traversable, block_cells):
    rows, cols = grid.shape
    elevation = grid.elevation_m.ravel()
    ascent = min(member.parameters.max_ascent_deg for member in team)
    descent = min(member.parameters.max_descent_deg for member in team)

    def grade_allowed(source, target, run):
        grade = _grade(elevation, source, target, run)
        return (grade <= ascent) & (-grade <= descent)

    for start in range(0, grid.node_count, block_cells):
        nodes = np.arange(start, min(start + block_cells, grid.node_count), dtype=np.int32)
        row, col = nodes // cols, nodes % cols
        for dr, dc in OFFSETS:
            inside = (row + dr >= 0) & (row + dr < rows) & (col + dc >= 0) & (col + dc < cols)
            source = nodes[inside]
            target = source + dr * cols + dc
            allowed = traversable[source] & traversable[target]
            source, target = source[allowed], target[allowed]
            if not source.size:
                continue
            if dr and dc:
                vertical, horizontal = source + dr * cols, source + dc
                sides = traversable[vertical] & traversable[horizontal]
                source, target = source[sides], target[sides]
                vertical, horizontal = vertical[sides], horizontal[sides]
                # Require both directed orthogonal decompositions, not just finite side cells.
                corner = (grade_allowed(source, vertical, grid.spacing_m[0])
                          & grade_allowed(vertical, target, grid.spacing_m[1])
                          & grade_allowed(source, horizontal, grid.spacing_m[1])
                          & grade_allowed(horizontal, target, grid.spacing_m[0]))
                source, target = source[corner], target[corner]
            run = math.hypot(dr * grid.spacing_m[0], dc * grid.spacing_m[1])
            grade = _grade(elevation, source, target, run)
            allowed = (grade <= ascent) & (-grade <= descent)
            source, target, grade = source[allowed], target[allowed], grade[allowed]
            duration = np.zeros(source.size, dtype=np.float64)
            for member in team:
                uphill, downhill = (0.03, 0.01) if member.kind == "human" else (0.02, 0.04)
                coefficient = np.where(grade >= 0, uphill, downhill)
                with np.errstate(over="ignore", divide="ignore", under="ignore", invalid="ignore"):
                    speed = member.parameters.flat_speed_m_s / (1 + coefficient * np.abs(grade))
                    participant_duration = run / speed
                if not np.all(np.isfinite(participant_duration) & (participant_duration > 0)):
                    raise GridInputError("invalid_model_duration", "movement_model", "Synthetic durations must be finite and strictly positive.")
                np.maximum(duration, participant_duration, out=duration)
            yield source, target, duration


def build_graph(grid: MetricGrid, team: tuple[EffectiveParticipant, ...], *, block_cells: int = 65536) -> DirectedGridGraph:
    """Allocate exact CSR storage without full-grid edge cubes or COO duplicates."""
    if not isinstance(grid, MetricGrid):
        raise GridInputError("invalid_grid", "grid", "Supply a validated MetricGrid.")
    _validate_team(team)
    if not isinstance(block_cells, Integral) or isinstance(block_cells, (bool, np.bool_)) or block_cells <= 0:
        raise GridInputError("invalid_block_size", "block_cells", "Block size must be a positive integer.")
    block_cells = int(block_cells)
    if grid.node_count * 8 > np.iinfo(np.int32).max:
        raise GridInputError("grid_too_large", "grid", "This source-limited SciPy backend requires int32 CSR indices.")
    if not math.isfinite(math.hypot(*grid.spacing_m)):
        raise GridInputError("invalid_geometry", "grid.spacing_m", "Diagonal horizontal run must be finite.")
    traversable = (grid.coverage & ~grid.excluded).ravel()
    if grid.terrain_slope_deg is not None:
        terrain_limit = min(min(member.parameters.max_ascent_deg, member.parameters.max_descent_deg) for member in team)
        traversable &= grid.terrain_slope_deg.ravel() <= terrain_limit
    cursor = np.zeros(grid.node_count, dtype=np.int32)
    for source, _, _ in _blocks(grid, team, traversable, block_cells):
        cursor[source] += 1
    indptr = np.empty(grid.node_count + 1, dtype=np.int32)
    indptr[0] = 0
    np.cumsum(cursor, out=indptr[1:])
    indices = np.empty(int(indptr[-1]), dtype=np.int32)
    weights = np.empty(indices.size, dtype=np.float64)
    cursor[:] = indptr[:-1]
    for source, target, duration in _blocks(grid, team, traversable, block_cells):
        position = cursor[source]
        indices[position], weights[position] = target, duration
        cursor[source] += 1
    graph = csr_matrix((weights, indices, indptr), shape=(grid.node_count, grid.node_count), copy=False)
    for array in (graph.data, graph.indices, graph.indptr, traversable):
        array.flags.writeable = False
    return DirectedGridGraph(grid, team, graph, traversable, block_cells)
