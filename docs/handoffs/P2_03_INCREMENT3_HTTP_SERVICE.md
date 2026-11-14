# P2-03 increment 3 handoff: bounded local HTTP adapter

Date: 2026-11-14. **Implementation task and delivery checkpoint.** Delivery A now provides loopback startup and metadata/catalog HTTP routes; `/plan` remains delivery B. Increment 2 ends at the framework-independent provider/planner/draft exchange boundary. The integration thread reviewed the delivered documentation and independently passed the three standalone checks, 40 engine tests and 38 service tests. The project owner requested proceeding with the local HTTP adapter. Expose the existing explicitly unaccepted draft for development; P1/P3 acceptance remains required before announcing shared v1 or app/real-parcel integration, but does not block this bounded wrapper task.

Read `CLAUDE.md`, `docs/TAREAS.md`, `docs/NAVIGATION_DESIGN.md`, `docs/ENVIRONMENT_REPLAY_DESIGN.md`, `P2_03_04_MISSION_SERVICE.md`, `P2_03_INCREMENT2_PROVIDERS_AND_EXCHANGE.md`, `service/README.md`, `service/EXCHANGE_DRAFT.md` and the engine API documentation. Preserve unrelated local changes and `docs/FLUJO_TRABAJO_EQUIPO.md`; all new repository text must be English. Do not modify the app/shared v0 contracts or merge main without separate authorization.

## Current checkpoint and repository synchronization

Original P2 baseline: `a064069dec62099fa4d109c5f72afd7e3b943ceb` on `p2/mission-service`.

