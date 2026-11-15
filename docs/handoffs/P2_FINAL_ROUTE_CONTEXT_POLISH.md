# Final scoped delivery: route terrain context and existing environment presentation

Date: 2026-11-15.
Reviewed main: `19d8303`. Fetch and inspect newer main before starting.
Source checkout: `C:/Users/Usuario/Desktop/Nasa Challenge/G21_RED_WAYS`.

## Owner instruction

Implement this bounded finishing pass in one feature branch and one PR. Make the code changes, run appropriate checks, push and leave a reviewable result. The owner will perform final acceptance and merge. Do not merge automatically or stop after another planning document.

This assignment supersedes the older broad four-delivery assignment for the work below. Do not reopen already implemented comparison, visibility, reachability or progress work. Necessary small frontend integration is authorized, while preserving P1's current wizard, theme and interaction flow.

There are exactly three objectives:

1. Complete qualitative THEMIS warnings for the actual calculated routes.
2. Present the pressure, temperature and RAD context already calculated by the service.
3. Remove the frontend's out-of-scope capability inventory, including the visible "Not evaluated" list.

Do not add physiological models, real-world capability validation, weather-to-speed effects, human exposure limits, terrain-shadow evaluation or radio-performance models. Do not advertise these as missing features in the UI. Preserve backend scientific/provenance metadata; this is not permission to claim that those models exist.

## Starting checks and preservation

- Read applicable `AGENTS.md` and `CLAUDE.md`, current `docs/NAVIGATION_EXTENSIONS.md`, the environment delivery and the relevant source files. Newer owner instructions in this document control the bounded scope.
- Fetch origin, inspect current main and create a new branch, for example `p2/final-route-context`. Prefer an isolated worktree if another contributor is active. If fetch fails, report the limitation and use the latest fetched refs without claiming freshness.
- Preserve unrelated work, other worktrees, private `.env` files and `docs/FLUJO_TRABAJO_EQUIPO.md`. Never stage unrelated files or print tokens.
- Read this potentially untracked assignment from the source checkout before creating the worktree; include it in a scoped commit when appropriate.
- Keep all new code/comments/docs/commits/PR text in English. Add user-facing strings through both existing ES/EN dictionaries.
- Use compatible existing engine/navigation runtime dependencies. No ML training, new source downloads or infrastructure redesign is required.

## 1. Qualitative terrain warnings

Inspect:

- `app/src/thermal/themis.ts` and `themis_nir_parcel.json`
- `scripts/build_themis_parcel.py` and its source/provenance metadata
- `service/planning.py`, `exchange.py`, candidate encoding and current route metrics
- `app/src/mission/results.ts` and the current selected-alternative wiring.

`app/src/mission/flowMaterial.ts` is a Cesium drawing shader, not terrain-material analysis. Do not mistake it for completion of P2-09.

Requirements:

- Use the existing small THEMIS crop, its actual bounds/nodata/stretch and current qualitative categories. Do not introduce a new physical hazard threshold or infer bearing strength.
- Add a small versioned backend terrain-context evaluator or prepared representation, reusing the existing data without a live request. Do not make runtime planning depend on a browser call or external source.
- Evaluate the actual analytical outbound and return segments, not the scene-smoothed drawing or just the destination. Transform analytical metric coordinates to the crop's geographic frame consistently; never apply scene registration or panorama height shifts.
- Aggregate covered distance by the existing qualitative categories and retain unknown/outside/nodata coverage explicitly. Use a deterministic segment/cell crossing method so a crossed coarse raster cell is not skipped merely because neither endpoint lies inside it.
- Summarize affected distance and the source resolution. Travel/task time breakdown is optional only if it uses existing physical durations consistently and adds negligible implementation scope; it is not needed to close this pass. Never count unused reserve as activity.
- Return advisory context for each actual alternative. No route blocking, speed multiplier, risk percentage, optimization-weight change or mission-status change from THEMIS.
- Add a compact warning/context line to the existing result card when the route intersects the current warning category. Use accurate positive wording such as "Terrain context" / "THEMIS relative night-IR signal"; keep detailed source/method on demand.
- Unknown data must not become zero warning or confirmed firm ground. The public UI can omit an unavailable optional terrain summary; backend metadata must retain its actual coverage/status. Do not claim the entire route is characterized from a partial crop.
- Keep missing/unavailable legs valid: do not fabricate geometry or emit nonfinite metrics.

