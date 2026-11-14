# P2-03 increment 3 handoff: bounded local HTTP adapter

Date: 2026-11-14. **Future task; HTTP has not been implemented.** Increment 2 ends at the framework-independent provider/planner/draft exchange boundary. Consumer review is required before the next implementation invocation.

Read `CLAUDE.md`, `docs/TAREAS.md`, `docs/NAVIGATION_DESIGN.md`, `docs/ENVIRONMENT_REPLAY_DESIGN.md`, `P2_03_04_MISSION_SERVICE.md`, `P2_03_INCREMENT2_PROVIDERS_AND_EXCHANGE.md`, `service/README.md`, `service/EXCHANGE_DRAFT.md` and the engine API documentation. Preserve unrelated local changes and `docs/FLUJO_TRABAJO_EQUIPO.md`; all new repository text must be English. Do not modify the app/shared v0 contracts or merge main without separate authorization.

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

Communication is the next navigation extension after the baseline service; no effort/visibility optimization, radiation model, hourly weather, weather-to-speed rule or simulated progression is part of increment 3 without another bounded task. Publish small verified deliveries to `p2/mission-service` and stop for review before expanding scope.
