"""Registered immutable fixture packages and explicit coordinate/time boundaries."""

from dataclasses import dataclass
import math
from pathlib import Path

import numpy as np

from engine import Departure, MetricGrid, PhysicalTimeline
from .validation import PlanningInputError, fields, identity, integer, loads_strict, number, text, utc


MAX_PREPARED_CELLS = 2_250_000  # Resource bound, not a terrain or safety threshold.
METRIC_ADAPTER = "synthetic_metric_v1"
CLOCK_ADAPTER = "synthetic_utc_seconds_v1"


@dataclass(frozen=True)
class RequestedLocation:
    type: str
    poi_id: str | None = None
    frame: str | None = None
    xy_m: tuple[float, float] | None = None


@dataclass(frozen=True)
class ResolvedLocation:
    requested: RequestedLocation
    cell: tuple[int, int]
    effective_xy_m: tuple[float, float]
    adapter_id: str = METRIC_ADAPTER
    geographic_conversion: str = "unavailable"
    requested_xy_m: tuple[float, float] | None = None
    effective_elevation_m: float | None = None


@dataclass(frozen=True)
class PreparedPOI:
    id: str
    xy_m: tuple[float, float]
    classification: str = "hypothetical"


@dataclass(frozen=True)
class PreparedParcel:
    id: str
    version: str
    evaluation_location_id: str
    grid: MetricGrid
    mask_version: str
    slope_version: str
    coordinate_adapter: str
    reference_description: str
    pois: tuple[PreparedPOI, ...]
    content_id: str
    metadata_json: str | None = None

    @property
    def geographic_adapter(self):
        return loads_strict(self.metadata_json)["geographic_adapter"] if self.metadata_json else None


@dataclass(frozen=True)
class FixtureClockMapping:
    adapter_id: str
    timeline: PhysicalTimeline
    utc_epoch: str
    offset_at_epoch_s: float
    valid_from_utc: str
    valid_to_utc: str
    assumption: str

    def departure(self, departure_utc, path="mission.departure_utc"):
        if self.adapter_id != CLOCK_ADAPTER:
            raise PlanningInputError("unsupported_clock_adapter", "scenario.clock.adapter_id", "A reviewed real clock adapter is unavailable.")
        instant = utc(departure_utc, path)
        if not utc(self.valid_from_utc, "clock.valid_from_utc") <= instant <= utc(self.valid_to_utc, "clock.valid_to_utc"):
            raise PlanningInputError("outside_clock_coverage", path, "Instant is outside the declared fixture mapping interval.")
        offset = self.offset_at_epoch_s + (instant - utc(self.utc_epoch, "clock.utc_epoch")).total_seconds()
        return Departure(self.timeline, number(offset, "departure.offset_s"))


@dataclass(frozen=True)
class PreparedRecord:
    record_id: str
    series_id: str
    revision: int
    kind: str
    variable: str
    value: float | tuple[float, float] | None
    units: str
    evidence_kind: str
    source_id: str
    source_location_id: str
    spatial_scope: str
    fetched_at_utc: str
    available_at_utc: str | None = None
    issued_at_utc: str | None = None
    observation_start_utc: str | None = None
    observation_end_utc: str | None = None
    valid_from_utc: str | None = None
    valid_to_utc: str | None = None
    reconstructed_available_at_utc: str | None = None
    availability_assumption: str | None = None
    epoch_id: str | None = None


@dataclass(frozen=True)
class PreparedScenario:
    id: str
    version: str
    parcel_id: str
    parcel_version: str
    evaluation_location_id: str
    fixture: bool
    clock: FixtureClockMapping
    availability_policy: str
    records: tuple[PreparedRecord, ...]
    required_evidence: tuple[str, ...]
    content_id: str


