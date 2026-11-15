# Autonomous implementation: P2-05, P2-07, P2-08 and P2-09

Date: 2026-11-15.
Reviewed main: `00559c4`, including backend-only environment PR #14. Fetch and inspect newer main before starting.
Source checkout: `C:/Users/Usuario/Desktop/Nasa Challenge/G21_RED_WAYS`.

## Owner-approved scope and decisions

Implement and integrate all four tasks, with incremental verified commits/pushes and one reviewable PR into main. This is an implementation assignment; do not stop after planning or after the first delivery. The owner reviews and merges at the end. Do not merge automatically.

The owner has explicitly approved these decisions:

1. The effort-related alternative minimizes **total positive ascent**, breaking ties by physical travel time. Label it as a geometric effort proxy or lower-ascent route, not calories, fatigue or a validated physiological model.
2. Geometric communication is a **preference**, not a mandatory interruption threshold. Offer a third visibility-prioritized candidate only when it differs from the fastest and lower-ascent paths.
3. Assume a base antenna **5 m above analytical ground** and one co-located group receiver **2 m above analytical ground**. These are declared configurable scenario stipulations, not measured antenna specifications or proof of radio coverage.
4. Recommendations may evaluate departure changes and changes to selected humans/robots, with explicit payload reassignment. Never apply them silently or lose required payload.
5. Necessary frontend integration is now authorized. Preserve the teammate's current mission wizard, interaction model and visual approach; adapt them to expose the new calculations. This supersedes the earlier blanket `app/` freeze in the backend-only reconciliation handoff. It does not authorize an unrelated UI redesign.

P2-07 retains the agreed complete-sortie definition: outbound + tasks + return + required reserve, checked against mission/participant limits and applicable daylight. P2-09 remains a qualitative route warning; it must not change speed, exclude terrain or create an operational safety threshold.

## Required context

Read applicable `AGENTS.md`, `CLAUDE.md`, then:

- `docs/handoffs/NAVIGATION_GOALS_STATUS_2026_11_15.md`
- `docs/NAVIGATION_DESIGN.md`, especially team timing, recommendations and communication continuity
- `docs/ENVIRONMENT_REPLAY_DESIGN.md`
- `docs/handoffs/P2_ENVIRONMENT_DELIVERY.md`
- `docs/ENVIRONMENT_RUNTIME.md`, current service draft/API docs and request examples
- `engine/graph.py`, `routing.py`, `movement.py`, `mission.py`, `team.py`
- `service/planning.py`, `prepared.py`, `exchange.py`, `scenarios.py`, `solar.py`
- Existing analytical manifest, package preparation and measured performance
- `app/src/mission/`, current `main.ts` event wiring, `terrain/parcel.ts` and thermal modules.

The current engine calculates real Gale routes, complete budgets, actual-location geometric daylight and decision-safe forecast context. Keep those features. Do not recreate the graph, environmental training or existing route display unnecessarily.

Important implementation boundaries:

- The immutable CSR graph currently stores physical seconds. Search/reconstruction assumes search score equals duration. Non-time criteria must separate optimization scores from actual physical durations rather than reinterpret metres as seconds.
- Only `fastest` is currently accepted by `service/exchange.py`; the exchange needs a deliberate compatible extension.
- The scene renderer currently draws the first alternative. Adding cards alone will not integrate candidate selection with map geometry.
- The committed THEMIS crop is `app/src/thermal/themis_nir_parcel.json`: 30 x 30, nodata 0, documented brightness stretch [111, 202]. Reinspect actual metadata if main changes. The existing visual categorization is reusable; it is not a scientific hazard threshold.
- Generated `terrain.npz` is ignored by Git. Verified copies existed in the Gale and environment worktrees. A fresh worktree needs a validated archive or reproducible preparation.

## Execution and publication rules

