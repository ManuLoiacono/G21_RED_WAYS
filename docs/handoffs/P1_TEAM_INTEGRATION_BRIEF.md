# P1 / P2 integration brief

Checkpoint update during HTTP delivery A (2026-11-14): integrated main is now `abd987b`, containing P2 `a064069` and P1 compatibility `1f071eb`. The latter adds input invalidation, late-response handling and stronger v0 response validation; those items below describe the earlier review and need not be repeated blindly. The app still emits v0 and retains its static network/language fallback. HTTP implementation now continues on `p2/http-service`; use `service/HTTP_API.md` for current availability. The historical scene reviews remain unchanged.

## Purpose

Connect the Cesium application to the navigation and complete-mission results produced by P2. This brief is intended for the teammate responsible for P1, rather than as a prompt for an AI session. It contains the implementation changes, current exchange, dependencies, responsibilities and joint acceptance checks in one place.

Prepared on 2026-11-14. Initial P1 source reviewed: `c32d95f`; updated upstream review: `fdc7251` on `origin/main` (HUD/readout work in `f17860a`). P2 exchange inspected: `a064069` on `p2/mission-service`. The draft baseline example was calculated while preparing this brief. This is source/example review, not completed browser-to-service integration.

Latest P1 update: the visual/default example parcel is now roughly 3 x 3 km (137.360-137.410 E, -4.850 to -4.800), superseding the earlier 1.8 km default. The HUD, layer controls and cursor readout now exist. The readout already inverse-shifts scene picks into native DTM coordinates; reuse/review that convention for the route adapter instead of introducing a conflicting one. Its quantized visual elevation grid is display-only, not an automatically accepted backend analytical package. Planning v0, static fallback and language/result issues described below remain unchanged by this update.

## 1. Current status and the intended result

P1 already has the Cesium scene, optional HiRISE detail mesh, mission form, alternative selection, route drawing and live ES/EN display.

P2 now has the fixed team catalog, payload and mission validation, directed grid routing with separate outbound/return searches, complete-mission budgets/daylight checks, prepared synthetic providers, bounded movement reuse and an executable draft JSON exchange.

HTTP is the next P2 increment and is **not available yet**. The current draft provides metric geometry only; a reviewed real Gale geographic adapter is **not available yet**. A calculated synthetic response can drive result components now, but its metric coordinates cannot be passed to Cesium as longitude/latitude.

The first integrated user flow will be: choose a prepared parcel and mission, select the team and loads, request planning, then see the calculated paths and the reasons for acceptance/failure. All displayed planning results must come from actual engine calculations using reproducible synthetic or real prepared inputs.

## 2. Ownership

| Owner | Responsibility |
| --- | --- |
| P1 | Form, team selection, result cards, route/marker display, language, request lifecycle and display adapter. |
| P2 | Python engine, prepared planner, catalog/templates, draft exchange, service and calculated metrics/reasons. |
| P3 | Real analytical parcel, masks/slope summaries, georeference/control points, normalized solar/time inputs and environmental source preparation. |
| Together | Exchange-version adoption, coordinate-frame ownership, error mapping and the joint integration exercise. |

Work in a P1 branch such as `p1/engine-route-integration`, in the P1 checkout. Publish small verified deliveries and use the team's review before main integration. Do not switch branches in the directory where P2 is actively writing.

All new code, identifiers, comments and developer documentation are English. UI text belongs in matching ES/EN dictionaries. Existing shared v0 wire values remain unchanged unless the team adopts an explicit new version/adapter; changing display language must not translate wire IDs.

## 3. Required app changes

### A. Calculated synthetic results and explicit errors

- Separate `calculation_origin: "engine"` from `input_provenance.fixture: true` and from assumed capability/model labels.
- Synthetic means the inputs are test data, not that the response was written in advance. The engine must calculate it for the actual request.
- Remove the integrated flow's automatic static planning-response fallback. If the service is unavailable, show an error; synthetic mode also requires the planner.
- Static files may remain isolated unit/schema test inputs, but must not supply a replacement mission result to the user.

Current relevant modules: `app/src/mission/api.ts`, `app/src/mission/results.ts` and `app/src/main.ts`.

### B. Preserve the result across ES/EN changes

Current `main.ts` treats `simulated || response.fixture === true` as a reason to reconstruct cards from `simulatedResponse(destination_poi)` when language changes. This can replace a computed synthetic result with fixed content while leaving its route on the map.

