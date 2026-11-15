# P2-02 handoff: directed grid routing

Date: 2026-11-14.

## Starting point and review

Start from `e0f5ab5` on `p2/team-movement`. Suggested new branch: `p2/directed-routing`. Inspect the current checkout and local changes before switching; concurrent writers must use separate worktrees.

The first slice contains commits `7a8e9ea`, `912d7fe` and `e0f5ab5`. The integration thread independently ran the three documented checks and `engine.example`: all passed. The example reports `fixture: true` and a synthetic group duration of approximately 656.82 seconds.

Local Git records `origin/p2/team-movement` at `e0f5ab5`, with a successful `update by push` reflog entry. A live remote query remains unavailable from the integration thread's command environment. Do not repeat a push solely because an older report said it was unconfirmed; check the current branch/ref first.

Read `CLAUDE.md`, `docs/TAREAS.md`, `docs/NAVIGATION_DESIGN.md`, `engine/README.md`, `engine/PARAMETERS.md`, `engine/CONTRACT_DRAFT.md`, current contracts and this handoff. All new repository content must be in English.

The delivered slice is a verified synthetic development foundation, not a validated Mars movement model. Original P2-01 also includes mission templates; agreed shared template defaults are still pending. Do not mark the whole original task complete just because the team layer exists.

## Goal and boundaries

Build a directed eight-neighbor sparse graph from a small metric analytical grid and compute outbound and return paths using source-limited SciPy Dijkstra. Keep the engine independent of Gale-specific coordinates, browser and HTTP service.

Do not implement mission budget/daylight decisions, production physiological models, effort optimization, visibility optimization, a final real-data adapter or `/plan` in this slice. Preserve extension points without adding unrelated features. Successful graph search is not a complete `viable_model` mission assessment.

## Review finding to fix first

`DirectedMetricEdge` currently accepts both endpoint elevations and an independent `rise_m` without checking their consistency. The integration review reproduced an edge from 0 m to 1000 m with `run_m=100` and `rise_m=0`; `evaluate_edge` allowed it and returned 250 seconds for `explorer_01`.

Make geometry authoritative: graph edges derive rise from target minus source elevation. Also make the public scalar evaluator reject contradictory supplied rise with a structured reason, or remove the redundant representation through an explicitly documented compatible change. If comparison tolerance is used, document it as numerical tolerance, not terrain measurement accuracy. Add a focused regression case, including reversed edges.

The current API also requires a nonempty `terrain_code`, although no measured soil classification is available from the terrain contract. Do not fill real-data cells with invented `firm` labels. Agree a neutral topography-only designation with P3, or separate optional material classification from mandatory analytical coverage. Missing essential elevation and exclusions remain blocking; unknown material is an explicit unevaluated property, never a claim of easy terrain.

## Incremental deliveries

| Increment | Scope | Completion check |
| --- | --- | --- |
| 1 | Fix redundant geometry handling; define and validate the metric grid input and its missing-data/exclusion semantics. Include this handoff if still uncommitted. | Regression for inconsistent rise passes; malformed grid inputs fail explicitly; existing slice checks still pass. |
| 2 | Construct directed eight-neighbor CSR graphs with bounded temporary memory. | Known tiny grids match scalar movement decisions; diagonals cannot cut blocked corners; edges remain directional and positive. |
| 3 | Outbound/return searches, route reconstruction, synthetic integration example and performance measurements. | Known-path, disconnected, invalid-origin, changing-team and asymmetric-return cases pass; document commands and observed time/memory. |

After each completed increment, inspect the diff, run relevant checks, stage intended files only, make a small English commit and push `p2/directed-routing`. Report branch, commit, verification and push outcome. Preserve `docs/FLUJO_TRABAJO_EQUIPO.md` and unrelated changes. No force-push, main-branch push or unreviewed merge. If credentials/network block publication, keep the local commit and give the user's terminal command without claiming remote success.

## Grid and traversal semantics