1. Inspect status, remote branches, worktrees and new commits. Fetch origin, create a new feature branch from updated main, and preferably use an isolated worktree, for example `G21_NAVIGATION_EXTENSIONS` on `p2/navigation-extensions`.
2. If fetch fails, report that fact and use the latest locally fetched main without claiming remote freshness. Do not unnecessarily stop independent implementation.
3. The status document and this assignment may be untracked in the source checkout. Read them there, copy only these requested docs into the implementation worktree if needed, and include them in a scoped commit. Leave `docs/FLUJO_TRABAJO_EQUIPO.md` unchanged and outside all commits.
4. Preserve private environment files, unrelated changes, stashes and other contributors' worktrees. Reuse verified terrain without copying secrets or committing large rasters.
5. Keep runtime/preparation environments compatible with the engine's NumPy/SciPy pins. Do not install the ML training requirements into that environment or retrain models.
6. All new code, comments, docs, logs, filenames, commits and PR text must be English. UI strings belong in both existing language dictionaries.
7. Complete the four deliveries below without planned approval pauses. More than four commits are allowed when that improves review. Commit and push each verified coherent unit instead of one final monolithic push. Verify remote HEAD when possible.
8. Before finalizing, incorporate newer main without rewriting published history and rerun affected checks. Preserve incoming P1 behavior when resolving conflicts.
9. If there is an existing active implementation of any task, inspect and reuse it before duplicating code. Do not force-push, merge main, delete branches or send teammate messages.
10. Open one PR into main when authenticated tooling permits. If push/PR creation is blocked, finish local commits, document the exact failure and provide recovery commands. Never claim publication succeeded when it did not.

## Delivery A: geometric visibility and interruption evaluation (P2-08)

### Visibility preparation

- Implement a deterministic base-specific terrain viewshed using the actual unshifted analytical elevation and coverage. Version the method, resolution, curvature convention and uncertainty treatment.
- Use the approved 5 m / 2 m above-ground heights, independent of profile demographics or robot capabilities. The 2 m point represents the scenario's group receiver, not an inferred hardware antenna on each unit.
- Expose validated finite nonnegative height configuration through the scenario/options contract and minimal existing advanced UI controls. Changing heights must invalidate affected visibility results.
- Keep known visible, known occluded and unknown distinct. Missing endpoint or intervening essential terrain cannot establish visibility. A known blocking obstacle may establish occlusion; unexplained gaps cannot become clear line of sight.
- Include Martian curvature consistently with the adopted source reference when supported by the chosen method; document any approximation and its scope. Do not add Fresnel, refraction, link budgets, range, throughput or reliability claims.
- Choose an efficient raster viewshed algorithm with documented sampling and reference tests. Do not cast unbounded Python cell-by-cell rays for every origin/destination combination, allocate all-pairs arrays, or compute an entire Gale regional graph.
- Cache/version the layer by parcel/data identity, base position, receiver/base heights, resolution and method. Keep caches bounded and invalidate on base/terrain/height changes. Scene shifts and the panorama +71.2 m offset must never enter visibility calculations.

### Route metrics

- Report travel time with known visibility, known occlusion, unknown visibility, and maximum continuous time without confirmed visibility. If a known-occlusion-only maximum is also exposed, distinguish it from the unknown-inclusive metric.
- Define one deterministic edge-state sampling rule and use it for both search and route evaluation. A source/target half-edge duration split is acceptable if documented and tested; a different method needs the same consistency evidence.
- Include sequential destination tasks at the destination state. Carry interruption continuity across outbound -> tasks -> return. Do not reset the counter at leg boundaries.
- Reserve remains unused margin and contributes no fabricated communication exposure. Co-travelling participants share the route's physical group timing.
- Unknown visibility must not receive a free preference benefit. Use time without confirmed visibility (known occluded + unknown) as the conservative optimization quantity and retain the separate components.
- Communication remains a preference: no mission rejection based solely on a long interruption. Do not imply continuous-interruption constraints were solved by an additive shortest-path cost.

Acceptance: synthetic flat/ridge/unknown-terrain cases, height and base changes, metric continuity through tasks, and real-parcel cache/performance checks pass. Missing visibility is explicitly unevaluated or unknown, not a zero-interruption success.

## Delivery B: distinct candidates and evaluated recommendations (P2-05)

### Search and comparison

