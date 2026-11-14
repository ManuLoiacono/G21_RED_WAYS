# P2-03/04 integration handoff: mission budgets and local service

Date: 2026-11-14. Baseline delivered: **P2-02 directed metric routing**. **P2-03/04 increment 1 added pure complete-mission evaluation and central synthetic templates**. Increment 2 is recorded below. No HTTP service endpoint is implemented.

Increment 2 update: registered synthetic providers, bounded movement reuse, per-record historical cutoff selection and an explicit draft exchange/engine-calculated CLI are now implemented under `service/`. See `P2_03_INCREMENT2_PROVIDERS_AND_EXCHANGE.md` for deliveries A/B/C and `P2_03_INCREMENT3_HTTP_SERVICE.md` for the subsequent review handoff. No HTTP endpoint or real parcel adapter is implemented. All planning examples calculate through the engine; synthetic input provenance is distinct from calculation origin. `app/`, shared v0 contracts and their existing fallback behavior remain unchanged.

## Branch and incremental delivery

Base: `e0f5ab5` on `p2/team-movement`. Feature branch: `p2/directed-routing`.

| Increment | Commit | Verified delivery |
| --- | --- | --- |
| 1 | `c41e7b1` | Authoritative endpoint geometry, optional material versus coverage, validated metric grids, input/regression tests and the P2-02 handoff. |
| 2 | `7233e7d` | Bounded two-pass eight-neighbor CSR construction, team gates, conservative diagonals and scalar parity tests. |
| 3 | Commit containing this file, titled `Search and reconstruct directed outbound and return routes` | Source-limited searches, guarded reconstruction, integration tests, synthetic example and measured time/memory. |

Increments 1 and 2 were pushed and checked against `git ls-remote`. This handoff is authored before increment 3 is committed/pushed; its final publication outcome is reported in the implementation chat. Resolve and verify the exact final delivery without guessing a self-referential commit hash:

```sh
git log -3 --oneline p2/directed-routing
git rev-parse p2/directed-routing
git ls-remote --heads origin p2/directed-routing
```

The final two hashes must match to confirm publication. Never repeat an older push solely because an earlier message lacked confirmation. No main push, force-push or merge is authorized by this handoff.

`docs/FLUJO_TRABAJO_EQUIPO.md` remains untracked and untouched. Shared v0 `contracts/`, `app/`, `service/`, `scripts/` and prepared data were not changed. All newly authored repository text is English. P2-02 implementation is verified in the synthetic domain but remains in progress in `TAREAS.md` until consumer review; original P2-01 templates and P2-06 real-parcel measurements remain pending.

## Read before integrating

Read `CLAUDE.md`, `docs/TAREAS.md`, `docs/NAVIGATION_DESIGN.md`, `docs/ENVIRONMENT_REPLAY_DESIGN.md`, current `contracts/`, `engine/README.md`, `engine/PARAMETERS.md`, `engine/CONTRACT_DRAFT.md`, `engine/ROUTING_MEASUREMENTS.md` and the preceding `P2_02_DIRECTED_ROUTING.md` handoff. v1 fields and numeric defaults still require P1/P3 review.

## Environmental direction update

The project owner supplied `BRAINSTORMING_PREVISION_ALERTAS_Y_DATOS_14NOV.md` and requested using it before mission/service implementation. `docs/ENVIRONMENT_REPLAY_DESIGN.md` records the resulting English integration decisions and supersedes the earlier single historical-sol assumption where they differ.

The primary demonstration is a historical replay targeting 2025-10-25 through 2025-12-05, with its exact start to be selected after data-quality/common-coverage checks. Distinguish replay UTC, physical elapsed seconds, local Mars clock, observation intervals and publication/forecast issue times. The service must preserve an as-of information cutoff; future daily summaries, later DONKI revisions and verification outcomes cannot leak into planning.