## 2. Existing environmental context in results

- Read the selected alternative's existing environment evidence. Candidates can have different target-validity coverage; do not display the fastest candidate's context as applicable to every selected route.
- Show a compact existing-style summary of pressure, daily minimum/maximum temperature and the RAD background rate when eligible values are present. Preserve units, quantiles and source/target dates or horizons in readable labels/tooltips.
- Use the decision-safe records already returned by the service. Do not load raw forecast files in the browser, expose later `observed` values/final-window skill or recompute forecasts.
- Identify RAD positively and accurately as the detector B background rate in microgray/day. Do not call it astronaut dose or imply a health threshold.
- Present historical observations and model predictions with their existing evidence classifications. Do not create an hourly weather curve from daily values.
- Omit unavailable optional values/rows rather than inventing values or replacing nulls with zero. Keep required missing evidence and actual incompatible/search/error states visible through existing mission handling.
- No new permanent side panel, dashboard, wizard step or redesigned layout. Fit the summary into current results and existing source/evidence details.
- If the service already supplies the required values, limit backend changes to the minimum needed for a clean additive consumer shape. Do not redo the provider.

## 3. Remove the out-of-scope UI inventory

The screenshot's list originates from backend `not_evaluated` and is rendered in `app/src/mission/results.ts`. The backend starts from broad scope constants in `engine/mission.py`/`routing.py`, then refines some fields in `service/exchange.py`.

- Remove the visible "Not evaluated: Material / Physiology / ..." paragraph and any other feature-absence checklist in the affected public flow, including equivalent translated text/drawers.
- Do not replace it with another warning banner enumerating missing models or upcoming work. Describe available functionality positively: estimated geometric visibility, environmental predictions and terrain context.
- Preserve backend metadata, assumptions and method/provenance records for traceability; do not falsify `not_evaluated` to make the screen look complete.
- Retain necessary positive scope labels such as modeled, assumed, historical and geometric. Remove neither genuine mission incompatibility nor required-data/error feedback.
- Do not claim real radio performance, physiological prediction, human radiation safety or physical validation. The intended change is presentation of the agreed product scope, not a false scientific capability claim.

## Verification, commits and PR

Keep this one branch/one PR. Two or three small commits are sufficient; no staged approval pauses are required. Do not spend the delivery building another general framework or expanding the backlog.

Required focused checks:

1. Known THEMIS category crossings, partial segment intersections, crop boundaries, nodata/outside coverage and frame alignment. Advisory context must not change route geometry, physical duration, eligibility or mission assessment.
2. Per-alternative selection changes both terrain/environment summaries to the matching data; null optional rows remain absent, not zero.
3. Out-of-scope capability inventory is absent in ES and EN; existing source classifications and mission errors still work.
4. Existing affected backend/consumer regressions, frontend typecheck and production build. Preserve comparison selection, reachability, recommendations and progress/reevaluation behavior.
5. Browser smoke when tools permit: current wizard -> calculate -> select route -> inspect terrain/environment -> switch language -> edit/recalculate. Preserve map paths, panorama/camera controls and existing theme.

Clearly distinguish tests passed, skipped and not available. If a token/browser is unavailable, complete independent checks and provide the exact remaining manual acceptance steps; do not claim that a build proves browser behavior.

Commit and push the verified changes. Incorporate relevant newer main before finalization without rewriting published history. Open one PR, for example `Complete route terrain context and simplify environmental results`, and do not merge it.

Finish with the PR URL, commits/remote HEAD, exact scope completed, actual checks and three short manual acceptance steps. Keep the physiological/radio/shadow/exposure-model backlog in developer documentation, not as a public feature-absence inventory. The owner should receive a bounded, reviewable finishing change.