- Preserve the fastest candidate and its existing physical-second behavior.
- Add the lower-ascent candidate: minimize positive elevation gain summed over the actual outbound and return paths, with physical travel time as the secondary criterion. Use a documented exact lexicographic/two-stage method or a justified numerically bounded equivalent; do not hide arbitrary metre-to-second weights.
- Add the visibility-prioritized candidate: minimize time without confirmed geometric visibility, breaking ties by physical travel time. Keep unknown/occluded components explicit. Destination task time is included in evaluation; it is constant between route choices for a fixed mission.
- Maintain all existing traversal constraints, team timing and no-corner-cutting rules for every criterion. Return searches remain directed and independently calculated.
- Reconstruct actual group durations/metrics from the physical movement graph for every candidate. Never add an effort or visibility score to a UTC timestamp, reserve, participant budget or daylight limit.
- Preserve legacy seconds-labelled fields honestly. Add typed optimization metadata with actual units/components; non-time scores must not masquerade as `search_cost_s`. Update affected types/validators/docs coherently.
- Deduplicate the complete directed outbound/return cell sequences within the same parcel. If multiple criteria produce the same route, show one candidate with its associated criteria. Return at most three distinct candidates. Do not manufacture detours to guarantee three cards.
- Evaluate complete mission budgets/daylight separately for each actual candidate. A lower-ascent/visibility optimum may be temporally incompatible; report its constraints honestly. Do not claim a globally optimal resource-constrained path search.
- Apply forecast target-validity checks to each candidate's own complete reserved interval. Do not reuse the fastest candidate's environment applicability to justify a longer route that crosses a target boundary.
- Define top-level versus per-candidate assessment explicitly. A viable candidate must not make every other candidate appear viable. Retain request IDs/revisions and reproducible criterion/model versions.

### Configuration suggestions

- Implement a bounded deterministic set of counterfactual evaluations using the same engine. Candidates may change departure, selected humans/robots and explicit load allocation.
- Preserve base, destination, required task durations, total payload and mandatory reserve unless a proposed change explicitly names a separately allowed mission parameter. Do not shorten scientific tasks, drop payload or remove reserve just to obtain viability.
- Any proposed departure must be no earlier than the unchanged decision cutoff and within supported replay coverage. Reevaluate actual daylight and forecast applicability; never use later information for an earlier proposed departure.
- Use the existing payload-preserving comparison validator. If a participant is removed, provide a complete proposed payload allocation within all remaining capacities. Reject suggestions that cannot preserve the required load.
- Keep identities fixed, one-to-four humans, zero-to-two robots, and joint movement. Do not infer demographic effects or specialist task bonuses.
- Evaluate proposals, report exact requested changes and actual deltas in time/margins/ascent/visibility where known, and keep unevaluated advice separate. Never recommend a known-incompatible configuration as a demonstrated solution.
- For unresolved evidence, state that an evaluated numerical improvement does not prove full viability. Never silently apply a recommendation; require an explicit user action and recomputation in the UI.
- Use technical caps, not an exhaustive team/configuration explosion. A reasonable starting cap is three additional evaluated proposals per explicit recommendation request; document it and report incomplete coverage. Separate optional expensive suggestions from the core plan request when needed.

Acceptance: small graphs with genuinely distinct time/ascent/visibility optima; zero-gain/zero-hidden edges and tie handling; duplicate elimination; unchanged fastest regression; per-candidate budgets/environment; and payload-preserving evaluated team/departure suggestions.

## Delivery C: complete-sortie reachable area (P2-07)

- Derive reachability from the complete directed fastest physical-time searches from/to the selected base. Do not use lower-ascent or visibility scores as physical travel time.
- A cell is temporally feasible only if outbound + sequential tasks + return + reserve satisfies the mission limit, every selected participant limit and the applicable actual-location daylight deadline under the existing scenario semantics. Check departure daylight too.
- Exclude missing coverage, exclusions, terrain-limit failures, unreachable outbound or return and incomplete searches. A failed departure-daylight rule cannot yield a fully viable green area.
- When essential evidence such as daylight is missing, distinguish movement/time-only reachability from fully assessed feasibility. Unknown must not be presented as feasible. Preserve reasons and the evaluated domain.
- Do not reconstruct a route to every cell. Reuse base searches and vectorized bounded evaluation. On small maps, compare the area result with independent per-cell mission evaluation.
- Return a bounded versioned raster mask/typed status layer or conservative geometry with exact parcel/grid transform, resolution, counts, assumptions and request identity. Packed masks with explicit encoding are acceptable. Preserve nodata/unknown states.
- Do not serialize millions of cells as expanded JSON booleans or truncate an area to fit the response bound. Keep existing output limits, or deliberately version/document a separate bounded endpoint. Simplification or coarse rendering must not expand feasible territory across obstacles.
- Include actual mission/team/base/solar context in applicability/cache identities. Task/budget changes should reuse movement searches and reevaluate the area cheaply.
- Since communication is a preference, it does not shrink the mandatory feasible area. State that reachability does not prove a preferred communication condition on all paths.
- Add an explicit reachable-area control and legend within the current UI. Keep its Cesium source independent from routes/panoramas. Clear stale data on edits/base/parcel/team changes and discard late responses.

