# P2-01 handoff: team profiles and directed movement

## Context

Repository: `G21_RED_WAYS`.

Reviewed upstream baseline: `13fb56d5e2066eccc7cca3286980ae293b9fe86d`.

Current design branch: `p2/navigation-design`.

Suggested implementation branch: `p2/team-movement`, created from a revision that includes `docs/NAVIGATION_DESIGN.md` and this handoff. These documents may still be uncommitted: inspect status first and preserve existing changes. Do not assume the files exist in `origin/main`.

Read `CLAUDE.md`, `docs/TAREAS.md`, `docs/NAVIGATION_DESIGN.md`, `contracts/` and this handoff before editing. User-approved decisions in the design take precedence over older generic proposals. All newly authored repository content must be in English.

## Goal

Build the smallest pure-Python team and edge-movement layer that a later directed graph can consume. It must work without a browser, HTTP server, final Gale coordinates or a real raster.

Do not implement Dijkstra, a service, a character editor, an item inventory, split teams, physiological consumption or ML weather training in this task.

## Incremental development and publication

This is the first implementation slice of the navigation engine, not a request to build the entire engine in one task. Complete and publish small, coherent increments on `p2/team-movement`:

| Increment | Scope | Verification before commit and push |
| --- | --- | --- |
| 1 | Catalog structure, immutable identities, mission selection and parameter/evidence documentation. Include the two navigation design/handoff documents if they are still uncommitted. | Import/example works; catalog and selection checks pass. |
| 2 | Mission overrides, payload/capability validation and structured rejection reasons. | Focused validation and catalog-immutability checks pass. |
| 3 | Directed participant movement, group aggregation and the reproducible synthetic example. | Edge-direction and changing-bottleneck cases pass; documented public API works. |

After each increment, inspect the diff, stage only its intended files, make a small English commit and push the feature branch. The project owner explicitly requested incremental feature-branch pushes; do not wait until the whole slice is complete. Do not use a broad staging command that captures unrelated local files.

Report the branch, commit, push outcome, checks and next increment after each delivery. A local commit is not a successful push: verify the remote update. If network access blocks a push, preserve the local commit, explain the blocker and provide the exact command for the user's working terminal. Continue independent local work where possible, but never claim an unpublished commit is available remotely.

Do not force-push, push directly to main or merge without the agreed team review. Small pushes make work visible; an integrated delivery still requires consumer verification. After this slice, stop at the handoff for P2-02 rather than expanding into graph search or the HTTP service.

## Ownership

- Own implementation and focused tests under `engine/`, plus execution/parameter documentation there.
- Propose shared schemas as a clearly marked draft; do not silently replace the v0 contracts or edit `app/`, `scripts/` or prepared data owned by teammates.
- Do not mark T0-01 complete until P1/P3 have confirmed they can consume the agreed exchange.
- Preserve the existing untracked `docs/FLUJO_TRABAJO_EQUIPO.md`.

## Required behavior

1. Represent immutable catalog identity separately from mutable mission configuration. The catalog contains four human characters and two robot units; a request selects 1-4 unique humans and 0-2 unique robots.
2. Validate selected IDs, catalog version, duplicate participants, finite numeric values, units, nonnegative assigned payloads, declared carrying limits, positive speeds/temporal limits and allowed overrides. Reject inconsistent inputs with stable English reason codes and useful field paths.
3. Reject NaN and infinity explicitly. Do not let Python booleans pass as numeric mission values. Do not convert missing values to zero.
4. Age, sex, height, body mass and specialty do not introduce automatic physiological or task bonuses. Descriptive traits summarize explicit capabilities without double-counting effects.
5. Resolve effective operational parameters without mutating catalog objects or other mission requests. A removed participant's payload must not disappear during a proposed comparison.
6. Evaluate one directed metric edge for every participant: travel permission, estimated duration and limiting reasons. Aggregate permission by intersection and group duration by the maximum participant duration for that edge.
7. Keep cell terrain/exclusion information separate from directional rise/run. Preserve the sign of ascent/descent, use nonnegative search costs and never bridge missing essential elevation.
8. Permit independent human and robot movement-model strategies. Physical models/parameter values must have a documented source or an explicit scenario-assumption label. Do not invent numeric damage, safety, fatigue or energy claims.
9. Payload-capacity validation can exist before a justified load-to-speed formula. Unsupported load effects are explicitly not evaluated; no hidden default penalty.
10. Include a structured parameter/evidence register. Before adopting production defaults, record scope, units, source or assumption, model version and limitations. Fixed synthetic values may verify behavior but cannot be presented as validated Mars capabilities.

## Focused verification cases

- One faster human versus one slower human on an identical permitted edge produces the configured duration difference.
- A group uses the slower edge time. Across two edges with different limiting participants, the path time is the sum of edge maxima, not the maximum of participant path totals.
- A restrictive robot rejects a segment humans can traverse; removing it restores that segment under the same human configuration.
- Uphill/downhill behavior follows the selected, documented model. It must not lose direction by applying an unconditional absolute value.
- Missing terrain, excessive slope or payload, unknown IDs, duplicates, invalid override names and nonfinite values return explicit reasons.
- Mission overrides never alter the fixed roster or a subsequent mission.
- Reducing team size preserves and reassigns required payload in comparisons, or the proposed comparison is rejected as unevaluated/incomplete.

## Delivery

- Pure functions/models with a small public API and no network or GUI dependencies.
- A synthetic, reproducible example showing input, per-participant output and aggregated group output.
- A focused test command, dependency instructions and the parameter/limitations register.
- Proposed contract deltas, including any unresolved capability or time semantics, for review by P1/P3.
- A final handoff with branch, commit if created, changed files, checks run, remaining limitations and the next P2-02 integration step.

Incremental pushes to the feature branch are authorized as described above. Do not merge to main or announce a shared contract as final merely because this local slice passes its tests. Another team member must be able to consume the agreed result.
