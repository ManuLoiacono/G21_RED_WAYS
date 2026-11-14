# P1 HTTP API handoff: increment 3

Frontend consumer follow-up: [P1/P2 integration handoff](P1_P2_FRONTEND_INTEGRATION.md) documents the explicit draft consumer on `p1/http-mission-integration`, its three deliveries, verification and remaining real Gale dependencies. The original backend handoff below describes the increment-3 delivery boundary.

Date: 2026-11-14. Branch: `p2/http-service`, based on integrated main `abd987b`. Increment 3 is a local development adapter for **unaccepted draft** `p2-plan-draft-1`; shared v0 and `app/` are unchanged. The engine calculates every planning response, including synthetic cases. No fixed planning-response fallback exists in this service/client.

## Reproduce in two terminals

From the repository root with Python 3.10-3.12 and `engine/requirements.txt` installed:

```sh
# Terminal 1
python -m service
# Terminal 2
python -m service.client --case baseline
python -m service.client --case task_edit
python -m service.client --case participant_limit
python -m service.client --case exact_daylight
python -m service.client --case missing_daylight
```

On the verified Windows checkout, replace `python` with `& 'C:\Users\Usuario\anaconda3\python.exe'` in PowerShell. Full setup, request-file, PowerShell and curl commands are in [service/HTTP_API.md](../../service/HTTP_API.md).

One process owns exactly one registry/planner. Default IPv4 bind is `127.0.0.1:8000`. Allowed origins are exactly `http://localhost:5173` and `http://127.0.0.1:5173`. For alternate Vite/service ports:

```sh
python -m service --port 8001 --allow-origin http://localhost:5174 --allow-origin http://127.0.0.1:5174
python -m service.client --url http://127.0.0.1:8001 --case baseline
```

Repeated origin flags replace the defaults. The P1 service URL setting is `VITE_SERVICE_URL=http://127.0.0.1:8001`. CLI clients need no Origin. Configured-origin successes and errors carry CORS; an unconfigured origin receives 403 without allow-origin. No credentials, native timeout/cancellation or automatic retries are provided. Client timeout/disconnect does not stop an active calculation.

## Exact surface and status mapping

| Method/path | Payload |
| --- | --- |
| `GET /health` | `adapter_version`, `schema_version`, `contract_status`, `scope`, `geographic_conversion`, `registered_parcels`. No graph build. |
| `GET /parcel?id=synthetic_metric_demo&version=v1` | Exact registered identity/content version, `fixture`, metric frame/adapter, `grid` transform/policy, `masks` semantics/counts, `slope_version`, `pois`. No raster/search arrays or implicit newest version. |
| `GET /catalogs` | Exact JSON of `export_catalogs()`: `catalog` roster and `mission_templates`, with versions and assumption labels. |
| `POST /plan` | [Complete request](../../service/examples/request.example.json) to the unchanged [draft exchange](../../service/EXCHANGE_DRAFT.md). Send UTF-8 `application/json`; browser fetch supplies Content-Length. |
| `OPTIONS` on each path | 200; `GET, OPTIONS` for metadata or `POST, OPTIONS` for planning; allowed request header `Content-Type`. |

Paths have no trailing-slash aliases. `/parcel` requires one ID and exact version; other routes accept no query. Unsupported v0 produces 422 `unsupported_schema_version` until a reviewed migration/adapter is adopted.

| HTTP | Meaning |
| --- | --- |
| 200 | Calculated result including incompatible/missing-evidence/inconclusive states; inspect both `assessment` and `search_status`. |
| 400 | Malformed/duplicate/nonfinite JSON, invalid UTF-8/depth/framing or preflight headers. |
| 403 / 404 / 405 | Unconfigured origin / unknown endpoint or metadata resource / wrong method (with `Allow`). |
| 409 | `planner_busy`; no queued job or new planner. Retry explicitly after completion. |
| 413 / 415 | Body too large / unsupported media or content encoding. |
| 422 | Invalid draft input/version/query or task limit. Unknown planning parcel/scenario also uses 422. |
| 500 | Backend, reconstruction, internal context or complete-output-limit failure. No planning payload. |

