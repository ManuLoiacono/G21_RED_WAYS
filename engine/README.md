# Team and directed movement slice

This is a Python 3.10+ development slice with NumPy/SciPy for metric grids and routing. It needs no HTTP server, browser, final Gale coordinates, or raster. All catalog values and directional speed coefficients are synthetic assumptions; see [PARAMETERS.md](PARAMETERS.md). No physiological consumption, fatigue, safety, or real robot performance is estimated.

From the repository root, run:

```sh
python -m pip install -r engine/requirements.txt
python -m engine.tests.test_catalog
python -m engine.tests.test_team
python -m engine.tests.test_movement
python -m engine.tests.test_grid
python -m engine.example
```

`engine.example` prints its complete input, per-participant edge decisions and durations, group edge maxima, and the sum of those maxima as JSON. Its `fixture: true` label is mandatory when displaying it. The functions `select_team`, `resolve_team`, `resolve_comparison`, `evaluate_edge`, and `evaluate_path` are exported from `engine`. `resolve_team` accepts the proposed v1 `team` object with `catalog_version`, `humans`, and `robots`; each participant has `profile_id`, required `payload_kg`, and optional `mission_overrides`.

Endpoint elevation is authoritative for `DirectedMetricEdge`. A contradictory supplied `rise_m` returns `inconsistent_rise`, including after reversal. The absolute tolerance is `1e-6` m (zero relative tolerance), a numerical comparison tolerance with no terrain-accuracy claim. Even within tolerance, grade uses target minus source elevation. Positive rise is uphill; `reversed()` exchanges cells and negates supplied rise. Missing essential elevation/coverage or an excluded cell blocks traversal. Each selected participant gets a permission decision, duration when permitted, structured reasons and evidence IDs. Group permission is the intersection; duration is the maximum participant duration on each edge. Sum these maxima over a path. `evaluate_path` returns per-edge results without search.

`CellTerrain.terrain_code` is optional material evidence. `None` explicitly means material is unevaluated, with no speed benefit or claim of firm ground. `coverage_valid` (default true for existing scalar callers) records essential analytical coverage separately. Optional `terrain_slope_deg` is a conservative unsigned summary, gated against the smaller ascent/descent limit for every participant, independently of directed endpoint grade.

`MetricGrid` takes matching nonempty 2D NumPy arrays: real numeric `elevation_m`, boolean `coverage` and `excluded`, and optional real numeric `terrain_slope_deg`. Inputs become read-only snapshots; numeric arrays become float64 and NumPy scalar metadata becomes Python numbers. Covered elevations/summaries must be finite. Uncovered cells, including finite nodata sentinels, remain blocked. Masks must already be boolean: an adapter must explicitly decode byte masks. Required metadata: positive `(row, column)` `spacing_m`, `(x, y)` `origin_center_xy_m` at cell `(0, 0)`, `row_direction` (`increasing_y` or `decreasing_y`), `data_version`, explicit `fixture` flag, and nonempty `aggregation_policy`. Columns increase x; indices are zero-based row-major with no snapping. No geographic conversion is supplied.

Real inputs additionally require a separate slope summary. Metadata presence is structural validation only, not P3 approval: review the policy before real-data use. A p90 slope cannot erase excluded or missing native samples. P3 must define conservative whole-cell coverage/exclusion masks, native-slope aggregation, cell-center alignment and version; this slice invents none of these layers.

Payload is additional assigned mass beyond baseline body, suit, and fixed equipment. It is checked against each participant's carrying limit, without a hidden speed penalty. `resolve_comparison` requires the same total payload in the proposal; removed participants' loads must be explicitly reassigned. Demographics, specialties, and descriptive traits add no movement effects.

The v0 JSON contracts remain untouched. The proposed v1 exchange in `docs/NAVIGATION_DESIGN.md` awaits P1/P3 review. Mission budgets, daylight, effort, visibility, and real-data validation are outside this slice.