Acceptance: directed no-return cells, barriers, missing data and boundary equality; larger tasks/reserve or smaller budgets cannot enlarge the feasible set with fixed context; independent small-grid agreement; and bounded real-parcel latency/memory/output.

## Delivery D: qualitative material warnings and complete integration (P2-09)

### Material warnings

- Prepare/read a versioned backend representation of the existing THEMIS crop and provenance. Reuse its source extent, nodata and categorical/stretch semantics rather than introducing an unrelated thermal threshold.
- Existing display categories use relative night-IR brightness; they are scenario interpretation, not measured bearing strength, a hazard probability or thermal inertia. Keep that limitation visible.
- Evaluate actual route segments against the crop in the unshifted analytical/geographic frame. Do not classify a route from scene-shifted coordinates or merely its endpoint.
- Summarize known-category/unknown coverage, intersected distance and estimated travel time where supported by the defined sampling/intersection method. Include destination stationary task context separately if reported; exclude unused reserve.
- Warn when route portions cross the existing qualitative loose-material category. Unknown/outside-crop samples remain unknown and cannot imply firm ground. Do not infer more detail than the source's approximately 100 m pixels.
- Material remains advisory only: no edge blocking, speed multiplier, risk percentage or candidate ranking effect. Label why a warning exists and retain the source/version.

### Necessary UI integration, preserving P1's design

- Keep the existing New mission five-step wizard, theme, team cards, live summaries, map previews, controls and language architecture. Integrate capabilities in existing results/layers/advanced areas rather than replacing the flow.
- Wire candidate selection to the corresponding map geometry, metrics, communication summary, material warnings and focus action. The renderer must not continue showing alternative zero regardless of the selected card.
- Show one-to-three distinct candidates accurately, with combined criterion badges for duplicates. Keep incompatible/missing-evidence candidate states and optional suggestions distinct.
- Expose the receiver-height assumptions/configuration clearly. Display "estimated geometric visibility", not radio coverage.
- Show the reachable-area legend and evaluated resolution/status. Preserve scene registration, existing analytical metrics, panoramas, camera and independent layer toggles.
- Suggestions must show exact proposed changes and load redistribution. Applying one is explicit, invalidates the prior result and sends a fresh identified request.
- Preserve stale-response protection for plans, layers, recommendations and async height sampling, including edit/revert and newer-before-older response cases. ES/EN changes must preserve results/geometry and translate labels.
- Correct existing inaccurate synthetic-clock/missing-daylight text only where required to describe actual backend behavior. Preserve accurate warnings about assumed participant capabilities and provisional registration.
- Keep the existing historical environment safeguards. Do not import future `observed`, final-window skill or retrospective event labels into decisions during this work.
- Update static `not_evaluated` declarations to match actual scope. Distinguish evaluated ascent/visibility/material-warning proxies from unevaluated physiology, radio performance and material-strength effects; do not leave implemented metrics universally labeled absent or imply the underlying scientific models were validated.

Acceptance: real Gale flow using current wizard -> plan -> distinct candidate selection -> matching scene -> area toggle -> route warning -> explicit recommendation application. Preserve synthetic and environmental regression cases and all unrelated P1 functions.

## APIs, resources and performance

