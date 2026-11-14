# Team movement, directed metric routing and complete missions

This is a Python development slice with NumPy/SciPy for metric grids and routing. Use Python 3.10-3.12 with the pinned dependencies (verified on 3.11.7). It needs no HTTP server, browser, final Gale coordinates, or raster. All catalog values and directional speed coefficients are synthetic assumptions; see [PARAMETERS.md](PARAMETERS.md). No physiological consumption, fatigue, safety, or real robot performance is estimated.

From the repository root, run:

```sh
python -m pip install -r engine/requirements.txt
python -m engine.tests.test_catalog
python -m engine.tests.test_team
python -m engine.tests.test_movement
python -m engine.tests.test_grid
python -m engine.tests.test_graph
python -m engine.tests.test_routing
python -m engine.tests.test_mission
python -m engine.tests.test_templates
python -m engine.example
python -m engine.routing_example
python -m engine.mission_example
python -m engine.routing_benchmark --rows 256 --cols 256
```

Use the selected interpreter's `python` after creating/activating a virtual environment, or replace it with an absolute interpreter path. On this Windows machine the verified runtime is `C:\Users\Usuario\anaconda3\python.exe`; PowerShell invocation is `& 'C:\Users\Usuario\anaconda3\python.exe' -m engine.tests.test_routing`. The Windows Store `python` alias is not the runtime used for these checks. For a clean environment, use your Python 3.10-3.12 interpreter to run `-m venv .venv`, then the environment interpreter to install `engine/requirements.txt` and run the commands above. No rasterio, browser or service dependencies are needed.

`engine.example` prints its complete input, per-participant edge decisions and durations, group edge maxima, and the sum of those maxima as JSON. Its `fixture: true` label is mandatory when displaying it. The functions `select_team`, `resolve_team`, `resolve_comparison`, `evaluate_edge`, and `evaluate_path` are exported from `engine`. `resolve_team` accepts the proposed v1 `team` object with `catalog_version`, `humans`, and `robots`; each participant has `profile_id`, required `payload_kg`, and optional `mission_overrides`.

Endpoint elevation is authoritative for `DirectedMetricEdge`. A contradictory supplied `rise_m` returns `inconsistent_rise`, including after reversal. The absolute tolerance is `1e-6` m (zero relative tolerance), a numerical comparison tolerance with no terrain-accuracy claim. Even within tolerance, grade uses target minus source elevation. Positive rise is uphill; `reversed()` exchanges cells and negates supplied rise. Missing essential elevation/coverage or an excluded cell blocks traversal. Each selected participant gets a permission decision, duration when permitted, structured reasons and evidence IDs. Group permission is the intersection; duration is the maximum participant duration on each edge. Sum these maxima over a path. `evaluate_path` returns per-edge results without search.

`CellTerrain.terrain_code` is optional material evidence. `None` explicitly means material is unevaluated, with no speed benefit or claim of firm ground. `coverage_valid` (default true for existing scalar callers) records essential analytical coverage separately. Optional `terrain_slope_deg` is a conservative unsigned summary, gated against the smaller ascent/descent limit for every participant, independently of directed endpoint grade.

`MetricGrid` takes matching nonempty 2D NumPy arrays: real numeric `elevation_m`, boolean `coverage` and `excluded`, and optional real numeric `terrain_slope_deg`. Inputs become read-only snapshots; numeric arrays become float64 and NumPy scalar metadata becomes Python numbers. Covered elevations/summaries must be finite. Uncovered cells, including finite nodata sentinels, remain blocked. Masks must already be boolean: an adapter must explicitly decode byte masks. Required metadata: positive `(row, column)` `spacing_m`, `(x, y)` `origin_center_xy_m` at cell `(0, 0)`, `row_direction` (`increasing_y` or `decreasing_y`), `data_version`, explicit `fixture` flag, and nonempty `aggregation_policy`. Columns increase x; indices are zero-based row-major with no snapping. No geographic conversion is supplied.

