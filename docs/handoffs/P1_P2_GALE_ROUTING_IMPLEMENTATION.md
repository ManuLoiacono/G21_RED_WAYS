# Connect calculated navigation to the Gale scene

Date: 2026-11-14.
Reviewed frontend: `p1/http-mission-integration` at `7c7ba51`.
Reviewed integrated-main baseline: `65b73cb`.

## Assignment for Codex

Implement the next integration between the navigation engine, registered analytical terrain and the existing Cesium scene. Start from the existing calculated frontend, preserve its behavior, and deliver small verified commits and pushes. Do not merge automatically.

The owner observed three concrete issues: old visual test destinations remain on Gale; a calculated route appears only inside the results panel; only one candidate is available. Resolve the obsolete visual content and complete geographic routing first. Treat additional optimization criteria as a separate increment with explicit definitions.

Read this document in full, applicable `AGENTS.md` files, `CLAUDE.md`, and the references below before editing. Report what is already available and what must be implemented, then proceed with the authorized work. Do not ask the owner to repeat information already present in the repository.

## Verified starting state

- The frontend consumes `p2-plan-draft-1` through `/health`, `/parcel`, `/catalogs` and `/plan`.
- Team selection, mission overrides, tasks, budgets, daylight checks, visible errors, language switching and stale-response protection are connected.
- Every successful planning response is calculated by the engine. There is no active static planning-response fallback.
- The service currently registers only a small synthetic metric parcel. Its coordinates have no geographic conversion.
- `app/src/mission/api.ts` selects that synthetic parcel explicitly; frontend validators currently require `geographic_conversion: unavailable`.
- `app/src/mission/routes.ts` renders returned metric geometry in SVG. It deliberately contains no Cesium conversion.
- `app/src/main.ts` still imports `fixture_route.json` and `fixtures/poi.fixture.json`, creates `test_route`, and displays old geographic test POIs. These are separate from service-registered planning locations.
- `service/exchange.py` accepts only `fastest` and returns one candidate. Missing effort and communication alternatives are an implementation boundary, not a rendering defect.
- `data/processed/gale/` did not contain an analytical package at review time. Reinspect disk and updated branches rather than assuming a later P3 package is missing.
- The panorama module displays optical observations. Its markers are not automatically registered mission destinations.

## Required references

- `docs/NAVIGATION_DESIGN.md`
- `docs/ENVIRONMENT_REPLAY_DESIGN.md`
- `docs/handoffs/P1_P2_FRONTEND_INTEGRATION.md`
- `docs/handoffs/P1_HTTP_API_INCREMENT3.md`
- `service/HTTP_API.md` and `service/EXCHANGE_DRAFT.md`
- `service/prepared.py`, `service/planning.py`, `service/exchange.py`
- `engine/grid.py`, the routing implementation and `engine/PARAMETERS.md`
- `scripts/build_hirise_tiles.py` and `scripts/README.md`
- `app/src/hirise.ts`, `app/src/terrain/elevationGrid.ts`, `app/src/terrain/parcel.ts`
- `app/src/main.ts`, `app/src/mission/`, `app/src/panoramas/`
- Existing manifests, processed-data metadata and control-point reports actually present in the checkout.

Some planning documents describe earlier implementations. Use executable code and current acceptance results to establish completion; do not copy obsolete checklist states or legacy conditional-daylight behavior into new code.

## Branching, ownership and publication

1. Inspect the working tree and fetch origin. If networking is unavailable, state the limitation and use the newest available local references without claiming a successful fetch.
2. The starting branch must contain the frontend integration through `7c7ba51`, or its reviewed equivalent after a squash merge. If updated main contains it, branch from main. Otherwise branch from the integration feature branch and document that dependency. Do not discard the integration by starting from older main.
3. Create a dedicated feature branch, for example `p1/gale-routing-integration`. Do not switch another running contributor's worktree; use an isolated worktree when necessary.
4. Coordinate any overlapping P3 preparation work before replacing its files. Reuse delivered data and adapters where suitable.
5. Preserve unrelated changes and `docs/FLUJO_TRABAJO_EQUIPO.md`. Never stage everything indiscriminately.
6. All new code, comments, logs, documentation, filenames and commit messages must be English. UI strings belong in both existing ES/EN dictionaries.
7. Never print, commit or overwrite private `.env` values. Keep real tokens out of `.env.example`.
8. Commit and push each meaningful verified increment separately. Verify the pushed SHA when possible; report authentication/network failures accurately. Do not merge or delete branches.