- Extend the current draft additively where possible. Preserve legacy fastest requests/results and explicit version errors. New options/criteria/area/suggestion routes must be documented and implemented together with their actual consumers.
- Do not silently rename shared-v0 fields or declare shared-v1 acceptance. Metadata must advertise supported capabilities, assumptions and technical limits.
- Preserve physical units/nullability and exact request echo/revision identity. No fixed success fallback, fake alternative, missing-data zero or route through forbidden edges.
- Use source-limited searches, no all-pairs matrices, blocked/vectorized preparation and bounded cache lifetimes. Reuse CSR structure and release incompatible graphs/layers/search arrays rather than retaining every candidate/team/base forever.
- The current real grid has about 2.14 million cells and 2.83 million directed edges for the reference team. Benchmark the actual parcel, not just tiny fixtures. Record startup/preparation, first/warm plan, criteria, area, suggestions, peak process memory and serialized output.
- Expensive optional calculations must not be triggered on every form keystroke or required before showing a baseline plan. Prefer explicit bounded requests and cached/prepared visibility. Avoid a job-system redesign unless demonstrably required.
- Existing browser timeouts do not cancel native search. Handle busy/timeout/errors honestly; do not hide slow work by unbounded retries or merely extending every timeout. If a technical bound is hit, return a structured limitation rather than a truncated success.
- Runtime planning must not train models or require live NASA downloads. Keep generated large archives out of Git; version reproducible preparation, compact manifests, evidence and test data.

## Mandatory completion evidence

Run appropriate existing checks and add independent focused tests for the new semantics:

1. Fastest path/team/mission/environment regressions, including synthetic 800/2600 and real 1718.737528/3518.737528 reference totals, retain their behavior for equivalent inputs.
2. Known small-graph optima for all criteria, physical-duration reconstruction, positive/zero-score edges, directionality and duplicates. No false claim of a globally resource-constrained optimum.
3. Visibility flat/ridge/unknown cases, heights/base invalidation, sampling consistency, interruption continuity through tasks and no reserve exposure.
4. Reachability equality/overrun, directed return failures, barriers/nodata and per-cell agreement with actual mission evaluation; compact encoding round trip and conservative display.
5. Material cell crossings, unknown/outside samples, coordinate alignment, distances/times and absence of traversal/viability changes from advisory warnings.
6. Recommendation load conservation, fixed mission requirements, explicit changed team/departure, actual deltas and rejection of unproven/incompatible "solutions".
7. Actual HTTP consumer/schema/resource checks; frontend typecheck/build and live integration tests. Clearly separate passes, skips and unverified cases.
8. Browser checks of selected-card/map correspondence, area/layer interactions, recommendation confirmation, stale/late responses, ES/EN, real route placement, panoramas and camera behavior.
9. Real-grid performance evidence with technical caps. A method that works only on a tiny map does not close the delivered real-parcel task.

When browser/token/network tools are unavailable, complete independent code/tests, state the exact gap, and provide reproducible checks. Do not fabricate a screenshot or claim verification from a build alone. Platform-required permissions may still need the owner; no routine product clarification is required within these decisions.

## Finalization and owner review

After all four deliveries, update the current task-status document and handoff with implemented versus remaining scope. Do not mark communication/radio validation, scientific capability validation or optional unrelated models as complete.

Fetch main again, integrate necessary upstream work, rerun affected checks, commit and verify the pushed final SHA. Open one PR with an implementation-focused title/body and accurate test/limitation evidence. Do not merge automatically.

Return:

- Delivery commits, branch/base, verified remote HEAD and PR URL/readiness.
- Exact Windows preparation/startup commands with a verified Node/runtime discovery method and occupied-port handling.
- A short acceptance matrix showing how each of P2-05, P2-07, P2-08 and P2-09 is closed.
- Reproducible real/synthetic requests, expected result values, criterion/visibility/material assumptions and performance/output measurements.
- Manual instructions for comparing candidates, inspecting area/warnings and explicitly applying a recommendation in the preserved wizard.
- Any blocked/unverified requirement, with reproduction and recovery commands. Keep the PR unready if a material correctness/consumer requirement failed.
- Post-merge fetch/fast-forward/restart steps that preserve local drafts and private settings.

Do not finish with an offer to implement the rest later. Complete the authorized scope, or identify a concrete external blocker and all independent work completed. The owner should receive a reviewable implementation and use its acceptance evidence before merging.
