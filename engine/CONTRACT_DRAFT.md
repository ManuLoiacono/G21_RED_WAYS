# P2-01 proposed exchange additions for P1/P3 review

Status: **draft**, not an accepted v1 contract. Existing `contracts/` v0 files and the working app are unchanged.

## Team request

The proposed `team` object in `docs/NAVIGATION_DESIGN.md` is the input to `resolve_team`: `catalog_version`, `humans`, and `robots`. Each selected entry has a `profile_id`, required `payload_kg`, and optional `mission_overrides`. IDs are immutable catalog identities; permitted overrides are `flat_speed_m_s`, `max_ascent_deg`, `max_descent_deg`, `carrying_limit_kg`, and `max_sortie_s`. Every numeric field is finite, booleans are not numbers, and field suffixes are the accepted units. Unknown fields and alternative unit names are rejected. A comparison requires the same total payload with explicit reassignment.

The catalog currently contains synthetic development presets only. P1 should consume a single published catalog representation rather than copying these Python values into TypeScript. The service may later expose a versioned catalog endpoint or package a generated JSON snapshot; the delivery mechanism and avatar assets require review. The four English template IDs now have centralized, explicitly synthetic editable defaults in `engine/templates.py`, exported by `export_mission_templates()`; adoption by the shared consumer is still pending review.

## Directed edge input and result

`DirectedMetricEdge` takes source/target `CellTerrain` records (`terrain_code`, `elevation_m`, `excluded`, `coverage_valid`, optional `terrain_slope_deg`), positive horizontal `run_m`, and signed `rise_m`. Endpoint elevations determine grade; inconsistent supplied rise returns `inconsistent_rise` (absolute numerical tolerance `1e-6` m, not measurement accuracy). Reversal negates supplied rise. Missing essential elevation/coverage and exclusion block traversal. Material classification is optional: `terrain_code=None` means unevaluated material without a claim of firm ground or speed benefit. This positional extension intentionally removes the old `missing_terrain` rejection; empty supplied labels are invalid. P3 must review the coverage/material separation before real-data integration.

Proposed adapter target: `MetricGrid` with elevation, boolean coverage and exclusion masks, separate conservative terrain-slope summary, metric row/column spacing, `(0,0)` cell-center x/y, row direction, data version, fixture flag and explicit aggregation/mask policy. See `README.md`. These are engine fields, not an accepted shared schema. Do not guess a half-cell offset from v0 `origin_xy_m`, convert coordinates, invent masks/material classes or apply the Cesium display offset. Material rasters are not ingested. Terrain summaries gate each participant against the smaller ascent/descent limit independently of directed grade; real input requires a summary and policy review.

`evaluate_edge` returns `allowed`, `duration_s` or null, `participant_results`, `limiting_participant_ids`, and structured reasons (`code`, `path`, `message`, optional `participant_id`). Each participant result includes `evidence_ids`. Search may use `duration_s` only for allowed edges; it is strictly positive. The group result is the intersection of permissions and the maximum participant duration on that edge. A path duration is the sum of those maxima.

The current movement strategies are explicitly assumed formulas. Carrying capacity is validated, but load-dependent speed, energy, fatigue, oxygen, battery and relative effort are **not evaluated**. If P1 displays a capacity or speed value, it must retain the synthetic assumption label. The pure mission evaluator now checks every participant's `max_sortie_s` against full elapsed time plus required reserve.

## Complete-mission engine records (increment 1)

These Python records are an engine API, **not an accepted wire request/response schema**. `evaluate_mission` takes `RoundTripRoutes` for the supplied effective participants, sequential `MissionTask` records, positive mission budget, nonnegative reserve, normalized `Departure`, optional `DaylightWindow` and a `SnapshotReference`. The reference identifies the exact historical replay snapshot/version/cutoff and declared availability/location; it does not implement a scenario provider. Daylight is required evidence even though its argument permits `None` to represent absence.

Departure and daylight share an explicit epoch, physical-second unit and elapsed-since-epoch convention. Location IDs must agree with the snapshot. The evaluator rejects mismatches and does not convert local solar clocks or infer location. Snapshot availability must be no later than the UTC decision cutoff; the future provider remains responsible for record/revision eligibility and availability policies. Synthetic fixtures claim no archived NASA availability.

The result separates `elapsed_s` from `reserved_total_s`, mission and per-participant margins, limiting budget paths/participants, estimated return from reserved deadline, `assessment` from `search_status`, all structured checks, snapshot/daylight metadata, versions, fixture label, assumptions and `not_evaluated`. A failed mandatory rule is incompatible even when other checks remain missing or unevaluated. Otherwise missing daylight gives insufficient evidence; otherwise an incomplete search has a null assessment. Inconclusive search stays explicit independently of assessment. There is no implicit conditional acceptance. Missing movement duration leaves all complete-mission totals/margins null. Technical reconstruction errors are not mission results.

All comparisons use absolute 1e-6 seconds with no relative tolerance; reported margins remain unrounded. Reserve is unused margin and applies to daylight and every original temporal limit, including robots during tasks. A passing result is only `viable_model`. See `README.md` and `python -m engine.mission_example` for reproducible synthetic inputs/results. Consumer mapping, schema negotiation, providers and HTTP remain subsequent increments.

## Open integration semantics

- P1/P3 must accept or revise names, enum values, catalog delivery and result structure before a shared v1 schema replaces v0.
- P3 must review optional material classification separately from mandatory coverage/exclusions and conservative native-slope summaries; material stays unevaluated without an agreed layer and rule.
- P3 must supply or define a normalized physical-second daylight interval and actual parcel location/method. Local clock strings cannot be added directly to travel seconds. The new evaluator checks participant `max_sortie_s` over outbound, sequential tasks and return, with reserve as required margin; the real normalization/provider is still pending.
- Avatar references are stable keys without image assets yet. No identity attribute automatically changes a capability or task duration.