## Delivery A: remove confusing legacy scene content

- Stop displaying the old `test_route` and geographic test base/destinations by default.
- Remove obsolete production imports and handlers when no longer needed. Existing fixture files may remain as explicit development/test assets.
- If a diagnostic fixture layer is retained, it must be opt-in and visibly identified as a separate test layer. It must not determine current planning inputs.
- Preserve real panorama markers, their viewer, source panels, language switching, scene controls and camera behavior.
- Explain unavailable geographic planning directly in the UI until a real registered parcel is ready. Keep the existing calculated synthetic mode usable and clearly labeled.
- Do not replace the old fixture route with a hand-drawn route or straight line presented as an engine result.

Acceptance: the initial scene no longer presents old demonstration destinations or a test route as the active mission. Panorama behavior and synthetic engine planning still work.

## Delivery B: register a real analytical Gale parcel

Inspect P3 packages and existing preparation scripts first. If the required package has not been delivered, implement the minimal reproducible analytical preparation using the documented HiRISE source and existing parcel bounds. Record assumptions and missing dependencies. Do not treat the visual mesh or cursor grid as a complete analytical package.

The prepared package must define:

- Parcel identity, exact version/content identity, bounds and reference system.
- Native metric transform, row direction, cell-centre convention and search resolution.
- Analytical elevation, valid coverage, explicit exclusions and conservative missing-data semantics.
- Slope preparation/aggregation policy and a processing halo where derivatives require one.
- Source/product, preparation parameters and reproducible commands.
- Registered base/destination locations with a clear hypothetical or observed-location classification.

Use a bounded prepared parcel, approximately 3 x 3 km if the reviewed bounds support it. Do not build a whole-Gale graph. Preserve directed edges, conservative corner handling and existing team traversal rules. Do not fill missing terrain with zero or snap invalid destinations into an unrelated valid cell.

Keep raw analytical elevations unchanged. Terrain costs and ascent/descent must use the analytical data, not scene height sampling or display shifts. Keep large generated raster/mesh files out of Git; version scripts, manifests, compact evidence and small acceptance fixtures instead.

Extend service registration/loading and parcel discovery as necessary. Remove the frontend's hardcoded synthetic-only selection by consuming explicit supported parcel metadata. Do not silently select an arbitrary newest package. Record a legitimate base/destination result or explain why no route was found; do not manufacture a corridor to force success.

Environment is an independent boundary. Real terrain must not make synthetic daylight, clocks, profiles or weather appear observed. Use reviewed location-matched solar evidence when available. Otherwise preserve an explicitly assumed development scenario or return missing evidence as appropriate, with separate provenance and no unsupported real-mission viability claim. Do not invent a new real-time mapping just to make the case pass.

Acceptance: a reproducible engine invocation loads the real analytical package and calculates outbound and return search results with parcel/data versions, resolved cells, metrics and honest environmental assessment.

## Delivery C: display the calculated route on Gale

- Define a versioned analytical-to-geographic and geographic-to-scene adapter consistent with the actual source CRS and P1's verified display convention.
- Read the registered adapter/metadata rather than duplicating untracked constants in several modules. Extend the draft exchange deliberately and update producer, validators, types, examples and documentation together. Preserve existing synthetic regression cases.
- The existing mesh preparation reports a DTM-to-scene horizontal shift of -25 m east / +35 m north and a vertical offset of +56.2 m. Inspect actual metadata and control evidence before adopting them for the active parcel. These are previously measured display-registration values, not universal Martian offsets.
- The panorama-only +71.2 m correction relates rover geoid heights to the visual tileset. It is not the analytical DTM correction and must never enter movement costs or be added to every route height.
- Preserve P1's established latitude/display convention. Do not introduce an unreviewed extra latitude conversion. Apply the reviewed horizontal transform exactly once; invert it exactly once for scene selections.
- Draw returned outbound and return vertices as separate scene entities, retaining visible direction/style when they overlap. Use the existing ground-draping approach where appropriate and validate its behavior against the rendered tilesets.
- Position active base/destination markers from the same registered parcel and transform as the calculated route. Preserve requested versus effective cell-centre coordinates.
- Clear or mark route entities stale on every relevant edit. Reject late responses before replacing geometry. Preserve result identity and geometry across ES/EN changes.
- Keep the local metric preview for inspection. Missing legs stay missing; same-cell legs are points. Never draw a fabricated return leg.
- Present horizontal distance, ascent and descent from returned analytical leg metrics with clear units and unavailable states, alongside existing durations and margins.