Real inputs additionally require a separate slope summary. Metadata presence is structural validation only, not P3 approval: review the policy before real-data use. A p90 slope cannot erase excluded or missing native samples. P3 must define conservative whole-cell coverage/exclusion masks, native-slope aggregation, cell-center alignment and version; this slice invents none of these layers.

`build_graph(grid, resolved_team, block_cells=65536)` returns `DirectedGridGraph` with a directed CSR matrix (`csr`) whose positive float64 weights are synthetic physical seconds. All cells retain their row-major node ID; blocked cells are isolated. Correct metric distances include unequal row/column spacing. Allowed edges intersect all participants' grade permissions and use maximum participant duration per edge, without load-speed penalties. The vector backend supports the declared synthetic model only and rejects unknown model IDs; custom scalar strategies need a matching vector implementation before graph use.

Diagonal edges require valid, unexcluded, team-compatible source, target and both orthogonal side cells. Terrain-summary gates apply to all four cells. Additionally, both directed two-edge orthogonal decompositions must satisfy the participants' endpoint-grade gates; a steep side cannot be skipped even in a fixture without slope summaries. The diagonal itself still has its own directed grade and duration. This conservative policy can remove a diagonal even when its endpoint grade alone would pass; its side movements do not add to diagonal duration.

Construction enumerates in-bounds offsets in blocks, counts permitted edges, then fills exact CSR storage in a second pass. It stores no per-edge participant objects, full explanations, full-grid COO copies or participant-by-edge cube. `graph.edge(source_cell, target_cell)` regenerates scalar geometry on demand. Final storage is CSR (`csr_bytes`), one traversability byte per cell and grid snapshots. Additional construction workspace includes one int32 cursor per node plus bounded offset arrays (conservative planning allowance: roughly `256 * min(block_cells, node_count)` bytes, not a measured allocator peak). Counts reuse cursor storage. CSR uses int32 indices; inputs whose eight-edge upper bound exceeds int32 are explicitly rejected. Actual time and memory observations are recorded in [ROUTING_MEASUREMENTS.md](ROUTING_MEASUREMENTS.md).