Change language by translating labels and structured reasons only. Preserve request ID/revision, numeric results, geometry, active alternative and input state. Prefer stable reason codes plus supplied numeric parameters, with a documented English fallback for unknown codes.

### C. Team selection and central defaults

- Select one to four distinct humans from the four predefined characters.
- Select zero to two distinct robot units: light support rover and transport rover.
- Character identity is fixed; there is no character editor or creation workflow.
- Assign additional payload per participant and expose only agreed mission overrides. The current allowlist includes speed, ascent/descent limits, carrying limit and temporal availability.
- Consume P2's versioned catalog and central four mission templates. Do not maintain another independent set of default capabilities/task durations in TypeScript.
- Demographics and specialty are descriptive; they introduce no automatic physiological penalty or task bonus. Operational defaults are explicitly synthetic assumptions.

Current relevant modules: `mission/types.ts`, `mission/panel.ts`, `mission/templates.ts` and `mission/request.ts`.

### D. Rich mission states and nullable results

- Preserve overall `assessment` and independent `search_status`.
- Handle each leg separately: `found`, `no_path_in_domain` or `search_inconclusive`.
- A found outbound leg does not guarantee a return leg or a compatible mission.
- Unavailable metrics are null and accompanied by reasons, never zero or invented geometry.
- Draw only available multi-point legs. Same-base/destination results may have one point and zero travel; do not create an invalid line or an artificial segment.
- If only one actual candidate was calculated, show one. Effort and visibility alternatives are not implemented yet.

Current relevant modules: `mission/response.ts`, `mission/results.ts` and `mission/routes.ts`.

### E. Show the right margins

The engine distinguishes:

| Output | Meaning |
| --- | --- |
| `elapsed_s` | Outbound + sequential tasks + return activity. |
| `reserve_s` | Required unused temporal margin, not an extra simulated task. |
| `reserved_total_s` | Activity plus required reserve. |
| `mission_margin_s` | Mission budget minus reserved total. |
| `participant_margins` | The same check against each human/robot's original temporal availability. |
| `temporal_budget_limiting_margin_s` | Minimum of mission and participant temporal-budget margins only. |
| `daylight_reserved_return_margin_s` | Remaining margin against the reserved solar deadline. |
| `daylight_departure_margin_s` | Whether departure is inside the enabled interval. |

A positive temporal-budget margin does not imply remaining daylight. The exact-daylight-boundary example has +15400 s temporal-budget margin but 0 s daylight-return margin. Show those values separately rather than silently reusing v0 `budget.margin_s` for a different quantity.

### F. Invalidation and response identity

- Keep an explicit Plan mission action, rather than recalculating on every keystroke or camera movement.
- Every relevant edit invalidates or marks the previous result stale: team, loads, tasks, budget/reserve, departure, scenario, base, destination or parcel.
- Send request ID/revision and reject late responses for an old revision.
- A language-only change preserves the current calculation.
- Validate nested response structure, finite numbers, leg status and nullability before rendering. The current top-level-only validator is insufficient for the new response.

## 4. Geographic agreement before drawing real routes

The new P1 mesh builder reports the following **parcel-specific** comparisons. These measurements were reported by P1 and inspected in code/documentation; they were not independently reproduced during this review.

| Products compared | Reported relation |
| --- | --- |
| Native DTM to Cesium scene | Mesh script adds projected x/y offsets -25 m / +35 m and height +56.2 m; reported fit over 144 points, residual spread about 0.9 m. |
| Curiosity waypoints relative to DTM | Approximately -43 m east / +33 m north and waypoint `elev_geoid` approximately DTM -17.9 m. |
| Earlier Cesium versus Curiosity height check | Approximately +71.2 m; a different source comparison, not a universal DTM-to-scene offset. |

Do not substitute or combine these numbers by assumption. The generator records the relevant offsets and native/display bounds in `metadata.json`; its horizontal offsets are applied in projected coordinates before division by its declared Mars radius.

Proposed responsibility split for confirmation: P2 provides native analytical geometry with frame/data-version metadata; P1 applies the agreed display registration exactly once and its inverse for map picks; P3 confirms source/reference and transform semantics. If the service instead provides explicitly tagged display geometry, P1 must not transform it again.

Required details:

