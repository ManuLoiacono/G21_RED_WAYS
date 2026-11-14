# P2-03/04 increment 2: prepared providers and draft exchange

Date: 2026-11-14.

## Reviewed baseline

Continue on `p2/mission-service` from `69ba3b9e835f54b92aea9323320b47d573f7e9ef`. Increment 1 is complete and reviewed as a synthetic engine slice. The integration thread independently ran the three standalone checks, all 40 unit tests, all three strict finite-JSON examples and repeatable mission-example evaluation. All passed. Local HEAD and `origin/p2/mission-service` match; the tracking-ref reflog records a successful push. The integration thread did not repeat the large performance benchmark.

Before increment 1, routes described movement only. The current evaluator also checks sequential tasks, mission/participant temporal limits, required unused reserve and normalized daylight. It preserves missing evidence and incomplete search separately. The examples demonstrate that a rover can exhaust its available margin while the mission-level budget still passes. Real parcel, record-level historical availability, geographic/time normalization and UI consumption remain unresolved.

Read `CLAUDE.md`, `docs/TAREAS.md`, `docs/NAVIGATION_DESIGN.md`, `docs/ENVIRONMENT_REPLAY_DESIGN.md`, `engine/README.md`, `engine/CONTRACT_DRAFT.md` and the completed increment 1 section of `P2_03_04_MISSION_SERVICE.md` before editing. This is an increment-2-only continuation, not permission to implement increment 3 or change the teammate-owned app/shared v0 contracts.

## Goal

Provide a bounded, reproducible path from a draft planning request to registered prepared terrain/environment inputs, searched movement and mission assessment. Make the exchange concrete enough for P1/P3 to review. Work without HTTP or live API calls; the next increment will expose these functions through the local service.

Use prepared synthetic fixtures until P3's real adapter metadata is confirmed. A passing fixture pipeline is not real-parcel integration and does not finalize the shared v1 contract.

## Small deliveries and scope

| Delivery | Work | Verification |
| --- | --- | --- |
| A | Prepared parcel/scenario interfaces, registered fixtures, immutable context identity and coordinate/time adapter boundaries. | Known cell centers/borders and explicit metadata match; wrong parcel/location/epoch and unsupported adapters fail; no invented real transformations. |
| B | Bounded graph/base-search reuse and per-record as-of scenario selection. | Task-only edits reuse searches; effective movement configuration/base changes invalidate correctly; future observation/forecast revisions never enter decision inputs. |
| C | Draft request/response examples, strict wire mapping and an end-to-end command-line example. | Compact finite JSON preserves separate assessment/search state, team, versions, all relevant margins, missing evidence and synthetic assumptions. |

Publish each coherent completed delivery with relevant checks, a small English commit and a verified push to `p2/mission-service`. Include this handoff and the companion integration-handoff update in the first intended commit if pending. Preserve `docs/FLUJO_TRABAJO_EQUIPO.md`; do not stage unrelated changes. No force-push, direct main push or unreviewed merge.

Report what changed, checks, branch, commit and actual push result after each delivery. If credentials/network fail, retain the local commit and provide the user's terminal command. Stop after increment 2 and return a handoff before HTTP implementation. Reuse the current implementation session if its context is sufficient; simultaneous writers need separate worktrees.

## Ownership and schema status

Delivery A implementation: registered service-owned synthetic parcel/scenario packages, immutable metadata/content identities, half-open metric containment and an explicit assumed UTC/physical-second mapping are implemented under `service/`. Seven focused prepared-input tests pass; the existing 40 engine tests also pass. See `service/README.md` for API, boundary semantics and limitations. Real/geographic adapters remain unavailable. This delivery includes both pending handoff documents and preserves the unrelated workflow draft. Publication is the commit titled `Register prepared synthetic parcel and scenario boundaries`; the implementation chat records its exact verified SHA after pushing.

Delivery B implementation: per-record cutoff selection and `PreparedPlanner` now provide one retained graph/base search, canonical effective-team association and fresh engine mission evaluation. Tests observe build/search calls for reuse/invalidation, reject stale team/search association and check clearing before replacement. Availability, observation completion, issue/revision selection, future-valid forecasts, verification exclusion and explicit reconstructed availability are tested independently. Fresh departure cannot precede the decision cutoff. All 26 service tests pass. No fixed planning-response fallback exists: synthetic input provenance and engine calculation origin remain separate. Publication is the commit titled `Select as-of records and bound movement reuse`; exact push verification is recorded in the implementation chat.