class PreparedRegistry:
    """Fixed registered packages; planning never interprets a path or URL."""

    def __init__(self, parcels, scenarios):
        self._parcels = tuple(parcels)
        self._scenarios = tuple(scenarios)
        for group in (self._parcels, self._scenarios):
            if len({(item.id, item.version) for item in group}) != len(group):
                raise PlanningInputError("duplicate_package", "registry", "Package ID/version must be unique.")

    @property
    def parcels(self):
        """Registered immutable parcel metadata; no implicit latest-version selection."""
        return self._parcels

    @property
    def scenarios(self):
        return self._scenarios

    def parcel(self, parcel_id, version):
        result = next((item for item in self._parcels if (item.id, item.version) == (parcel_id, version)), None)
        if result is None:
            raise PlanningInputError("unknown_parcel", "parcel", "Parcel ID/version is not registered; real adapters remain unavailable.")
        return result

    def scenario(self, scenario_id, version, parcel):
        result = next((item for item in self._scenarios if (item.id, item.version) == (scenario_id, version)), None)
        if result is None:
            raise PlanningInputError("unknown_scenario", "scenario", "Scenario ID/version is not registered.")
        if (result.parcel_id, result.parcel_version) != (parcel.id, parcel.version):
            raise PlanningInputError("scenario_parcel_mismatch", "scenario.parcel_id", "Scenario belongs to a different parcel/version.")
        if result.evaluation_location_id != parcel.evaluation_location_id:
            raise PlanningInputError("scenario_location_mismatch", "scenario.evaluation_location_id", "Scenario solar location differs from the parcel.")
        return result


def resolve_location(parcel, request, path="location"):
    if not ((parcel.coordinate_adapter == METRIC_ADAPTER and parcel.grid.fixture) or
            (parcel.coordinate_adapter == "gale-eqc-scene-v1" and parcel.geographic_adapter is not None and not parcel.grid.fixture)):
        raise PlanningInputError("unsupported_coordinate_adapter", path, "A reviewed real coordinate adapter is unavailable.")
    if not isinstance(request, dict):
        raise PlanningInputError("invalid_structure", path, "Expected a tagged location object.")
    if request.get("type") == "poi":
        fields(request, ("type", "poi_id"), path=path)
        poi_id = text(request["poi_id"], f"{path}.poi_id")
        poi = next((item for item in parcel.pois if item.id == poi_id), None)
        if poi is None:
            raise PlanningInputError("unknown_poi", f"{path}.poi_id", "POI is not registered in this parcel.")
        xy = poi.xy_m
        requested = RequestedLocation("poi", poi_id=poi_id)
    elif request.get("type") == "coordinate":
        fields(request, ("type", "frame", "xy_m"), path=path)
        if request["frame"] != "parcel_metric":
            raise PlanningInputError("unsupported_coordinate_adapter", f"{path}.frame", "Only the synthetic parcel_metric frame is enabled; geographic conversion is unavailable.")
        xy = _pair(request["xy_m"], f"{path}.xy_m")
        requested = RequestedLocation("coordinate", frame="parcel_metric", xy_m=xy)
    else:
        raise PlanningInputError("unsupported_location_type", f"{path}.type", "Choose poi or coordinate.")
    grid = parcel.grid
    sign = 1 if grid.row_direction == "increasing_y" else -1
    col_axis = (xy[0] - grid.origin_center_xy_m[0]) / grid.spacing_m[1]
    row_axis = sign * (xy[1] - grid.origin_center_xy_m[1]) / grid.spacing_m[0]
    # Half-open footprints in increasing row/column axes: [-0.5, n-0.5).
    if not (-0.5 <= row_axis < grid.shape[0] - 0.5 and -0.5 <= col_axis < grid.shape[1] - 0.5):
        raise PlanningInputError("outside_parcel", path, "Requested point is outside the half-open analytical footprint.")
    cell = (math.floor(row_axis + 0.5), math.floor(col_axis + 0.5))
    if not grid.coverage[cell]:
        raise PlanningInputError("missing_endpoint_coverage", path, "Containing cell has no analytical coverage; no snapping is performed.")
    if grid.excluded[cell]:
        raise PlanningInputError("excluded_endpoint", path, "Containing cell is excluded; no snapping is performed.")
    return ResolvedLocation(requested, cell, grid.xy_m(cell), parcel.coordinate_adapter,
                            "available" if parcel.geographic_adapter else "unavailable", xy,
                            float(grid.elevation_m[cell]))