- The engine's elevation, slopes, travel costs and visibility remain in the native analytical reference. No scene shifts enter the graph.
- Clamped polylines use scene heights. Do not add another vertical correction to analytical heights and then clamp them.
- Markers/models need one declared visual-height strategy; source waypoint POIs need their own source-to-analytical mapping.
- Scene-picked coordinates must map back to the intended analytical cell. Show explicit out-of-domain/missing/excluded errors; do not choose a nearby passable cell invisibly.
- Read the active parcel extent/version and enabled analytical coverage, rather than treating all visible Cesium terrain as navigable.
- Confirm visual and analytical bounds: as of `fdc7251`, the mesh script/example manifest use a 0.05 by 0.05 degree window, roughly 3 by 3 km. The manifest is still a fixture and the 1500 by 1500 benchmark remains synthetic; neither proves a reviewed analytical adapter is ready.
- Synthetic metric coordinates are not Gale lon/lat. Until the real or explicitly synthetic display adapter is agreed, show metric results without pretending they have a real geographic placement.
- Registrations are local to the reviewed parcel, not constants for all Gale.

## 5. Current executable exchange

The available exchange is the explicit **draft** `p2-plan-draft-1`, not accepted shared v1. The current app's v0 request is incompatible until the team adopts this draft or agrees a tested adapter. P1 feedback is requested before migration.

Authoritative files on `p2/mission-service`:

- `service/EXCHANGE_DRAFT.md`: full fields, statuses, errors and limitations.
- `service/examples/request.example.json`: runnable example request.
- `service/exchange.py`: executable strict request/response mapping and catalog export.
- `service/example.py`: examples calculated on each invocation.
- `engine/catalog.py` and `engine/templates.py`: central defaults.

For reference, the current valid synthetic request is:

```json
{
  "schema_version": "p2-plan-draft-1",
  "request_id": "synthetic-baseline",
  "revision": 0,
  "parcel": {"id": "synthetic_metric_demo", "version": "v1"},
  "scenario": {
    "id": "synthetic_replay",
    "version": "v1",
    "as_of_utc": "2025-10-25T12:00:00Z"
  },
  "origin": {"type": "poi", "poi_id": "base"},
  "destination": {"type": "coordinate", "frame": "parcel_metric", "xy_m": [31, 1]},
  "team": {
    "catalog_version": "synthetic-team-v1",
    "humans": [{"profile_id": "explorer_01", "payload_kg": 0}],
    "robots": [{"profile_id": "support_rover", "payload_kg": 0}]
  },
  "mission": {
    "template_id": "reconnaissance",
    "template_version": "synthetic-mission-templates-v1",
    "tasks": [{"id": "visual_reconnaissance", "duration_s": 600}],
    "time_budget_s": 21600,
    "reserve_s": 1800,
    "departure_utc": "2025-10-25T12:00:00Z"
  },
  "criterion": "fastest"
}
```

Important response paths for the app adapter:

| Path | Use |
| --- | --- |
| `schema_version`, `contract_status` | Draft version/consumer-review status. |
| `calculation_origin` | Currently `engine`; independent of synthetic data. |
| `input_provenance.fixture` | Explicit synthetic input label. |
| `assessment`, `search_status`, `status` | Separate assessment/search and a documented convenience mapping. |
| `request_echo`, `locations` | Request identity/override provenance and requested/resolved positions. |
| `resolved_team`, `versions`, `movement_context` | Effective participants and reproducibility context. |
| `alternatives[0].coordinate_frame` | Currently `parcel_metric`; geographic conversion is unavailable. |
| `alternatives[0].outbound` and `.return` | Leg status, cells, `xy_m`, duration, horizontal distance, ascent/descent or null metrics/reason. |
| `alternatives[0].metrics` | Activity, reserve, temporal-budget and daylight metrics. |
| `alternatives[0].checks` | Rule IDs, status, code/path/message, participant, numeric values and evidence IDs. |
| `environment` | Exact as-of snapshot, selected records, source classification, normalized clock/daylight and missing evidence. |
| `not_evaluated`, `assumptions` | Explicit limits; no unimplemented capability should be implied. |

The new check statuses are `passed`, `failed`, `missing_evidence` and `not_evaluated`, rather than blindly reusing the v0 `ok`/`violated` renderer. Missing complete travel leaves totals null. No full CSR/search arrays or per-edge participant objects are sent in the normal response.

P1 should review the names, status mapping, team input, frame handling and margin separation with P2/P3 before treating this as the accepted exchange. Unknown fields/versions and unsupported criteria fail explicitly; no participant or capability is silently dropped.