Implement the pure evaluator with normalized fixture daylight first. Add the prepared environmental snapshot identity/cutoff to the exchange before HTTP integration. Weather training belongs to the environment-model owner. Pressure/temperature are context until an explicit justified rule is adopted; daily extrema do not establish hourly cold conditions. DONKI is alert context, not an automatic dose model or mission veto. RAD, orbital relays and live-context panels are not prerequisites for this slice.

Retain time-independent Dijkstra weights for a fixed configuration. Provide a bounded reevaluation input boundary for later simulated events without resetting autonomy; do not implement a new time-dependent pathfinder or full replay UI here. Communication remains the next priority after the complete-mission baseline.

## Integration-thread review and next implementation session

The integration thread reviewed `f1c4b2a` and independently reran all three existing check scripts, all 21 new unit tests, both JSON examples and a 256 x 256 benchmark; all passed. A separate check shifted all fixture heights by +71.2 m and confirmed unchanged connectivity and movement costs within numerical tolerance. This checks uniform-offset invariance, not the geographic alignment or vertical accuracy of a real parcel.

Local `HEAD` and the fetched tracking ref `origin/p2/directed-routing` both resolve to `f1c4b2a1264dc5a738014a62a5954be9317e01dc`. The large-run measurements above were inspected, not rerun during integration review. That single synthetic run has approximately 6.84 seconds of graph construction plus search and a 685.5 MiB process peak; it is not an interactive-per-keystroke or real-parcel performance guarantee.

Use a fresh implementation session on `p2/mission-service`, starting from `f1c4b2a` plus this handoff update. Preserve unrelated local files. This session owns pure mission evaluation in `engine/` and a local service in `service/`; shared exchange additions remain proposals until the consumers review them. Do not edit the teammate-owned app or fabricate a P3 parcel to present as real.

Current task boundary after integration review: increment 1 was delivered in `69ba3b9` and its checks/examples independently passed review. The next invocation implements increment 2 only using `P2_03_INCREMENT2_PROVIDERS_AND_EXCHANGE.md`, then stops for review before increment 3. Do not wait for real weather, RAD, a final parcel or consumer approval to build clearly labeled synthetic provider/exchange cases; do not claim those cases complete real integration.

| Increment | Scope | Completion check |
| --- | --- | --- |
| 1 | Pure complete-mission evaluator, validated normalized daylight input and four centrally defined mission templates. | Known synthetic cases cover tasks, reserve, mission and participant limits, daylight boundaries/missing evidence and absent return; run existing engine checks too. |
| 2 | Bounded prepared-parcel/scenario providers and explicit wire request/response mapping with reproducible fixtures and replay cutoff metadata. | Coordinates/POIs resolve without silent snapping; scenario issue/availability times respect the replay instant; schema versions and synthetic evidence are explicit; task-only changes reuse movement searches. A fixture grid/coordinate transform is labeled and cannot stand in for P3's real transform. |
| 3 | Local `/plan` and `/parcel`, catalog/template access, browser preflight handling, documented launch and integration example. | HTTP checks demonstrate one accepted synthetic mission and explicit failures; no remote APIs are called during planning; one expensive job at a time and bounded caches prevent uncontrolled graph copies. |

After every completed increment, inspect the diff, run relevant checks, make a small English commit and push only `p2/mission-service`. Report what changed, why, checks, commit, push outcome and next step. Include the pending changes to `docs/NAVIGATION_DESIGN.md`, the new `docs/ENVIRONMENT_REPLAY_DESIGN.md` and this handoff in the first intended commit if still pending; do not capture the unrelated workflow draft. No force-push, direct main push, unrelated staging or unreviewed merge. If network/credentials block a push, preserve the commit and report the exact command; never report publication without verification.

Explain the first increment in ordinary terms before moving to the next: a route can be physically connected yet the complete mission can exceed time, daylight or a participant's temporal limit. The integration thread is the decision/review point; do not expand into effort optimization, visibility algorithms, complex recommendations or ML training without a separate bounded task. Communication remains the next priority, and P3 can prepare its layer in parallel.

