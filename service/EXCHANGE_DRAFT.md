# Draft prepared-planning exchange for P1/P3 review

Status: **unaccepted draft** `p2-plan-draft-1`, distinct from shared v0 and from any future accepted v1. `service.exchange.decode_request` is the strict executable mapping. `plan_draft(PreparedPlanner(fixture_registry()), payload)` returns a calculated, finite JSON-compatible response. The local HTTP adapter and frontend explicitly consume this draft; see [HTTP_API.md](HTTP_API.md).

The additive Gale extension registers a trusted analytical package through `service.gale`.
The complete [real-terrain request](examples/gale.request.json) uses registered POIs, the unchanged
team model and a deliberately missing-daylight development scenario. A versioned
`geographic_adapter` accompanies metadata and responses (null for synthetic cases). For
`gale-eqc-scene-v1`, native equirectangular x/y map to lon/lat with the manifest radius; the
scene shift is applied once afterward. The inverse removes that shift once. Source latitude
is passed directly to Cesium Mars; no extra geodetic conversion. Vertical display offset never
changes analytical metrics. Requested metric coordinates and effective centre/elevation are
separate location fields. The frontend validates these fields before rendering. See the
[delivery evidence](../docs/handoffs/GALE_ROUTING_DELIVERY.md); paragraphs below describing
synthetic-only behavior apply to the original regression package, not the Gale extension.

## Runnable request and calculated response examples

The complete [request example](examples/request.example.json) contains explicit editable scenario inputs. Its numbers are a reproducible chosen case, not a second catalog of defaults. Central defaults remain in `engine/catalog.py` and `engine/templates.py`; `export_catalogs()` exports both original definitions.

Run from the repository root with Python 3.10-3.12 and `engine/requirements.txt`:

```sh
python -m service.example --case baseline
python -m service.example --case participant_limit
python -m service.example --case exact_daylight
python -m service.example --case missing_daylight
python -m service.example
```

The first commands each emit a full calculated response example. The last emits all five request/response pairs, including a task-only edit that reuses movement. Every invocation loads reproducible synthetic input, selects eligible records, computes/reuses engine movement and calls the engine mission evaluator. No response file or fixed planning-response fallback is used. Technical failure propagates. `calculation_origin: "engine"` describes how the result was produced; `input_provenance.fixture: true` describes its inputs. Assumed movement parameters and source evidence kinds are separate labels. A synthetic forecast is still classified as forecast context, with the scenario fixture flag retained.

| Calculated example | Assessment | Elapsed / reserved total | Budget margin / daylight return margin |
| --- | --- | --- | --- |
| Baseline | `viable_model` | 800 / 2600 s | Limiting participant +15400 s / +2300 s. |
| Task edit +1 s | `viable_model` | 801 / 2601 s | Limiting participant +15399 s / +2299 s; graph and base search reused. |
| Rover availability overridden to 2599 s | `incompatible` | 800 / 2600 s | Rover -1 s / +2300 s; mission budget still +19000 s. |
| Exact daylight boundary | `viable_model` | 800 / 2600 s | Limiting participant +15400 s / 0 s. |
| Missing daylight | `insufficient_evidence` | 800 / 2600 s | Limiting participant +15400 s / null, with both daylight checks missing. |

## Request fields

Every listed root field is required. Unknown fields at each mapped boundary, booleans as numbers, nonfinite values, unsupported capabilities and conflicting versions are rejected with code/path/message. `loads_strict` also rejects duplicate JSON keys, nonfinite constants and overflowing exponents. No legacy IDs, participants or requested features are silently dropped.

| Field | Semantics |
| --- | --- |
| `schema_version` | Exactly the string `p2-plan-draft-1`. Current v0 fails `unsupported_schema_version`, even in its legacy shape. |
| `request_id`, `revision` | Nonempty ID and nonnegative integer revision for stale-response rejection. Both echo verbatim. |
| `parcel: {id, version}` | Exact registered package identity; no path/URL or implicit newest version. |
| `scenario: {id, version, as_of_utc}` | Exact registered scenario and decision cutoff. Location/parcel association is checked. |
| `origin`, `destination` | Tagged POI or `coordinate` with `frame: "parcel_metric"` and `xy_m`. See containment in `README.md`; geographic conversion is unavailable. |
| `team` | Engine catalog version, one to four humans, zero to two robots, explicit per-member payload and optional allowlisted mission overrides. Full requested provenance is echoed. |
| `mission` | Canonical English `template_id`, exact `template_version`, explicit sequential `tasks: [{id,duration_s}]`, `time_budget_s`, `reserve_s`, `departure_utc`. No implicit restoration of defaults. |
| `criterion` | Exactly `fastest`. Effort/visibility requests are explicitly unsupported in this slice. |

The mapping is for fresh complete missions. Departure cannot precede the decision cutoff and both instants must fit the declared scenario clock mapping. The fixture's UTC-to-physical-second mapping is explicitly assumed; no local Mars clock, sol length or actual Gale georeference is inferred. Client durations, trusted movement legs, effects or assessments cannot be supplied.

## Response fields and status semantics

