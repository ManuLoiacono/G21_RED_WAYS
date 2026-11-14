# P2-03/04 integration handoff: mission budgets and local service

Date: 2026-11-14. Scope delivered: **P2-02 directed metric routing only**. No service endpoint or complete-mission decision was implemented.

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

Read `CLAUDE.md`, `docs/TAREAS.md`, `docs/NAVIGATION_DESIGN.md`, current `contracts/`, `engine/README.md`, `engine/PARAMETERS.md`, `engine/CONTRACT_DRAFT.md`, `engine/ROUTING_MEASUREMENTS.md` and the preceding `P2_02_DIRECTED_ROUTING.md` handoff. v1 fields and numeric defaults still require P1/P3 review.

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