Errors use `{"error":{"code":"unsupported_schema_version","path":"schema_version","message":"Only p2-plan-draft-1 is supported; v0 is not silently adapted."}}` (example HTTP 422). Do not substitute fixture cards on errors. The complete limits are 65,536 request bytes, 32 JSON nesting levels, 64 tasks, 20,000 combined route vertices and 2,097,152 serialized output bytes. Excess output fails before success headers and is never truncated. These are technical bounds, not scientific thresholds or process-memory guarantees.

## Planning paths P1 must preserve

| Response path | Meaning |
| --- | --- |
| `schema_version`, `contract_status` | `p2-plan-draft-1`, `consumer_review_pending`. |
| `request_echo.request_id`, `.revision` | Exact caller identity/revision; reject stale responses in the app. Full requested fields/overrides remain in `request_echo`. |
| `calculation_origin`, `input_provenance.fixture` | `engine` and synthetic input flag independently. ES/EN changes must preserve the calculated result. |
| `assessment`, `search_status`, `status` | Independent assessment/search state; convenience `status` is nonnull assessment, otherwise `search_inconclusive`. |
| `locations.origin`, `.destination` | Requested versus resolved cell/effective metric center. No neighbor snapping. |
| `resolved_team`, `versions`, `movement_context` | Effective participants, reproducibility versions and applied-effects identity. |
| `environment` | Full eligible as-of snapshot/clock/records and missing evidence, with classification and availability metadata. Future/verification record values are excluded. |
| `alternatives[0].coordinate_frame` | `parcel_metric`; never feed these coordinates to Cesium as lon/lat. |
| `alternatives[0].outbound`, `.return` | Separate `status`, `reason`, `cells`, `xy_m`, physical duration and aggregate metrics. Unavailable legs have empty geometry and null metrics; same-cell legs have one vertex. |
| `alternatives[0].metrics` | `elapsed_s`, `reserve_s`, `reserved_total_s`, mission/participant margins, return/deadline offsets and distinct temporal/daylight margins. |
| `alternatives[0].checks` | `rule_id`, `status`, structured reason, values/margins, participant and evidence IDs. Check statuses: `passed`, `failed`, `missing_evidence`, `not_evaluated`. |
| `movement_reuse` | Reused graph/base search only; mission evaluation still runs. |
| `not_evaluated`, `assumptions` | Scope and assumption labels. Preserve null unavailable totals/reasons. |

Calculated inspection values:

| Client case | Expected result |
| --- | --- |
| `baseline` | `viable_model`, 800 s elapsed, 2600 s including reserve, +15400 s temporal-budget margin, +2300 s daylight-return margin. |
| `task_edit` | 801 / 2601 s, +15399 / +2299 s; request revision 1 and movement reuse after baseline. |
| `participant_limit` | `incompatible`, limiting rover margin -1 s, mission margin still +19000 s. |
| `exact_daylight` | `viable_model`, daylight-return margin 0 s, temporal-budget margin still +15400 s. |
| `missing_daylight` | `insufficient_evidence`, null daylight margins and explicit missing checks. |

`temporal_budget_limiting_margin_s` excludes daylight. Do not map it silently onto the legacy combined-return `budget.margin_s`. One actual fastest candidate is returned; no effort/visibility alternatives are fabricated. Separate HTTP regressions compute found outbound/no return and same-cell routes, simulate inconclusive search and inject technical failures without static success.

## Review boundary

P1 must adopt/revise this explicit draft with P2/P3, consume central catalogs/templates, remove its integrated static fallback, preserve calculated results through ES/EN changes, validate nested nullability and map request revisions. P1 compatibility commit `1f071eb` already adds input invalidation, late-response handling and stronger v0 validation; it does not migrate the wire schema or remove all fallbacks.

Real Gale analytical/display adapters, CRS/center/mask/slope review, solar normalization and historical source availability remain P3/P1 dependencies. The P1 visual 3 x 3 km parcel/readout grid does not supply that analytical package. No app integration, geographic placement, live NASA calls, weather training/effects, radiation, communication search or simulated progression is included. Stop after increment 3 for integration review.