| Field | Semantics |
| --- | --- |
| `assessment`, `search_status` | Preserved independently from the engine. No-path is incompatible in the evaluated domain; incomplete search does not prove impossibility. |
| `status` | Explicit convenience mapping: use nonnull assessment; otherwise use `search_inconclusive`. A failed rule plus incomplete search remains incompatible with the search state still exposed. Missing daylight plus incomplete search remains insufficient evidence with the search state exposed. |
| `request_echo`, `locations` | Original request/revision/override provenance and requested versus resolved cell/metric center. No geographic geometry is fabricated. |
| `resolved_team`, `movement_context`, `versions` | Effective participants, canonical context ID, empty movement-effects set, parcel content/data/mask/slope, catalog/template/backend/movement/mission/scenario versions. |
| `environment` | Exact snapshot ID/version/cutoff/policy, declared clock mapping, normalized departure/daylight, selected decision records with observation/issue/availability/validity/fetch metadata and source location/scope/classification. Required/optional missing evidence is explicit. Excluded records appear only as counts by reason, without future/verification values or IDs. |
| `alternatives` | One actual static time-optimized candidate attempt, including separate leg states, grid cells, metric coordinates and aggregate metrics/checks. An unavailable leg has empty geometry and null metrics/reason, never a fabricated route. No effort or visibility candidate is claimed. |
| `not_evaluated`, `assumptions`, `time_abs_tolerance_s` | Unsupported properties, assumed models/availability/clock metadata and numerical policy remain visible. Passing means only viable within the model. |
| `movement_reuse` | Whether this planner instance reused graph/base search; it does not imply reuse of the mission assessment. |

`alternatives[0].metrics` separates elapsed activity from unused reserve and reserved total, mission margin and every original participant margin, estimated return offset and reserved deadline offset. `temporal_budget_limiting_margin_s` covers **only mission and participant time budgets**. `daylight_reserved_return_margin_s` covers the solar deadline, while `daylight_departure_margin_s` checks the initial interval. The exact-boundary case deliberately has +15400 s temporal-budget margin and zero daylight-return margin. No combined complete-return margin is asserted, and no silent mapping to v0 `budget.margin_s` is provided.

Missing complete movement leaves totals/margins null with `unavailable_totals_reason` and unevaluated checks. Missing daylight leaves its margins null with `missing_required` and missing-evidence checks. No CSR matrices, search/predecessor arrays or per-edge participant explanations are serialized by default. Output is normalized through finite strict JSON.

`PlanningInputError.as_dict()` provides structured input errors. Engine input errors preserve code/path when mapped. Backend/reconstruction errors and `PlannerBusyError` propagate separately. The HTTP adapter maps malformed JSON to 400, schema/input errors to 422, busy to 409 and technical failures to 500 without returning a successful plan or static fallback. See [HTTP_API.md](HTTP_API.md) for the full transport mapping and resource bounds.

## Consumer decisions still pending

P1/P3 must accept/revise draft fields, version migration, metric versus future geographic geometry, request revision handling, error mapping and the separate margin names before shared v1 integration. P3 must supply reviewed real reference/mask/solar conventions and historical availability/revision policy, with coverage/quality checks before fixing a real replay start. Communication remains the next navigation extension after baseline service integration. `app/` and its existing static fallback are unchanged for P1's later integration work.
# Additive environmental discovery

Parcel scenarios advertise `coverage: {from_utc, to_utc}` and optional `environment`
metadata (package/source identities, policy, coverage and limitations). Discovery never
publishes unfiltered daily source values or retrospective verification metrics.
This remains the consumer-review-pending development draft; shared v0 is unchanged.

Real historical `environment.decision_records` are allowlisted records. Forecast
`value` is null; the explicitly named `quantiles` object carries p10/p50/p90 with
nulls preserved. Model ID/version, variable/units, issue/target sol and lead,
`training_cutoff_utc`, `model_available_at_utc`, reconstructed `issued_at_utc`,
target `valid_from_utc`/`valid_to_utc`, effective availability and input intervals
are separate fields. Provenance includes source identity/location and reconstruction
basis. `observed`, baselines and `skill_summary` from the export are never copied.
An actual request is [gale-replay.request.json](examples/gale-replay.request.json).

`environment.provider_metadata` identifies prepared sources, policy and provider
versions. `missing_forecast_variables` explicitly lists variables without eligible,
applicable forecasts; historical observations do not fill that gap. Exclusion counts
include `unknown_availability`, `not_available_as_of`, `model_not_available_as_of`
and `outside_mission_target_interval`. Unknown evidence is not a successful forecast.
Only derived geometric daylight affects environmental mission status. Weather/RAD
remain context and do not enter graph/base-search identities.

`mission_target_interval` gives `from_utc`, optional `to_utc` and scope:
`complete_reserved_sortie` or `departure_context_only` when route duration is unavailable.
RAD target validity preserves the original fixed-longitude legacy source partition;
weather targets use the explicit corrected local-sol mapping at the issue rover location.
Per-observation unknown RAD retrieval time and analytically computed solar retrieval
are null with provenance explanations; they are never borrowed from REMS retrieval.
Forecast applicability outside the prepared parcel is excluded explicitly.