Updated checkpoint during delivery A: the owner reported that P2 was merged and its remote branch deleted. A successful `git fetch origin --prune` confirmed integrated `origin/main` at `abd987b719476980c883c0620caf0e7fc1a8e15e` (PR #5), containing `a064069` and P1 compatibility work `1f071eb` through PR #4. All pending files were preserved and restored onto new `p2/http-service` from that main. Continue and publish only `p2/http-service`; do not recreate/push `p2/mission-service`. The workflow draft's original bytes were verified/restored after Git newline normalization during the transition.

The user refreshed origin on 2026-11-14. Latest inspected P1/main reference is `fdc7251f53858e2c44d173913ef7c50154d4fe2f`; P1's HUD/readout changes are in `f17860a`. Read the latest upstream `CLAUDE.md` and relevant P1 source through Git refs without switching the active P2 checkout. New upstream does not alter the current planning request/response or `/plan` client. It does update the example parcel manifest and visual builder to a roughly 3 x 3 km window (137.360-137.410 E, -4.850 to -4.800), with a cursor-readout grid and inverse scene shift. The example manifest is still marked fixture. That quantized visual grid is not the reviewed P3 analytical package and does not enable a real backend adapter.

Inspect status and the recorded refs before implementation. The user's successful fetch in this integration turn is current synchronization evidence; do not ask them to repeat the same fetch merely because the execution sandbox cannot access GitHub. Refresh again if newer pushes are announced or current refs no longer match this checkpoint. If the feature ref advanced, review and fast-forward only when safe; explain any divergence rather than resetting or merging main blindly. When a genuinely newer fetch is needed and the session cannot perform it, ask for the user's working-terminal help. A fetch is not a merge, and a read of origin/main is not a claim that those files are in the P2 working tree.

P1 integration notes are local handoff documents. Include `docs/handoffs/P1_ENGINE_INTEGRATION.md`, `docs/handoffs/P1_P2_SCENE_REVIEW_c32d95f.md` and `docs/handoffs/P1_TEAM_INTEGRATION_BRIEF.md` in the first intended documentation/server commit if they are still untracked, after checking they are the intended reviewed files. The c32d95f review is historical; the human brief includes the newer fdc7251 update. Leave the unrelated workflow draft untouched.

## Three small verified deliveries

| Delivery | Scope | Completion check |
| --- | --- | --- |
| A | Reproducible loopback startup, one application-owned registry/planner, health and metadata/catalog endpoints, explicit local-origin configuration. | A second terminal can start the service; real HTTP metadata/preflight tests pass; the response identifies the draft and synthetic package honestly. |
| B | `POST /plan` around `loads_strict` and `plan_draft`, with bounded inputs/output, busy handling and distinct input/technical responses. | HTTP executes the engine, changing inputs changes calculated results, compatible/incompatible/missing-evidence cases retain their meaning, and failures never return a fixed plan. |
| C | End-to-end HTTP regression checks, portable launch/client instructions and a concise P1 API handoff with exact paths/statuses/examples. | P1 can reproduce from another terminal, request/revision is preserved, CORS covers actual requests and errors, existing checks still pass and no app/v0 mutation occurred. |

Delivery A implementation: the standard-library adapter owns one registry/planner, binds IPv4 loopback on default port 8000, serves `/health`, exact-version `/parcel` and central `/catalogs`, and handles configured local-origin preflight and errors. Real HTTP tests include separate-process CLI startup and verify metadata never builds movement. See `service/HTTP_API.md`. The intended pending P1 handoffs are included; the unrelated workflow draft remains untouched. Publication is the commit titled `Serve local draft metadata with configured browser origins`; the implementation chat records its exact verified SHA after pushing.

After each delivery, inspect the diff, run meaningful checks, stage only intended files, make a small English commit and verify its push to `p2/http-service`. Report branch, commit, checks, push outcome and next delivery. No force-push, direct main push or unreviewed merge. If publication is blocked, retain the commit and state the exact terminal command without claiming success.

Stop after increment 3 for integration review. Do not expand into geographic adapters, weather training, communication search, simulated progression or app implementation. The current implementation session can continue if it has sufficient context; otherwise use a fresh session with this handoff. Concurrent writers need separate worktrees.

## Concrete HTTP surface for development

Keep the current planning schema string `p2-plan-draft-1` and its payload semantics unchanged. The local adapter should document and provide:

| Method/path | Purpose |
| --- | --- |
| `GET /health` | Startup/version check, supported draft and adapter scope; no graph construction. |
| `GET /parcel?id=<registered-id>&version=<exact-version>` | Compact metadata, available frame/adapter, prepared POIs and declared coverage/mask policy for a registered parcel. No raster/CSR arrays or implicit newest version. |
| `GET /catalogs` | Exact central `export_catalogs()` output for the roster and four templates. |
| `POST /plan` | Strict existing draft request to the existing planner and exchange; calculated result only. |
| `OPTIONS` on supported browser routes | Configured local-origin preflight and supported methods/headers. |

Use loopback only, with default port 8000 to match the current P1 service URL. Allow the configured actual app origin, ordinarily `http://localhost:5173` and/or `http://127.0.0.1:5173`. Document origin/port configuration, including an alternate Vite port. Do not require a browser Origin header for local command-line clients. Apply appropriate CORS headers to errors as well as successful responses so P1 can inspect the actual failure.

Framework choice is local to this wrapper: prefer a small reproducible dependency footprint, record exact dependencies if added and supply a portable launch command. Own exactly one planner/registry in the serving application; do not initialize one for every request or launch multiple planning workers that duplicate graph memory.

Parse raw request JSON with `loads_strict` so duplicate keys, nonfinite numbers and overflowing exponents are rejected consistently. Enforce and document technical body/task/geometry/serialized-output limits; these are resource bounds, not scientific thresholds. Check output bounds before returning it; never silently truncate route geometry, participants or checks to make a response fit.

Use a documented error mapping: malformed JSON as HTTP 400; invalid supported-draft input/version as HTTP 422; unsupported content type as HTTP 415; oversized request as HTTP 413; unknown metadata resource as HTTP 404; active planner/busy state as HTTP 409; unexpected backend/reconstruction failure as HTTP 500. Keep structured code/path/message errors. Completed mission results, including `incompatible` and `insufficient_evidence`, remain HTTP 200 planning responses; a well-formed `search_inconclusive` result preserves its separate state. An actual technical failure is never a successful plan.

Preserve the existing one-job busy boundary instead of building an unbounded queue. Never claim that disconnecting a client cancels native SciPy work. Required focused tests include repeated calls reusing one planner, a concurrent busy case, rejected malformed/schema/body input and a backend failure that cannot become a static fallback.

## Delivered foundation and reproduction

Increment 1: `69ba3b9`. Increment 2 delivery A: `008b6c81871ecbf92b3d049f6edd6d5475b4508c`; B: `29665f30313d8898087bfe0ebe3d32e770f4d38c`. Both A/B were pushed and independently matched with `git ls-remote`. Delivery C is titled `Map draft planning exchange to calculated engine examples`; the implementation chat records the exact SHA/publication after commit. Confirm the current feature head against the remote before proceeding; do not guess a self-referential hash here.

Public APIs: `fixture_registry()`, registered parcel/scenario lookup, `resolve_location`, `select_scenario`, `PreparedPlanner.plan`, `plan_draft`, `loads_strict`, `export_catalogs`. The registry loads only service-owned synthetic packages. Real/geographic adapters are unavailable. The planner holds at most one graph and one complete base search, clearing incompatible references before replacement; tasks/departure/reserve/destination can reuse movement, with mission evaluation recalculated. Canonical effective-team/context and graph/base association are checked. A planner instance rejects overlapping work with `PlannerBusyError`; a later service must own exactly one instance rather than multiplying memory through per-request instances.

Run from the root using Python 3.10-3.12 with `engine/requirements.txt`:

```sh
python -m engine.tests.test_catalog
python -m engine.tests.test_team
python -m engine.tests.test_movement
python -m unittest discover -s engine/tests -p 'test_*.py'
python -m unittest discover -s service/tests -p 'test_*.py'
python -m service.example
python -m service.example --case exact_daylight
```

All three standalone checks, 40 engine tests and 38 service tests passed. All existing engine examples and the new CLI cases produced finite JSON. Fresh-process CLI reruns matched. No large benchmark was repeated. Examples are engine calculations using synthetic inputs, with separate calculation origin and input provenance; no fixed planning-response fallback exists.

The baseline has 100 s outward, 600 s tasks, 100 s return, elapsed 800 s, reserve 1800 s and reserved total 2600 s. Mission margin is +19000 s, limiting rover temporal-budget margin +15400 s, daylight reserved-return margin +2300 s. Task +1 s changes margins by -1 s and reuses movement. Rover availability 2599 s fails by 1 s. Exact sunset equality passes with daylight margin 0 and temporal-budget margin still +15400 s. Missing daylight yields insufficient evidence. Tests additionally calculate disconnected routes and simulate search interruption/backend failure without a static response.

## Bounded next increment

Implement a loopback-only adapter around the existing planner/exchange, using one application-owned registry and planner. Expose `/plan`, `/parcel` and catalog/template access. Decide framework/dependencies in that task, then provide reproducible launch instructions and HTTP tests. Handle configured local browser origins and JSON `OPTIONS` preflight explicitly. No live remote call belongs inside planning.

Make the supported draft version explicit. The current app emits v0; it is **not integrated** with this draft. Keep unsupported-schema errors until P1 accepts the new fields or a separately reviewed/tested compatibility mapping is authorized. Do not rename legacy IDs, drop participants/capabilities or reinterpret v0 margin fields silently. P1 will address its existing static fallback during integration; leave `app/` unchanged in this scope.

Bound request body/task/geometry output sizes in the HTTP task. Map structured input errors, incompatible mission results, inconclusive search, busy state and technical failure distinctly. Preserve `assessment` and `search_status`; never return a fixed plan after a technical failure. Serialize expensive work or use the existing instance busy gate without queuing unbounded jobs. Temporary SciPy memory, input arrays and caller-held route objects add to retained graph/search storage. Client disconnect/timeout does not prove cancellation of the native search, and this code promises no timeout/cancellation API.

Keep responses compact: no CSR/predecessor arrays or full per-edge participant details. Return the actual computed candidate and null unavailable metrics with reasons. Preserve request identity/revision, full as-of evidence metadata, model/catalog/scenario versions, requested/resolved coordinates, fixture provenance and assumed capability labels. `temporal_budget_limiting_margin_s` excludes daylight; do not present it as the complete remaining-return margin.

## Decisions needed from P1/P3

- Accept/revise the explicit draft request/response/status/error mapping and English migration, central catalog/template consumption, request revision handling and separate budget/daylight margin names.
- Confirm P3's real CRS/planetary conventions, cell-center origin, row/column transform, boolean mask decoding and conservative slope/coverage/exclusion aggregation before enabling a real parcel adapter.
- Confirm actual evaluation location and UTC/physical/Mars-clock solar normalization with explicit epoch/method/version. Fixture mappings are assumed and do not apply to Gale.
- Define archival versus reconstructed per-record availability, event/revision identity, scenario packages and common 2025 coverage/quality before selecting a real replay start. Temperature/pressure remain context, future daily summaries/verification remain excluded, and forecasts may validly describe future intervals when issued/available as of cutoff.

Communication is the next navigation extension after the baseline service; no effort/visibility optimization, radiation model, hourly weather, weather-to-speed rule or simulated progression is part of increment 3 without another bounded task. Publish small verified deliveries to `p2/http-service` and stop for review before expanding scope.