- Specify two-dimensional elevation, coverage and exclusion arrays with matching shape, positive finite metric cell spacing, origin/index convention and data version. Reject invalid shapes and types. Normalize NumPy numeric scalars at the boundary rather than accidentally rejecting valid raster values through Python-only scalar checks.
- Use the P3 metric grid metadata; no hard-coded Gale bounds, Earth projections or Cesium height offsets.
- Distinguish array finiteness from valid coverage: a finite nodata sentinel is still missing when its mask says so.
- Retain separate conservative terrain-slope/exclusion summaries when available. Endpoint grade alone cannot detect an excluded feature inside an aggregated cell. Require a declared aggregation/mask policy before real-data use; do not invent missing P3 layers.
- Enumerate only valid in-bounds neighbors, including correct diagonal distance from metric spacing. No wrapping between rows or off-grid shortcuts.
- No corner cutting: both orthogonal side cells must satisfy the selected conservative traversability rule. Test missing and excluded side cells; document how profile-dependent terrain gates apply.
- Compute the intersection of participant permissions and the maximum participant duration on each directed edge, matching the scalar reference. Do not average speeds or use the maximum of whole-person route totals.
- Payload capacity is already validated. Do not add a load-speed penalty in graph construction when the reference model has none.
- Movement formulas remain explicitly synthetic. Do not promote them to validated defaults merely because a real raster is supplied.

## Construction and memory

A 3 x 3 km grid at 2 m spacing can contain roughly 2.25 million nodes and up to eight outgoing edges per interior node. The current object-rich scalar evaluator is a correctness reference, not a suitable default loop to call millions of times while retaining result objects.

Use NumPy over neighbor offsets, with blocks if needed, and construct a sparse graph from allowed positive weights. Verify vectorized weights and permission masks against the scalar evaluator on small cases. Do not store a `GroupEdgeResult`, participant objects or full explanations for every possible edge; regenerate detailed explanations for reconstructed paths only.

Avoid materializing a participant-by-edge result cube across the full grid. Accumulate the permission intersection and maximum duration across participants. Bound temporary arrays; record actual graph node/edge counts and memory estimates. Avoid all-pairs distances and unnecessary duplicate graph copies.

NumPy 1.26.4 and SciPy 1.11.4 were importable using `C:\Users\Usuario\anaconda3\python.exe` during integration review. Discover the implementation session's runtime rather than relying on the Windows Store `python` alias. Keep dependency/run instructions reproducible and portable.

## Search and reconstruction

- Use `directed=True` and explicit source indices. Search from the base on the original graph for outbound costs and from the base on its transpose for return-to-base costs.
- Return reconstruction must follow the correct orientation of the transpose predecessors. Verify reconstructed movements against the original directed graph; never reverse an outbound route and assume it is a valid return.
- Handle predecessor sentinels, unreachable nodes, base equal to destination and invalid/missing/excluded endpoints explicitly. Do not loop indefinitely or index a sentinel as a valid node.
- Keep route geometry as grid indices/metric coordinates at this stage. Geographic conversion belongs to the agreed parcel adapter, not a guessed Cesium transformation.
- For each returned path, verify the sum of edge durations matches the reported Dijkstra cost within a documented numerical tolerance. Expose distance/ascents only with clear horizontal-versus-surface conventions.
- Distinguish invalid input, no path inside the evaluated domain and an incomplete/interrupted search. A found path is a movement result, not proof that mission time, daylight or communications pass.

## Focused acceptance cases

1. Flat grid with a known shortest path and diagonal distance.
2. Full barrier that disconnects source and destination; a one-cell opening restores a route.
3. Diagonal adjacency across two blocked/missing side cells does not create a shortcut.
4. Ascending and descending edges have different costs and can have different permissions.
5. A valid outbound path with no valid return is reported accurately.
6. A case where the best return differs from the outbound path reversed.
7. A faster selected participant lowers duration on the same allowed geometry; a restrictive robot changes connectivity where appropriate.
8. Vectorized weights match scalar results, including a changing limiting participant across segments.
9. Missing/excluded endpoints, nodata masks and same-source/destination behavior are explicit.
10. Every reconstructed path follows original-graph edges; physical duration matches the search distance.

## Delivery and next integration

Deliver pure engine code, focused tests, a reproducible synthetic routing example, dependency/run instructions and measured build/search time plus memory observations on a declared grid size. Do not repeat the old README's synthetic timing claims as a measurement on this machine.

Leave v0 shared contracts and `app/` unchanged. Document any proposed P3 adapter fields and unresolved material/aggregation semantics for review. Update task status honestly; P2-06 is not complete until real-parcel integration is measured.

End with a handoff for the next mission-budget/service integration, listing branch, commits, publication status, checks, public API and limitations. Communication remains the first planned extension once baseline routing and complete-mission checks work.
