"""Validated metric cell-center geometry; no geographic or file-format adapter."""

from dataclasses import dataclass
from numbers import Integral, Real
import math

import numpy as np

from .movement import CellTerrain


class GridInputError(ValueError):
    def __init__(self, code: str, path: str, message: str):
        self.code = code
        self.path = path
        super().__init__(message)


def _number(value: object, path: str, *, positive: bool = False) -> float:
    try:
        valid = isinstance(value, Real) and not isinstance(value, (bool, np.bool_)) and math.isfinite(value)
    except OverflowError:
        valid = False
    if not valid or (positive and value <= 0):
        raise GridInputError("invalid_number", path, "Expected a finite metric number, positive for spacing.")
    return float(value)


def _array(value: object, path: str, *, boolean: bool = False, shape=None) -> np.ndarray:
    if not isinstance(value, np.ndarray) or value.ndim != 2 or not all(value.shape):
        raise GridInputError("invalid_shape", path, "Expected a nonempty two-dimensional NumPy array.")
    if shape is not None and value.shape != shape:
        raise GridInputError("shape_mismatch", path, "Grid arrays must have matching shapes.")
    if value.dtype.kind not in ("b" if boolean else "fiu"):
        raise GridInputError("invalid_dtype", path, "Expected boolean masks or real numeric terrain arrays.")
    result = np.array(value, dtype=bool if boolean else np.float64, order="C", copy=True)
    result.flags.writeable = False
    return result


@dataclass(frozen=True)
class MetricGrid:
    elevation_m: np.ndarray
    coverage: np.ndarray
    excluded: np.ndarray
    spacing_m: tuple[float, float]
    origin_center_xy_m: tuple[float, float]
    row_direction: str
    data_version: str
    aggregation_policy: str
    fixture: bool
    terrain_slope_deg: np.ndarray | None = None

    def __post_init__(self):
        elevation = _array(self.elevation_m, "grid.elevation_m")
        coverage = _array(self.coverage, "grid.coverage", boolean=True, shape=elevation.shape)
        excluded = _array(self.excluded, "grid.excluded", boolean=True, shape=elevation.shape)
        if not np.all(np.isfinite(elevation[coverage])):
            raise GridInputError("invalid_elevation", "grid.elevation_m", "Covered cells require finite elevation; mask missing cells explicitly.")
        for name, positive in (("spacing_m", True), ("origin_center_xy_m", False)):
            values = getattr(self, name)
            if not isinstance(values, (tuple, list)) or len(values) != 2:
                raise GridInputError("invalid_geometry", f"grid.{name}", "Expected exactly two metric values.")
            object.__setattr__(self, name, tuple(_number(value, f"grid.{name}[{i}]", positive=positive) for i, value in enumerate(values)))
        if not isinstance(self.row_direction, str) or self.row_direction not in ("increasing_y", "decreasing_y"):
            raise GridInputError("invalid_row_direction", "grid.row_direction", "Declare increasing_y or decreasing_y.")
        for name in ("data_version", "aggregation_policy"):
            value = getattr(self, name)
            if not isinstance(value, str) or not value.strip():
                raise GridInputError("missing_metadata", f"grid.{name}", "Nonempty version and aggregation/mask policy are required.")
        if not isinstance(self.fixture, bool):
            raise GridInputError("invalid_fixture", "grid.fixture", "Fixture must be an explicit boolean.")
        slope = None
        if self.terrain_slope_deg is not None:
            slope = _array(self.terrain_slope_deg, "grid.terrain_slope_deg", shape=elevation.shape)
            values = slope[coverage]
            if not np.all(np.isfinite(values) & (values >= 0) & (values < 90)):
                raise GridInputError("invalid_terrain_slope", "grid.terrain_slope_deg", "Covered cells require slope summaries in [0, 90) degrees.")
        elif not self.fixture:
            raise GridInputError("missing_terrain_summary", "grid.terrain_slope_deg", "Real inputs require a separate conservative terrain slope summary and reviewed policy.")
        for name, value in (("elevation_m", elevation), ("coverage", coverage), ("excluded", excluded), ("terrain_slope_deg", slope)):
            object.__setattr__(self, name, value)

    @property
    def shape(self) -> tuple[int, int]:
        return self.elevation_m.shape

    @property
    def node_count(self) -> int:
        return self.elevation_m.size

    def index(self, cell: tuple[int, int]) -> int:
        if not isinstance(cell, (tuple, list)) or len(cell) != 2 or any(not isinstance(value, Integral) or isinstance(value, (bool, np.bool_)) for value in cell):
            raise GridInputError("invalid_cell", "cell", "Expected a row/column integer pair.")
        row, col = map(int, cell)
        if not (0 <= row < self.shape[0] and 0 <= col < self.shape[1]):
            raise GridInputError("out_of_bounds", "cell", "Cell is outside the evaluated grid.")
        return row * self.shape[1] + col

    def cell(self, cell: tuple[int, int]) -> CellTerrain:
        row, col = divmod(self.index(cell), self.shape[1])
        return CellTerrain(None, float(self.elevation_m[row, col]), bool(self.excluded[row, col]), bool(self.coverage[row, col]),
                           None if self.terrain_slope_deg is None else float(self.terrain_slope_deg[row, col]))

    def xy_m(self, cell: tuple[int, int]) -> tuple[float, float]:
        row, col = divmod(self.index(cell), self.shape[1])
        x, y = self.origin_center_xy_m
        row_sign = 1 if self.row_direction == "increasing_y" else -1
        return x + col * self.spacing_m[1], y + row_sign * row * self.spacing_m[0]