Delivery C implementation: strict `p2-plan-draft-1` request/response mapping, compact finite JSON, central catalog/template export and five calculated CLI examples are implemented. All examples invoke the engine; tests verify changed-input results and backend failure propagation without a fallback. `calculation_origin="engine"` is separate from synthetic input provenance. Temporal-budget and daylight margin fields are explicitly distinct, including the zero-daylight-margin boundary case. All 38 service tests and 40 engine tests pass, along with the three standalone engine scripts and finite/repeatable examples. See `service/EXCHANGE_DRAFT.md` for the runnable request/response examples and `P2_03_INCREMENT3_HTTP_SERVICE.md` for the next bounded handoff. Delivery C is titled `Map draft planning exchange to calculated engine examples`; its exact verified SHA is reported after publication. Increment 2 stops here; no HTTP or app/v0-contract change is included.

- Implement provider/orchestration/exchange logic under `service/` as framework-independent modules. Only make narrowly necessary engine changes, preserving existing APIs or documenting a justified compatible extension.
- Add small local fixture packages under an explicitly synthetic service-owned fixture directory. Do not claim ownership of P3's `scripts/` or real `data/processed/` products.
- Keep existing `contracts/` v0 and `app/` unchanged. Draft schema/examples may live under `service/` and must state that consumer acceptance is pending.
- Support an explicit draft request version. Do not silently accept current v0 requests as team-aware requests. Unsupported versions fail with a structured code until an explicit reviewed adapter exists.
- Export or reuse `CATALOG` and `export_mission_templates()` from one authoritative source; do not create a separate TypeScript/default catalog here.
- Do not add HTTP, a UI, an ML trainer, effort/visibility optimization, simulated progression or a radiation model.

## Prepared parcel and coordinate boundary

1. Resolve only registered parcel IDs and their versions. A planning request selects a prepared package, not arbitrary files, a URL or an invented georeference.
2. The package supplies the `MetricGrid`, prepared POIs, reference metadata, coverage/exclusion policy and an explicit coordinate adapter. Preserve native analytical geometry and do not apply the Cesium ~71 m display offset.
3. A real adapter requires P3-confirmed CRS/planetary conventions, metric cell-center transform, row/column order, mask decoding and conservative slope/exclusion aggregation. An opaque version string alone does not establish those semantics. Leave real-data support explicitly unavailable if those items are not confirmed.
4. For fixtures, a declared synthetic affine transform or grid-index request can demonstrate the pipeline. Label synthetic geographic positions explicitly; do not assume the fake transform applies to Gale. If using only metric fixture inputs, report geographic conversion as unavailable rather than fabricating lon/lat.
5. Tagged POI versus coordinate locations must resolve through the same validated domain/coverage rules. Preserve requested location, effective cell and effective cell-center coordinates. Specify the containment/boundary convention; do not search for a nearby passable cell or silently cross obstacles to snap a request.
6. Return deterministic structured failures for unknown parcel/POI, outside coverage, missing/excluded endpoint or unavailable coordinate adapter. Distinguish endpoint invalidity from a completed search with no path.

## Movement/team association and bounded reuse

The current `RoundTripRoutes` does not carry a team fingerprint. Its association with the effective participants is an explicit caller precondition, not a verified invariant inside `evaluate_mission`. Enforce it in the orchestration/provider boundary before returning or reusing a result.

- Resolve the selected team through `resolve_team`; clients must not inject trusted engine `RouteLeg` durations or a completed assessment.
- Define canonical context identity including parcel/data/mask versions, analytical resolution, movement backend/version, effective participant identities/capabilities and every applied movement effect. Preserve payload/override provenance. Request identity and team iteration order must not accidentally alias different configurations.
- Searches additionally depend on the resolved base cell. A new destination can reuse base searches if movement context/base are unchanged. Tasks, reserve, mission budget and departure can reuse movement only when they do not change movement rules. Mission assessment itself is recalculated.
- For a changed team or movement parameter, recompute through the correct context or reject stale supplied association. Never apply a fast person's path times to a slower selected team merely because the destination is unchanged.
- Retain at most one active graph and one associated base-search result initially. Clear incompatible references before building replacements; do not build an unbounded cache of approximately 685 MiB search peaks. Declare retained-versus-temporary memory semantics honestly.
- Test cache reuse/invalidation by observing search/build calls on small fixtures rather than relying solely on speed comparisons.

## Prepared historical scenario boundary