## Mission evaluation rules for increment 1

- Keep the evaluator pure and independent of HTTP and geographic conversion. Input consists of movement-leg results, validated tasks, selected effective participants, the mission budget/reserve and a normalized daylight scenario/departure.
- Validate finite numeric inputs and reject booleans, invalid durations and incompatible clock metadata with structured field-specific errors. Never turn malformed required values into zero.
- Report `elapsed_s = outbound_s + tasks_s + return_s` separately from `reserved_total_s = elapsed_s + reserve_s`. Reserve is unused required margin, not elapsed simulated activity.
- Compute mission margin and every participant's margin as its temporal limit minus `reserved_total_s`; do not pool limits or let a task reset autonomy. Report the limiting margin and participant explicitly. Task time applies to the co-traveling group, including robots.
- Represent departure and daylight interval on one physical-second axis relative to a declared sol/scenario epoch. Check departure is in the enabled interval and `departure + reserved_total_s <= daylight_end`. Exact-boundary equality passes within an explicit numerical policy; do not hide a material overrun with rounding.
- P3's normalized clock conversion is a separate dependency. Use explicit fixture physical seconds in tests, not a guessed conversion of REMS clock strings. Missing required daylight produces insufficient evidence, never a passing daylight check.
- Historical replay changes data selection, not arithmetic units: evaluate only the supplied as-of environmental snapshot and expose its ID/version/cutoff. Use the actual parcel location for solar input. Do not substitute today's DONKI alerts or the newest REMS sol into a 2025 replay.
- A mandatory failed rule means `incompatible`. If mandatory evidence is missing and no decisive rule already fails, use `insufficient_evidence`. Use `conditional` only for an explicit, named condition; technical errors and incomplete search remain separate. Preserve all missing/unevaluated checks even when a decisive violation determines the overall status.
- No return path is incompatible within the evaluated model/domain; an inconclusive search does not establish impossibility. Do not invent durations or geometry for unavailable legs.
- A found route plus passing budgets permits only `viable_model`, with the movement assumptions and unevaluated material/communications still visible. Do not call it operationally safe. Real terrain geometry does not validate the current synthetic participant models.
- Define the four accepted English template IDs in one authoritative source; task durations, budget and reserve defaults are explicitly editable scenario assumptions. Do not create undocumented scientific task-time claims. Serve or export the same definitions for P1 rather than duplicating independently maintained defaults.

## Increment 1 implementation and review handoff

Branch: `p2/mission-service`, created from `f1c4b2a1264dc5a738014a62a5954be9317e01dc`. Delivery is the commit titled `Evaluate complete mission budgets and normalized daylight`; resolve its exact hash and publication using `git rev-parse p2/mission-service` and `git ls-remote --heads origin p2/mission-service`. The implementation chat reports the observed commit/push result after publication, avoiding a self-referential hash in this file.

Implemented `engine/mission.py`: pure `evaluate_mission`, validated task/duration/budget input, mission and individual human/robot margins after reserve, limiting paths/participants and ties, normalized daylight departure/deadline checks, structured reasons and explicit missing/unevaluated checks. No mutation, clock/geographic conversion, new search or network access occurs. A connected route can still be incompatible once tasks, reserve, daylight and each participant's original availability are considered.

`PhysicalTimeline`, `Departure` and `DaylightWindow` declare physical seconds relative to one matching scenario/sol epoch. Method/evidence and evaluation location are explicit. All comparisons use absolute 1e-6 seconds, zero relative tolerance; raw negative margins are retained. There is no rounding of a material overrun or implied measurement accuracy. Required missing daylight never passes.

`SnapshotReference` carries the exact scenario ID/version, snapshot ID, UTC decision cutoff, declared availability policy/time, location and fixture flag. Availability after the cutoff is rejected and location IDs must match the daylight evidence. This is a narrow prepared-input attestation for the pure evaluator, not the increment 2 scenario provider or wire mapping. Per-record publication/issue/revision eligibility and real location/clock normalization still belong to the preparer; fixture dates are explicitly assumed, with no NASA record or historical operational-knowledge claim.