## 6. Obtain and reproduce P2 examples

Use a separate reference checkout rather than merging unfinished backend work into the P1 branch. One option from an existing repository clone is:

```sh
git fetch origin --prune
git worktree add --detach ../G21_P2_reference origin/p2/mission-service
cd ../G21_P2_reference
```

Use Python 3.10-3.12 from a suitable environment, install `engine/requirements.txt` if needed, then run:

```sh
python -m pip install -r engine/requirements.txt
python -m service.example --case baseline
python -m service.example --case participant_limit
python -m service.example --case exact_daylight
python -m service.example --case missing_daylight
python -m service.example
```

Every command calculates its result through the engine from the prepared inputs. The last command includes all five request/response pairs, including a +1 s task edit and movement reuse. These are calculated inspection/test examples, not a user-facing response fallback.

To export the central roster and templates from the same reference checkout:

```sh
python -c "import json; from service.exchange import export_catalogs; print(json.dumps(export_catalogs(), indent=2, allow_nan=False))"
```

Expected diagnostic cases:

| Case | Result to display |
| --- | --- |
| Baseline | `viable_model`; 800 s activity, 1800 s reserve, 2600 s reserved total; limiting participant margin +15400 s; daylight margin +2300 s. |
| Task +1 s | Activity/reserved total increase by 1 s; relevant margins decrease by 1 s; movement can be reused. |
| Participant limit | Rover fails by 1 s even while the general mission budget passes. |
| Exact daylight | Daylight-return margin is 0 s, while temporal-budget margin remains positive. |
| Missing daylight | `insufficient_evidence`; missing daylight margins remain null. |

Additional engine tests cover no return, disconnected domain and interrupted search; P2 will provide agreed wire cases for joint UI verification. Do not invent a route to make the UI look populated.

## 7. Historical environment and scope

The target demonstration is a historical replay between 2025-10-25 and 2025-12-05; its final real start remains subject to common coverage/quality checks. UTC decision cutoff, UTC departure, physical elapsed seconds and Mars local-time display are distinct.

The provider must exclude observations not yet complete/available and later forecast/event revisions. The app displays the returned eligible snapshot and preserves the distinction between observed context and forecasts. Daily extrema do not establish hourly weather. Pressure/temperature are context until a justified effect is adopted; DONKI is warning context, not an automatic radiation calculation or mission veto. Radio coverage, radiation dose and weather-speed effects are not implemented.

Communication is the next planned navigation extension: known-visible, known-hidden and unknown geometric visibility, with interruption metrics. It is not proven radio performance and should not block the first baseline integration.

## 8. Delivery sequence and joint checks

1. P1 can immediately fix calculated-synthetic labeling, language preservation, service-error behavior and stale-result lifecycle. Publish a small verified P1 commit.
2. Review the available draft with P2/P3, then adapt team/result components and runtime validation. Publish another small verified commit. Do not silently replace shared v0.
3. P2 supplies the HTTP adapter, launch instructions, supported routes and configured CORS. The increment-3 development target is `POST /plan`, `GET /parcel?id=...&version=...`, `GET /catalogs` and `GET /health`, with the existing explicit draft schema. These routes are not implemented yet; P2 will verify and publish the exact HTTP behavior before integration.
4. P3 confirms real geographic/time adapters and the shared parcel. Agree the one display-registration owner.
5. Run the app-to-service-to-engine exercise: control points; changed team/task; participant failure; missing daylight; unavailable return; ES/EN preservation; stale response rejection; stopped-service error.
6. Verify the presentation startup serves the optional HiRISE mesh. It is currently generated locally and served by Vite in development, not automatically packaged in production output.

Report commit/branch, checks, request/example IDs, coordinate/contract decisions and remaining dependencies. Integration is complete when the app actually uses the calculated result, not merely when its components work separately.

## 9. Decisions requested from P1

- Confirm/revise the draft field/status/nullability mapping and the proposed central catalog/template consumption.
- Confirm P1 ownership of analytical-to-display registration and inverse map-pick conversion, subject to P3 metadata review, or propose a single alternative owner.
- Confirm the result presentation keeps temporal-budget and daylight margins separate and preserves results across language changes.
- Agree the baseline UI sequence and share the P1 branch/commit for the first joint check.

P2 will supply backend/contract clarifications and updated executable examples as review progresses. No AI chat history is needed to act on this brief.