`SnapshotReference` currently validates a declared snapshot availability against a UTC cutoff. It does not inspect the records behind that declaration. Increment 2 must supply that missing record-selection boundary.

1. Resolve a registered versioned scenario for the requested parcel/evaluation location and decision cutoff. Keep raw source location, spatial applicability, epoch mapping and evidence/assumption classification distinct.
2. Distinguish observation interval, availability time, forecast issue time, forecast valid interval, event identity/revision and modern fetch time. Eligible decision records must have availability no later than the cutoff. A later valid forecast interval is expected and must not be mistaken for future leakage.
3. A completed daily observed maximum/minimum/mean cannot be used before its observation interval ends and its availability rule permits it. Later observations may exist in a separate verification dataset, never inside decision features.
4. For forecast/alert revisions, select only eligible issued/available revisions using a declared rule. Do not select the most accurate revision after seeing the event. Preserve stable source/event/revision IDs and availability metadata.
5. Unknown historical publication time is not equivalent to observation time. Either exclude/reject required records or apply an explicit reconstructed availability policy with its assumptions surfaced. Fixtures test both choices without claiming archived NASA publication knowledge.
6. Required versus optional evidence is explicit. Missing required daylight reaches the evaluator as missing evidence; optional unavailable weather variables remain missing/unevaluated and do not acquire an invented movement rule. Do not use today's newest source response as a 2025 fallback.
7. Departure and daylight must share an actual declared mapping to physical seconds, location and epoch. Keep a reviewed P3 conversion adapter boundary. Do not infer a Mars sol length, hard-code the reference latitude or equate a UTC timestamp and opaque offset without a mapping. A fixture can supply an explicitly assumed mapping; a real adapter remains pending.
8. The replay target remains 2025-10-25 through 2025-12-05. Fixture starts inside it are demonstrations only. Do not freeze a real replay start before common coverage/quality checks.

Keep pressure/temperature context, DONKI warning context and unevaluated effects labeled. No radiation-dose, hourly-temperature or weather-speed rule is introduced here.

## Wire output and margins

- Preserve `assessment` and `search_status` separately. If the UI requires one top-level status, document the explicit mapping, including a null assessment plus `search_inconclusive`. Do not relabel incomplete search as disconnected terrain, conditional acceptance or a technical success.
- Preserve `elapsed_s` and `reserved_total_s` separately. Report return time and reserved deadline, mission margin, per-participant margins and daylight departure/return checks.
- Important: the current engine's `limiting_margin_s` covers mission/participant temporal budgets, **not daylight**. Do not present it as the complete remaining-return margin. The exact-daylight-boundary example has positive temporal-budget margin but zero daylight margin. Name each margin accurately; if introducing an effective reserved-return margin, define it explicitly using all evaluated applicable deadline limits and preserve missing evidence separately. A departure-outside-daylight failure is still its own check.
- Do not reinterpret the v0 `budget.margin_s` field silently. Propose explicit versioned fields for the richer assessment and obtain P1 review.
- Echo request ID/revision, requested/resolved locations, resolved team/context identity, parcel/catalog/template/movement/scenario versions, cutoff and evidence IDs. This supports stale-response rejection and reproducibility.
- Return compact geometry and aggregate explanations. Do not expose full CSR/search arrays or all per-participant edge objects by default. Reuse on-demand detail if needed later.
- JSON must contain only finite numbers; unavailable metrics are null with explicit reasons. Preserve fixture labels independently of assumed movement parameters and observed/derived/forecast source classifications.
- Return one actual time-optimized candidate for now if that is all the engine computed. Do not manufacture effort or visibility alternatives or claim shared v1/real UI integration is complete.

## Acceptance and final report

Add meaningful small-fixture cases for wrong parcel/epoch/location, known centers and boundaries, invalid endpoints, stale team association, task-only reuse, changed base/team invalidation, future daily observations, late forecast revisions, eligible future-valid forecasts, reconstructed availability and missing daylight.

The end-to-end CLI example should resolve a prepared fixture, select records as of the simulated instant, calculate/reuse movement, evaluate the mission and emit strict compact JSON. Include at least one passing case, one participant-limited failure, an exact daylight boundary with zero daylight margin and a missing-evidence case. All examples must retain the synthetic label.

Run the existing relevant checks plus focused new tests and report public API, draft fields P1/P3 need to review, run commands, commit/push status and limitations. Do not rerun a large performance benchmark without a new performance concern or change that justifies it. End with the bounded increment 3 HTTP-service handoff; communication remains the next navigation extension afterward.