Assessment semantics: failed mandatory rule gives `incompatible`; otherwise missing required daylight gives `insufficient_evidence`; otherwise incomplete search leaves `assessment=null`; passing completed checks give only `viable_model`. Separate `search_status="search_inconclusive"` stays explicit even when a decisive violation or missing daylight independently determines the assessment. All missing/unevaluated checks remain visible. No conditional rule is introduced. No-path is limited to the evaluated model/domain; unavailable legs leave complete totals/margins null. Material, communication, effort, physiology, weather effects, radiation, terrain shadow and real movement validation remain unevaluated. Movement inputs must belong to the supplied effective team; the current routing result has no team fingerprint, so the caller must preserve that association.

`engine/templates.py` centrally defines the four canonical English IDs and exports versioned, fixture-labeled editable defaults through `export_mission_templates()`. Values are development scenario assumptions, not scientific task-time claims. Frozen templates and fresh exports prevent consumer edits from mutating defaults. Shared v1/default adoption remains pending P1/P3 review.

Verification on Python 3.11.7 with the existing pinned NumPy/SciPy runtime:

```sh
python -m engine.tests.test_catalog
python -m engine.tests.test_team
python -m engine.tests.test_movement
python -m unittest discover -s engine/tests -p 'test_*.py' -v
python -m engine.example
python -m engine.routing_example
python -m engine.mission_example
python -m engine.routing_benchmark --rows 256 --cols 256 --block-cells 65536
```

The three standalone checks and all 40 unittest cases passed (21 existing plus 19 new). Every example emitted finite strict JSON with `fixture: true`; the new example was byte-identical across two fresh-process runs. Focused coverage includes sequential tasks/reserve, each temporal limit, robot bottlenecks/ties, exact daylight boundaries and 0.001-second overrun, missing evidence despite another failure, absent return, interrupted search, malformed/overflowing numbers, incompatible clock/location metadata, cutoff rejection and unchanged inputs. Actual searches on synthetic grids include a same-cell route and directed outbound without return. A fresh 256 x 256 synthetic regression benchmark returned both legs: graph build 0.211 s, searches 0.045 s, process peak 66,371,584 bytes; this is not a real-parcel measurement. The earlier 1500 x 1500 benchmark was not repeated for this arithmetic increment.

Reproduce full inputs/results with `python -m engine.mission_example`. Baseline: outbound/return 100 s each, task 600 s, elapsed 800 s, reserve 1800 s, reserved total 2600 s, mission margin +19000 s and limiting support-rover margin +15400 s. A 2599 s mission budget fails by 1 s. An extended assumed task produces a rover margin of -1 s while the mission still has +3599 s. Exact reserved sunset equality passes; 0.001 s overrun fails. Missing daylight gives insufficient evidence; absent return gives incompatible with null totals; a simulated interruption has no completed assessment. See `engine/README.md` for the case table and API semantics.

The pending navigation design, environment replay design and prior handoff edits are included in this intended commit. `docs/FLUJO_TRABAJO_EQUIPO.md` remains untracked and untouched. `app/`, shared v0 `contracts/`, `service/`, `scripts/` and data packages are unchanged. No increments 2 or 3, main merge, HTTP endpoint, provider/cache, weather training/effect or visibility algorithm is included. Stop here for integration review.

Remaining integration questions: accept the engine-to-wire assessment/search distinction and English v1 migration; agree template/default consumption; have P3 confirm actual location, clock normalization/epoch, masks/transform and solar evidence; define record availability/revision policy and validate common 2025 coverage before fixing the replay start. Preserve movement-team association when adding bounded providers. Communication remains the next navigation extension after the complete-mission baseline and service integration.

## Contract and runtime boundaries for increments 2 and 3