def _pair(value, path):
    if not isinstance(value, (list, tuple)) or len(value) != 2:
        raise PlanningInputError("invalid_structure", path, "Expected exactly two numbers.")
    return tuple(number(item, f"{path}[{i}]") for i, item in enumerate(value))


def _record(raw, scenario, path):
    required = ("record_id", "series_id", "revision", "kind", "variable", "value", "units", "evidence_kind",
                "source_id", "source_location_id", "spatial_scope", "fetched_at_utc")
    optional = ("available_at_utc", "issued_at_utc", "observation_start_utc", "observation_end_utc", "valid_from_utc",
                "valid_to_utc", "reconstructed_available_at_utc", "availability_assumption", "epoch_id")
    fields(raw, required, optional, path)
    for key in required:
        if key not in ("value", "revision"):
            text(raw[key], f"{path}.{key}")
    integer(raw["revision"], f"{path}.revision")
    if raw["kind"] not in ("observation", "forecast", "event", "daylight", "verification"):
        raise PlanningInputError("invalid_record_kind", f"{path}.kind", "Unsupported prepared record kind.")
    if raw["evidence_kind"] not in ("observed", "derived", "forecast", "assumed"):
        raise PlanningInputError("invalid_evidence_kind", f"{path}.evidence_kind", "Declare the evidence classification independently of fixture status.")
    for key in ("fetched_at_utc", *optional[:7]):
        if raw.get(key) is not None:
            utc(raw[key], f"{path}.{key}")
    for start, end in (("observation_start_utc", "observation_end_utc"), ("valid_from_utc", "valid_to_utc")):
        if raw.get(start) is not None or raw.get(end) is not None:
            if raw.get(start) is None or raw.get(end) is None or utc(raw[start], path) >= utc(raw[end], path):
                raise PlanningInputError("invalid_interval", path, "Record intervals require ordered start and end timestamps.")
    if raw["kind"] in ("observation", "verification") and raw.get("observation_end_utc") is None:
        raise PlanningInputError("missing_observation_interval", path, "Observations require their complete observation interval.")
    if raw["kind"] in ("forecast", "event") and (raw.get("issued_at_utc") is None or raw.get("valid_to_utc") is None):
        raise PlanningInputError("missing_forecast_metadata", path, "Forecast/alert revisions require issue and validity times.")
    value = raw["value"]
    if raw["kind"] == "daylight":
        value = _pair(value, f"{path}.value")
        if value[1] <= value[0] or raw.get("epoch_id") != scenario["clock"]["epoch_id"]:
            raise PlanningInputError("daylight_epoch_or_interval_mismatch", path, "Daylight must use the declared ordered physical-second axis.")
        if raw["source_location_id"] != scenario["evaluation_location_id"] or raw["units"] != "physical_second":
            raise PlanningInputError("daylight_location_or_unit_mismatch", path, "Solar evidence must use the actual evaluation location and physical seconds.")
        if raw["evidence_kind"] not in ("assumed", "derived", "observed"):
            raise PlanningInputError("invalid_evidence_kind", path, "Daylight classification must be accepted by the engine.")
    elif value is not None:
        value = number(value, f"{path}.value")
    if raw.get("reconstructed_available_at_utc") is not None:
        text(raw.get("availability_assumption"), f"{path}.availability_assumption")
    return PreparedRecord(**{**raw, "value": value})