Acceptance: a calculated route starts/ends at the resolved registered locations, follows the expected scene placement at documented control points, and remains visually distinct from optical observations and diagnostic assets.

## Review gate after the first real geographic result

Finish and publish deliveries A-C in small increments, then stop for owner/P1/P3 review before starting additional optimization or simulation. Report incomplete controls or unavailable data explicitly. A missing token or external data access must not be concealed by a synthetic success on Gale.

## Follow-up D: destination selection on the active parcel

After the geographic adapter is reviewed, connect scene picking to analytical coordinates, server-side bounds/mask checks and resolved cell centres. Clearly identify a clicked target as hypothetical unless it has an actual scientific reference. Out-of-bounds, uncovered and excluded selections must produce explicit feedback. Never assume a panorama is a valid target merely because its marker is visible.

## Follow-up E: alternatives and evaluated suggestions

The current single fastest candidate is correct for the implemented search. Immediately label it accurately; do not imply that several criteria or recommendations were evaluated.

After the real-routing review gate:

- Implement a distinct lower-relative-effort criterion only with an explicit adopted proxy, units/interpretation, nonnegative search costs and documented assumptions. If no definition is adopted, propose it for review before activating new numeric weights. Do not claim calories, oxygen or battery use.
- Prioritize base-relative geometric communication next, using P3's known/hidden/unknown visibility semantics. Do not invent a visibility layer or describe it as proven radio coverage.
- Deduplicate candidates with identical relevant geometry. One distinct candidate remains a valid output.
- Suggestions must run through the evaluator with explicit configuration changes and reported metric deltas. Preserve mission requirements and total payload, including explicit reassignment when removing a participant.
- Do not manufacture alternatives by changing colors, reversing an outbound path, adding random detours, weakening mandatory constraints or returning fixed cards.

Weather-model integration, radiation/DONKI effects, fatigue, reachable-area overlays and simulated progression are separate work and must not expand deliveries A-C.

## Verification and evidence

Run relevant existing checks once, and add focused tests for newly introduced transformations, package loading and routing behavior. Do not add tests that merely repeat implementation details.

Required evidence for deliveries A-C:

1. Existing synthetic baseline still yields 800 s activity / 2600 s including reserve. Task +1 s, rover -1 s, daylight boundary and missing-evidence cases retain their semantics.
2. At least three useful control locations check grid cell centres, metric/geographic round trips and scene placement. Report tolerances and measured error separately for numerical inversion and actual visual registration.
3. Bounds, nodata/exclusions and blocked diagonals remain respected. Geometry is identical to the returned analytical route after the documented display transformation.
4. A real parcel case records selected team, source/data versions, resolution, outbound/return metrics, graph-build/search time and peak memory using the existing benchmark approach.
5. Browser checks cover stale edits, language changes, connection errors, route replacement/clearing, coincident legs, and absent return geometry.
6. With a valid local ion token, inspect real Gale terrain, route endpoints, marker placement, panorama picking, layer toggles, camera clearance and optional HiRISE registration. A token-free component harness alone does not establish these results.
7. Shared-v0 files remain unchanged unless an explicit reviewed migration is necessary. Update the development draft and consumers coherently when extending it.

If a resource bound is reached, report it without truncating a successful route. Document a justified resolution adjustment instead of silently weakening constraints. Browser timeout/disconnect must not be described as cancellation of native search.

## Final handoff

Provide the owner with:

- Each delivery's commit SHA, push verification and branch/base dependency.
- A precise implemented/pending list, including any unmet acceptance case.
- Exact Windows commands for preparation, service and frontend startup.
- One reproducible real-terrain request and calculated response summary.
- A screenshot of the calculated route on Gale when browser access permits it.
- Control-point evidence, performance measurements and provenance/assumptions.
- Any required P3 input stated as an exact missing file/field/convention.
- PR title/body and post-merge verification instructions; do not merge automatically.

The desired result is one demonstrably calculated outbound-and-return route on the actual analytical Gale parcel, with the same mission shown consistently in the form, result panel and geographic scene.