- P1 currently emits v0 with one `profiles` entry and POI IDs, while the proposed v1 uses catalog team selection and tagged POI/coordinate locations. Make the supported version explicit. Do not silently interpret v0 as v1, drop participants, rename legacy IDs or ignore requested capabilities. A temporary compatibility adapter needs a documented mapping and tests; otherwise return an explicit unsupported-schema error until the consumer switches.
- Prepare concrete English request/response examples for P1/P3 review. A working draft service can advance with a fixture without declaring the shared contract accepted or claiming the existing UI is fully integrated.
- P3 must confirm cell-center versus outer-corner origin, mask decoding, conservative slope aggregation, coordinate conversion and daylight time convention before a real adapter is enabled. Missing excluded-area data must not be presented as a verified absence of hazards.
- Return compact route geometry/metrics and aggregate explanations by default. Do not serialize full graph/search arrays or every per-participant edge object into each HTTP response. Reject nonfinite JSON numbers; missing values are null with reasons.
- Echo request identity/revision, parcel/catalog/model/scenario versions and the resolved team. Do not let an old response replace results for newer input. Preserve the distinction between a fixture data package and an assumed movement model when reporting provenance.
- Load only bounded prepared data and retain at most one active graph/search combination initially. Graph keys depend on parcel data, masks, resolution, effective team, models and applied movement effects; search keys also include base. Tasks/reserve/departure alone can reuse movement results when they do not alter movement costs.
- Serialize expensive builds/searches or return a clear busy response. A timeout/client disconnect must not be described as terrain disconnection or as proof that the underlying SciPy job stopped. Do not promise cancellation that is not implemented.
- Bind to loopback and allow the actual configured local UI origin for CORS, including `OPTIONS` for JSON planning requests. Distinguish invalid requests, incompatible mission results and technical failures. Follow current app expectations only through an explicit supported adapter.

## Public engine API

- `MetricGrid`: read-only snapshots of elevation, boolean coverage/exclusions and optional conservative slope summaries; explicit row/column metric spacing, `(0,0)` cell-center x/y, row direction, data version, fixture flag and aggregation policy. Real input structurally requires slope summaries, without claiming the policy or movement model is validated.
- `build_graph(grid, resolved_team, block_cells=65536) -> DirectedGridGraph`: positive physical-second CSR weights, every cell retains its row-major ID, blocked cells are isolated. Built-in synthetic models only. Team/model/mask changes require a rebuilt graph; task changes alone do not alter it.
- `search_from_base(graph, base_cell) -> RoutingSearch`: two explicit one-source directed Dijkstra calls, original graph for outbound and shared transpose for return. Four one-dimensional result arrays. `status` is `complete` or `search_inconclusive`; no partial arrays survive interruption.
- `reconstruct_route(search, destination_cell, leg="outbound" | "return") -> RouteLeg`; `routes_to(search, destination_cell) -> RoundTripRoutes`: separate legs, grid indices and metric centers, horizontal distance, positive ascent/descent totals, physical duration, search cost and on-demand scalar edge explanations.
- `GridInputError` provides code/path for malformed grids and invalid endpoints. `RouteReconstructionError` identifies technical state inconsistencies. Leg statuses are `found`, `no_path_in_domain` or `search_inconclusive`; they are not mission-assessment states.

Endpoint elevations are authoritative. The scalar API rejects inconsistent redundant rise with absolute numerical tolerance `1e-6` m; even accepted near-equal rise is ignored in grade calculation. `terrain_code=None` means material unevaluated. `coverage_valid` separately blocks missing essential evidence; no invented firm-soil labels are needed. The graph does not ingest material rasters or claim material effects.

Terrain summary gates use each participant's smaller ascent/descent limit. Directed edge grades use ascent/descent separately. Diagonals require both side cells and both directed two-step orthogonal decompositions to pass; no masked/excluded/grade-blocked corner is cut. Payload capacity is checked during team resolution and adds no speed penalty. Each group arc uses the maximum participant duration; route durations sum arc maxima, including changing bottlenecks.