`search_from_base(graph, base_cell)` uses `scipy.sparse.csgraph.dijkstra` with `directed=True` and one explicit source on the original graph, then on its transpose for return-to-base costs. It retains four one-dimensional cost/predecessor arrays, no all-pairs output and no persistent transpose. SciPy's conversion of the shared CSC transpose to CSR and search internals need temporary memory; see [the measured high-water marks](ROUTING_MEASUREMENTS.md) and [SciPy's source/predecessor semantics](https://docs.scipy.org/doc/scipy-1.11.4/reference/generated/scipy.sparse.csgraph.dijkstra.html).

`reconstruct_route(search, destination_cell, leg="outbound" | "return")` returns a `RouteLeg`; `routes_to(search, destination_cell)` returns `RoundTripRoutes` containing `outbound` and `return_leg`. Transpose predecessor chains already point from destination to base for return; outbound chains are reversed. Every reconstructed arc must exist in the original graph and agree with the scalar evaluator. Both the arc-weight sum and regenerated physical duration must match Dijkstra cost within `1e-9` relative or `1e-6` seconds absolute tolerance (numerical tolerances only). Metrics include positive ascent/descent totals and **horizontal** distance, not 3D surface distance. Same-cell movement has one coordinate, zero duration/distance and no edges. Equal-cost path geometry follows SciPy tie breaking; no stable tie ordering is promised.

Invalid/missing/excluded endpoints raise `GridInputError` with code/path; endpoints are never snapped. A completed search with infinite distance yields `no_path_in_domain` for that leg and no fabricated geometry. An interrupted search yields `search_inconclusive` and discards partial arrays, including when only the second search was interrupted. Corrupt predecessor chains or duration mismatches raise `RouteReconstructionError`, separately from disconnection. Other technical failures propagate; no partial result is published. The synchronous SciPy backend has no timeout/progress API; interruption is handled when Python receives `KeyboardInterrupt`.

Routing reports `found` only as a movement result, never `viable_model`. `RoundTripRoutes` preserves data/model versions, fixture flag and `not_evaluated` properties. A valid outbound route can coexist with no return route. At the routing boundary, material, mission budget, daylight, effort, communication, physiology and real movement validation remain unevaluated. `engine.routing_example` prints complete synthetic inputs plus a short outbound leg and a distinct conservative return; both are checked against original directed arcs. [The integration handoff](../docs/handoffs/P2_03_04_MISSION_SERVICE.md) describes the mission/service boundary.

## Pure complete-mission evaluation (increment 1)

`evaluate_mission(routes, tasks, participants, *, time_budget_s, reserve_s, departure, daylight, snapshot)` evaluates a fresh complete mission from existing movement results. It neither searches nor fetches data, converts coordinates/clocks, reads the current date, or mutates inputs. Supply `RoundTripRoutes` produced for the same effective participants from `resolve_team`; the caller owns this association because the routing result does not contain a team fingerprint. Task/reserve/departure changes can reuse those movement results. Event reevaluation from an elapsed mission is a later interface, not a call that resets these limits.

Inputs are frozen engine records, validated at the evaluator boundary. `MissionTask(id, duration_s)` occurrences are sequential, with unique IDs. Empty tasks and zero task/movement/reserve durations are allowed; mission and participant limits must be positive. Consumed numbers must be finite, booleans are rejected, and overflowing totals fail explicitly. `MissionInputError` provides `code` and field `path`; malformed required values never become zero or a mission assessment. Backend/reconstruction technical errors remain exceptions from the movement layer.

`elapsed_s = outbound_s + tasks_s + return_s`; `reserved_total_s = elapsed_s + reserve_s`. Reserve is unused required margin. `mission_margin_s` and each `participant_margins[].margin_s` subtract the reserved total from that budget's original limit. Task time counts for every human and robot; availability is never pooled or reset. `limiting_margin_s`, `limiting_constraints` and `limiting_participant_ids` identify the smallest mission/participant budget margin and all exact ties. If the mission budget alone limits the result, the limiting participant list is empty. Daylight has its own check margin.

`PhysicalTimeline(epoch_id)` declares one opaque sol/scenario epoch with `unit="physical_second"` and `convention="elapsed_since_epoch"`. `Departure(timeline, offset_s)` and `DaylightWindow(timeline, start_s, end_s, evaluation_location_id, method, evidence_id, evidence_kind)` must share this metadata. The interval must be finite and strictly ordered. Negative offsets are valid when the declared epoch is later than the interval; local-clock strings and Mars-clock hours are rejected. P3 must supply the real conversion; no sol length or conversion is inferred here.

Departure must be within the inclusive daylight interval. `estimated_return_s` adds elapsed activity to departure; `reserved_deadline_s` adds elapsed activity plus reserve. The reserved deadline must be no later than daylight end. All time checks use **absolute 1e-6 physical seconds, zero relative tolerance** as numerical comparison policy. Raw values/margins are retained without rounding, including a tiny negative margin accepted only within that tolerance. This is not an operational allowance or a terrain/solar measurement accuracy claim. Astronomical daylight does not evaluate terrain shadow.

`SnapshotReference` echoes scenario ID/version, exact snapshot ID, UTC decision cutoff, declared availability, availability policy, evaluation location, replay mode and fixture flag. UTC timestamps must include `Z` or `+00:00`; snapshot availability later than the cutoff is rejected. Daylight must name the same evaluation location. The reference attests that its daylight/input evidence belongs to that exact eligible snapshot. It does **not** select records, prove their historical availability or establish an opaque location's actual coordinates. The later provider must validate every observation interval, publication time, forecast issue time and revision, normalize solar input at the actual parcel location, and state reconstructed availability honestly. No weather payload/provider, current-time fallback, hourly weather, temperature threshold, weather-to-speed effect or DONKI veto is implemented.

`MissionAssessment.checks` preserves every check with a rule ID, status, structured reason (`code`, `path`, `message`), applicable values/margins, participant ID and evidence IDs. Every check in this slice is mandatory; `not_evaluated` also preserves unsupported properties such as material and communication. Assessment precedence is:

- Any decisive failed mandatory rule: `assessment="incompatible"`, preserving missing/unevaluated checks.
- Otherwise missing required daylight: `assessment="insufficient_evidence"`.
- Otherwise an incomplete leg: `assessment=null`, `search_status="search_inconclusive"`. No completed mission assessment is asserted. An inconclusive search remains explicit even when missing daylight separately establishes insufficient evidence.
- Otherwise: `assessment="viable_model"`, retaining movement assumptions and limitations. This is not operational safety.

`no_path_in_domain` on either leg is incompatible within the evaluated model/domain. Unavailable durations/totals/margins remain null, with reasons; geometry is never invented. A known violation can coexist with an inconclusive search, which stays visible in `search_status`. This increment has no named conditional rules and never manufactures `conditional` as a substitute for failure or missing evidence.

## Central templates and reproducible synthetic cases

`MISSION_TEMPLATES` in [templates.py](templates.py) is the authoritative source of the four English IDs: `geological_observation`, `topographic_exploration`, `reconnaissance`, `environmental_measurement`. Frozen defaults contain tasks, a mission budget and reserve; callers may create edited scenarios without changing that source. Every numeric default is an **editable synthetic scenario assumption**, with no scientific task-time claim. `export_mission_templates()` exports fresh versioned, fixture-labeled JSON-compatible definitions for P1 review. Do not copy a second independently maintained set into the UI. To inspect the export:

```sh
python -c "import json; from engine import export_mission_templates; print(json.dumps(export_mission_templates(), indent=2, allow_nan=False))"
python -m engine.mission_example
```

The mission example prints all shared inputs, per-case overrides and assessments, including snapshot cutoff, physical-second metadata, versions and assumptions. It searches a synthetic 30 m flat edge for a human plus support rover (100 s each direction). Its reconnaissance task/reserve come from the central templates. The replay date is an explicitly assumed fixture inside the target historical window, not a selected real demonstration start. Daylight numbers are supplied physical seconds with no UTC/Mars-clock or solar conversion. A separate directed fixture demonstrates outbound travel with no return; an explicitly simulated interrupted leg demonstrates an inconclusive search.

| Synthetic case | Result | Key value |
| --- | --- | --- |
| Baseline | `viable_model` | Elapsed 800 s; reserve 1800 s; reserved total 2600 s; mission margin 19000 s; limiting rover margin 15400 s. |
| Mission budget 2599 s | `incompatible` | Mission margin -1 s. |
| Extended assumed task 16001 s | `incompatible` | Reserved total 18001 s exceeds rover limit by 1 s; mission margin remains +3599 s. |
| Departure at 2400 physical seconds | `viable_model` | Reserved deadline exactly equals daylight end at 5000 s. |
| Departure at 2400.001 physical seconds | `incompatible` | Daylight overrun 0.001 s; no rounding to a pass. |
| Missing daylight | `insufficient_evidence` | Both required daylight checks remain missing. |
| Outbound with no return | `incompatible` | Return duration, full totals and margins are null. |
| Simulated inconclusive search | No mission assessment | Separate `search_inconclusive`; no fabricated duration. |

Run all unittest cases with `python -m unittest discover -s engine/tests -p 'test_*.py'`; also run the first three standalone check scripts above, which are not unittest cases. The new focused tests cover arithmetic, task/reserve changes, individual human/robot limits and ties, exact boundaries, absolute tolerance, missing daylight, invalid clocks/numbers, cutoff rejection, unavailable legs, immutable inputs and integration with searched routes. No HTTP service, provider, cache or shared v1 migration is included in increment 1.

Payload is additional assigned mass beyond baseline body, suit, and fixed equipment. It is checked against each participant's carrying limit, without a hidden speed penalty. `resolve_comparison` requires the same total payload in the proposal; removed participants' loads must be explicitly reassigned. Demographics, specialties, and descriptive traits add no movement effects.

The v0 JSON contracts remain untouched. The proposed v1 exchange in `docs/NAVIGATION_DESIGN.md` awaits P1/P3 review. Effort, visibility, real-data validation, prepared providers and HTTP integration remain outside this increment.