def registry_from_fixture(raw):
    """Trusted package ingestion API; never accepts a request-supplied filename."""
    fields(raw, ("parcel", "scenarios"), path="package")
    item = raw["parcel"]
    fields(item, ("id", "version", "evaluation_location_id", "mask_version", "slope_version", "coordinate_adapter",
                  "reference_description", "grid", "pois"), path="parcel")
    if item["coordinate_adapter"] != METRIC_ADAPTER or item["grid"].get("fixture") is not True:
        raise PlanningInputError("unsupported_coordinate_adapter", "parcel.coordinate_adapter", "Only explicit synthetic packages are enabled pending P3 review.")
    for key in ("id", "version", "evaluation_location_id", "mask_version", "slope_version", "reference_description"):
        text(item[key], f"parcel.{key}")
    grid_input = dict(item["grid"])
    elevation = grid_input.get("elevation_m")
    if (not isinstance(elevation, list) or not elevation or not isinstance(elevation[0], list)
            or not elevation[0] or any(not isinstance(row, list) or len(row) != len(elevation[0]) for row in elevation)
            or sum(len(row) for row in elevation) > MAX_PREPARED_CELLS):
        raise PlanningInputError("parcel_size_limit", "parcel.grid", "Prepared input exceeds the bounded grid envelope or is malformed.")
    for key in ("elevation_m", "coverage", "excluded", "terrain_slope_deg"):
        if grid_input.get(key) is not None:
            grid_input[key] = np.asarray(grid_input[key])
    grid = MetricGrid(**grid_input)
    pois = tuple(PreparedPOI(text(poi["id"], "poi.id"), _pair(poi["xy_m"], "poi.xy_m")) for poi in item["pois"])
    if len({poi.id for poi in pois}) != len(pois):
        raise PlanningInputError("duplicate_poi", "parcel.pois", "POI IDs must be unique.")
    parcel = PreparedParcel(**{key: item[key] for key in item if key not in ("grid", "pois")}, grid=grid, pois=pois, content_id=identity(item))
    scenarios = []
    for index, scenario in enumerate(raw["scenarios"]):
        path = f"scenarios[{index}]"
        fields(scenario, ("id", "version", "parcel_id", "parcel_version", "evaluation_location_id", "fixture", "clock",
                          "availability_policy", "records", "required_evidence"), path=path)
        for key in ("id", "version", "parcel_id", "parcel_version", "evaluation_location_id"):
            text(scenario[key], f"{path}.{key}")
        if scenario["fixture"] is not True or scenario["availability_policy"] not in ("exclude_unknown", "reconstruct_declared"):
            raise PlanningInputError("unsupported_scenario_policy", path, "Use an explicit fixture and supported availability policy.")
        if scenario["required_evidence"] != ["daylight"]:
            raise PlanningInputError("unsupported_required_evidence", path, "This slice evaluates required daylight only; weather remains optional context.")
        clock = scenario["clock"]
        fields(clock, ("adapter_id", "epoch_id", "utc_epoch", "offset_at_epoch_s", "valid_from_utc", "valid_to_utc", "assumption"), path=f"{path}.clock")
        if clock["adapter_id"] != CLOCK_ADAPTER:
            raise PlanningInputError("unsupported_clock_adapter", f"{path}.clock.adapter_id", "Real clock normalization is unavailable pending P3 review.")
        for key in ("utc_epoch", "valid_from_utc", "valid_to_utc"):
            utc(clock[key], f"{path}.clock.{key}")
        if not utc(clock["valid_from_utc"], path) <= utc(clock["utc_epoch"], path) <= utc(clock["valid_to_utc"], path):
            raise PlanningInputError("invalid_clock_interval", path, "Fixture epoch must be within its declared UTC mapping coverage.")
        mapping = FixtureClockMapping(clock["adapter_id"], PhysicalTimeline(text(clock["epoch_id"], f"{path}.clock.epoch_id")),
                                      clock["utc_epoch"], number(clock["offset_at_epoch_s"], path), clock["valid_from_utc"],
                                      clock["valid_to_utc"], text(clock["assumption"], f"{path}.clock.assumption"))
        records = tuple(_record(record, scenario, f"{path}.records[{i}]") for i, record in enumerate(scenario["records"]))
        if len({record.record_id for record in records}) != len(records) or len({(r.kind, r.series_id, r.revision) for r in records}) != len(records):
            raise PlanningInputError("duplicate_record", path, "Record IDs and per-kind series revisions must be unique.")
        scenarios.append(PreparedScenario(**{key: scenario[key] for key in scenario if key not in ("clock", "records", "required_evidence")},
                                          clock=mapping, records=records, required_evidence=tuple(scenario["required_evidence"]), content_id=identity(scenario)))
    registry = PreparedRegistry((parcel,), scenarios)
    for scenario in scenarios:
        registry.scenario(scenario.id, scenario.version, parcel)
    return registry


def fixture_registry():
    path = Path(__file__).parent / "fixtures" / "synthetic_demo.json"
    return registry_from_fixture(loads_strict(path.read_text(encoding="utf-8")))