Return reconstruction follows transpose predecessors from destination to base, not an outbound reversal. Every returned arc is checked in the original graph and against scalar movement. Arc and scalar sums match search cost within `1e-9` relative or `1e-6` seconds absolute numerical tolerance. Sentinel, out-of-range and cyclic predecessors are technical errors. Same-cell movement has zero duration/distance; invalid endpoints remain invalid even in that case.

## Reproducible verification

Use Python 3.10-3.12, installing `engine/requirements.txt`. Tested interpreter: `C:\Users\Usuario\anaconda3\python.exe` (Python 3.11.7, NumPy 1.26.4, SciPy 1.11.4). From the root:

```sh
python -m engine.tests.test_catalog
python -m engine.tests.test_team
python -m engine.tests.test_movement
python -m engine.tests.test_grid
python -m engine.tests.test_graph
python -m engine.tests.test_routing
python -m engine.example
python -m engine.routing_example
python -m engine.routing_benchmark --rows 256 --cols 256 --block-cells 65536
python -m engine.routing_benchmark --rows 1500 --cols 1500 --block-cells 65536
```

The first three existing checks pass. New unittest coverage: four grid, six graph and eleven routing tests. Cases include scalar parity, diagonal metric distances, barriers/openings, missing/excluded corners/endpoints, asymmetric permissions/costs, outbound without return, different best return geometry, team changes, changing bottlenecks, same-cell paths, interruption and corrupt search state. Return costs are also compared with independent forward searches from small-grid destinations. Both JSON examples retain `fixture: true`.

Observed large synthetic run: 2,250,000 nodes, 17,982,004 directed edges, graph build **4.61956 s**, both searches **2.22402 s**, two-leg reconstruction/scalar verification **0.21752 s**. Retained arrays: 321,534,052 bytes; process peak resident memory: 718,815,232 bytes (about 685.5 MiB). See the measurement document for commands, smaller run, stage peaks and limitations. This does not complete P2-06.

## Next integration boundaries

1. Agree P3's cell-center transform, boolean mask decoding, missing-native-sample and exclusion aggregation, separate conservative native-slope summaries, versions and coordinate conversions. A p90 slope cannot erase exclusions; v0 origin semantics cannot be assumed to specify a center. No Cesium display offset enters analytical elevation.
2. Load and retain one prepared parcel in the service; resolve POIs/coordinates through reviewed adapter logic and preserve requested/resolved positions without snapping across obstacles. Establish cache keys for geometry, masks, data/model versions, selected effective team and later scenario effects. Keep base-specific searches separate from graph weights.
3. Implement complete-mission checks: outbound + sequential tasks + return, then required reserve as margin against mission and every participant's limit. Resolve daylight to the same physical-second axis with P3, checking departure as well as the reserved return deadline. Do not add physical seconds directly to a Mars local-clock string. Missing required daylight remains insufficient evidence.
4. Map movement results into reviewed exchange fields and `/plan` behavior. A found outbound leg without return is not a viable mission; no-path is limited to this evaluated grid/team/model. Invalid input, technical failure, incomplete search and absent path are distinct. Preserve synthetic labels and all `not_evaluated` fields.
5. Integrate real-parcel movement and measure P2-06 before declaring real data complete. Agreed shared template defaults remain unresolved; do not mark original P2-01 complete from the existing team layer alone.
6. Communication remains the first planned extension after baseline routing and complete-mission checks: P3's base-specific geometric visibility, known/unknown state and sampling assumptions, then task/leg interruption continuity. It is not radio coverage. Effort/visibility optimization, physiology, load-speed effects and real operational capability remain outside this delivery.

The synchronous SciPy backend has no progress/timeout API; `KeyboardInterrupt` is handled when Python receives it, with partial results discarded. Other backend failures propagate as technical errors. A later service must implement its cancellation/resource boundary honestly rather than relabeling a failed or interrupted job as disconnected terrain.
