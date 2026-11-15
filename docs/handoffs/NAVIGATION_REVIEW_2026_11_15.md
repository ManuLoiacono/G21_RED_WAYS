# Navigation review and implementation queue

Review date: 2026-11-15.
Reviewed main: `ec00116` (PR #13, camera orbit).
Previous reviewed frontend: `7c7ba51`.

## Executive result

Main now includes real HiRISE analytical routing, geographic route rendering, historical REMS context, a qualitative THEMIS display, improved panorama/camera interaction, and the ML/data pipeline with exported hindcasts. The navigation algorithms in `engine/` did not change in this comparison. The major navigation changes are data preparation, service registration, coordinate adapters and frontend consumers.

The next integration is no longer "make a Gale route". That route can already be calculated and displayed. The critical next work is to connect reviewed solar/time evidence and historical forecast providers to the existing mission service, keeping information available at decision time separate from retrospective verification.

The production planner currently does **not** consume the new ML exports, DONKI evaluation, REMS visual layer or THEMIS visual layer as route effects. Do not describe these display/data deliveries as completed navigation integration.

## Repository update and preservation

- The owner successfully fetched origin; this executor's fetch failed with `getaddrinfo() thread failed to start`.
- The original checkout was moved to `main` and fast-forwarded to the fetched `origin/main`, `ec00116`.
- There are 40 commits and 151 changed paths between `7c7ba51` and the reviewed main. Many paths are repeated per-sol exports or generated metrics, not independent features.
- `docs/FLUJO_TRABAJO_EQUIPO.md` was left unchanged and untracked.
- Incoming main tracks `docs/handoffs/P1_P2_GALE_ROUTING_IMPLEMENTATION.md`. To avoid overwriting the older untracked local copy, it was preserved at `C:/Users/Usuario/Desktop/Nasa Challenge/navigation-review-backups/P1_P2_GALE_ROUTING_IMPLEMENTATION.pre-main-20261115-005717.md` before the fast-forward.
- The separate `G21_GALE_ROUTING` worktree was inspected without changing its branch or its modified screenshot.
- This review changes documentation only. It does not implement new navigation behavior or retrain models.

For a future update, first inspect the working tree and preserve any untracked path that would collide with incoming tracked files:

```powershell
Set-Location -LiteralPath "C:\Users\Usuario\Desktop\Nasa Challenge\G21_RED_WAYS"
git status --short --branch
git fetch origin --prune
git switch main
git merge --ff-only origin/main
git status --short --branch
git log -12 --oneline --decorate
```

Never resolve an untracked-file collision with a hard reset or blanket deletion.

## Merged changes and their impact

| Merge | Delivery | Navigation impact |
| --- | --- | --- |
| `fc0cc89`, PR #8 | HTTP mission frontend integration | Central catalogs/templates, real service requests, calculated results, visible failures, stale-result rejection and local metric preview. |
| `e251808`, PR #9 | Gale routing integration | Removes legacy mission fixtures; prepares real analytical terrain; registers exact parcels/scenarios; renders calculated outbound/return routes and displays distance/ascent/descent. |
| `43a3846`, PR #10 | ML and space-weather delivery | Adds A1/A2/B1, baselines, exported forecasts, RAD processing and C1 DONKI/RAD/MAVEN evaluation. Runtime integration remains pending. |
| `39485cc`, PR #11 | Panorama and thermal work | Adds perspective 360-degree panorama viewing and a THEMIS night-IR display. THEMIS is qualitative and does not affect route evaluation. |
| `50a008b`, PR #12 | REMS environment and rover icons | Adds historical daily reports, rover position, live-fetch/cache fallback and panorama icons. These are contextual layers, separate from service evidence. |
| `ec00116`, PR #13 | Camera interaction | Adds terrain-centred orbit, mouse/trackpad modes, pinch and keyboard movement. These affect presentation, not route costs. |

Inspect individual files with `git diff 7c7ba51..ec00116 -- <path>` and the complete file inventory with `git diff --name-status 7c7ba51..ec00116`.

## Real-terrain navigation now available

Primary sources: `scripts/prepare_gale.py`, `service/gale.py`, `service/http_server.py`, `app/src/mission/geography.ts`, `app/src/mission/sceneRoutes.ts`, and `docs/handoffs/GALE_ROUTING_DELIVERY.md`.

- Parcel: `gale_hirise_019698`, version `native2-v1`.
- Grid: 1463 x 1463 cells at approximately 2.023493589 m, about 2.96 km square.
- Elevation comes from the documented HiRISE DTM. Native values are retained, search elevations are block means, and native slopes are aggregated conservatively by maximum.
- Missing derivative stencils block coverage; no missing elevation is filled with zero.
- No scientific exclusion mask was supplied. The explicit exclusions are all false; participant slope/edge restrictions still apply. Small rocks and material hazards remain unevaluated.
- The three registered engineering locations are hypothetical, not newly verified scientific sites.
- Requests retain metric analytical coordinates; the response supplies a versioned display adapter.
- P1's DTM-to-scene translation is applied once. Panorama geoid +71.2 m is separate from the DTM display registration (-25 m east, +35 m north, +56.2 m vertically).
- Routes, active endpoints and analytical parcel bounds now use the registered adapter. Old fixture route/POI imports were removed from production scene setup.
- Scene route edits clear results and reject outdated marker-height sampling. Language switching preserves calculation identity.

The geographic registration remains provisional: numerical round trips and sampled height agreement do not establish independent horizontal survey accuracy. Optional generated HiRISE interaction and exhaustive camera-clearance checks still require local scene review.

### Recalculated case during this audit

The updated main's code was executed with the already-generated package in the adjacent worktree. Its array identities were verified by the package loader.

| Result | Measured value |
| --- | --- |
| Traversable team cells / directed edges | 496,561 / 2,834,284 |
| Outbound | 149.416 m, 539.208 s, +10.655 m / -0.073 m |
| Return | 149.416 m, 579.529 s, +0.073 m / -10.655 m |
| Geometry | 62 vertices in each leg; matching geometry was calculated independently. |
| Activity / including reserve | 1718.737528 s / 3518.737528 s |
| Assessment | `insufficient_evidence`; required `daylight` is missing. |
| Package load / graph / two searches / reconstruction | 0.862 / 2.039 / 0.397 / 0.022 s |
| Process peak memory | About 335.2 MiB; whole-process high-water measurement. |

This result validates movement calculation and budgets under the declared synthetic participant model. It does not supply the missing solar assessment.

### Startup dependency that still matters

`terrain.npz` is intentionally ignored by Git. After this update it exists in `G21_GALE_ROUTING`, but **not** in the original `G21_RED_WAYS` checkout. Main contains its manifest, not the generated archive. A plain `python -m service` still defaults to synthetic mode.

Normal reproducible setup is documented in `scripts/README.md`: prepare the archive using the analytical requirements, then start with `--gale-package data/processed/gale/analytical/manifest.json`.

For reviewing the existing verified package without regenerating or copying it, the updated main can use its absolute manifest path:

```powershell
# Run from G21_RED_WAYS. This reuses the generated data only; it executes main's service code.
& 'C:\Users\Usuario\anaconda3\python.exe' -m service --gale-package 'C:\Users\Usuario\Desktop\Nasa Challenge\G21_GALE_ROUTING\data\processed\gale\analytical\manifest.json'

# In a second terminal at the same repository root:
& 'C:\Users\Usuario\anaconda3\python.exe' -m service.client --request service/examples/gale.request.json
```

Use these commands only after stopping any older service that owns port 8000. The external worktree path is a local review convenience, not a portable setup requirement. A clean checkout must regenerate or receive a verified adjacent archive.

## Environmental and predictive deliveries

| Component | Delivered output | Current planning integration |
| --- | --- | --- |
| REMS | Browser daily-report layer, rover locations, backup, processed weather dataset | Display context only. No location-matched daylight record enters the real Gale scenario. |
| THEMIS | Approximately 30 x 30 night-IR brightness cells, relative display and cursor support | Display only. No material penalty, route warning aggregation or exclusion. |
| A1 pressure | Ridge/LightGBM, altitude-normalized anomaly models and baselines | Forecast JSON exists; no service provider consumes it. |
| A2 temperature | Separate daily minimum/maximum models and p10/p50/p90 | Forecast JSON exists; no supported hourly weather curve or mission threshold. |
| B1 background dose | RAD silicon-detector B, RTG-corrected rate in microgray/day; models and baselines | Forecast JSON exists; not human dose equivalent, particle-event prediction or suit autonomy. |
| C1 DONKI | Evaluation of ENLIL Mars arrivals against retrospective RAD/MAVEN events | Evaluation artifacts exist; no live replay-alert provider or automatic mission veto. |
| B2 / dust / A3 UV / C2 correction | Listed as optional follow-ups in ML planning | Not implemented by this delivery. |

### Data/export inventory checked

- Replay window: 2025-10-25 through 2025-12-05, sols 4699-4739, 41 sols.
- `daily_weather.parquet`: 4,995 consecutive sol rows; all 41 replay rows have sunrise/sunset strings.
- `rad_daily.parquet`: 4,995 sol rows; `rad_hourly.parquet`: 119,581 hourly rows.
- `space_weather_events.parquet`: 9,660 event/simulation rows.
- Forecast exports: 41 JSON files and 574 forecast rows. All numerical values are finite and all exported p10 <= p50 <= p90 checks passed.
- A1 and B1 horizons: 1, 3, 5, 10 sols. A2 minimum/maximum horizons: 1, 3, 5 sols.
- Exported candidates follow validation selection: A1 LightGBM normalized at 1/3/5, Ridge normalized at 10; A2 minimum LightGBM quantiles and maximum Ridge; B1 LightGBM at 1/3/5 and the 27-sol moving-average baseline at 10.

These are artifact and protocol checks, not a fresh training run. `docs/ML_RESULTADOS.md` reports the performance with limitations. In particular, minimum-temperature quantile coverage is below its nominal 80% in validation; the short final window must not replace that validation finding.

## Integration findings that determine the next work

### 1. Real daylight and replay time are still a blocking dependency

`service/gale.py` deliberately registers a missing-daylight development scenario. It inherits a synthetic clock valid only from 2025-10-25 11:00 UTC to 2025-10-26 12:00 UTC. It cannot cover the 41-sol replay just by changing the form date.

The new REMS sunrise/sunset strings and the `marstime` reference in `docs/ML_PREDICCION.md` make implementation possible, but are not already connected. Use actual evaluation coordinates, a reviewed sol/UTC convention and physical seconds. The example's fixed nominal latitude is not automatically the active parcel's latitude. Preserve the distinction between local solar minutes and terrestrial elapsed seconds. Do not add route seconds directly to a Mars HH:MM clock.

P1's date-matched REMS layer may use a clearly labeled earlier report within three Earth days. That display fallback does not establish location-matched sunlight or historical publication availability for mission evaluation.

### 2. Forecast exports require a decision-safe adapter

All 574 exported forecast rows include the target's later `observed` value for retrospective evaluation. Documents also contain `skill_summary` computed over the entire final window. Neither belongs in early replay decision inputs or candidate ranking.

`cutoff_utc` is the frozen **training cutoff**. It is not the forecast issue instant or the replay decision cutoff. The exports have an issue sol/date but no exact `issued_at_utc`, input-availability instant, complete validity interval or per-record revision. Daily summaries through the issue sol require that sol to be completed and available before use. Choose the demo's exact first decision only after this convention is resolved.

Implement an explicit transformation into prepared decision records with units, source location/spatial scope, issue/validity times, availability basis and model version. Preserve quantiles; the current generic record parser expects scalar values except daylight and cannot consume the forecast contract unchanged. Map names deliberately (`min_temp_c`/`max_temp_c` versus the service's `daily_min_temp_c`/`daily_max_temp_c`). Keep verification observations and full-window skill in a separate retrospective output.

The service already filters eligible record issues, revisions and observation intervals. Reuse that boundary rather than bypassing it with a raw file payload in `/plan`.

The current selector does not yet associate forecast `valid_from_utc`/`valid_to_utc` with the mission's target interval; those fields are structurally validated but do not select a forecast for this particular mission. The new provider must match target sol/validity and keep distinct horizons/series before choosing the latest eligible revision. Issue-time eligibility alone does not establish applicability.

### 3. Spatial and scientific scope must remain explicit

The models are conditioned on Curiosity's historical observations and issue-time rover elevation. They are not a validated pointwise weather field over the analytical parcel. Display source location and any declared applicability assumption. Do not silently turn pressure, temperature or dose into edge-speed multipliers, operational thresholds or automatic mission prohibitions.

REMS daily extrema do not establish the coldest hour. RAD microgray/day describes the selected silicon detector; it does not provide human effective dose or a validated shielding model. THEMIS display brightness does not supply a quantitative terrain-strength model.

### 4. C1 artifacts are retrospective evaluation, not a ready replay feed

`ml/evaluation/c1_donki.py` selects the latest eligible ENLIL run before its predicted arrival, merges nearby arrivals and labels RAD/MAVEN events using centred background windows. These operations serve its documented retrospective evaluation.

For replay, select revisions from the event/simulation records available at the current decision cutoff **before** grouping/selecting latest runs. Filtering the final `alerts.parquet` alone cannot recover an earlier revision that evaluation already discarded. Do not expose centred-window event detections as online predictions. Preserve the reported false alarms, small final-window sample and MAVEN alert-window sampling bias.

### 5. Preserve separate engine and ML environments

Engine requirements pin NumPy 1.26.4 / SciPy 1.11.4; the ML environment pins NumPy 2.5.4. The installed SciPy metadata requires NumPy <1.28.0. Installing both requirement sets into one interpreter would conflict.

The runtime can consume already-exported JSON through a lightweight provider without training dependencies or model fitting during `/plan`. Keep training in its own environment. No retraining is needed to begin runtime integration.

### 6. Several agreed navigation extensions remain absent

- Only a static fastest candidate is calculated; no relative-effort or visibility-prioritized search.
- No evaluated team/configuration recommendations, despite explanatory failure reasons.
- No visibility/interruption evaluator or prepared known/hidden/unknown visibility layer.
- No reachable-area output, scene-picked analytical destination flow or remaining-mission replanning.
- No simulated progression/event handling; a new route request must not later reset consumed budgets.
- No route-level THEMIS/material warning aggregation.
- No accepted shared-v1 migration. Active planning is still an explicit development draft; forecast v0 is another exchange that needs deliberate mapping.

The original P2 task checklist is stale relative to working code. Update statuses from verified behavior, preserving partial completion where real evidence or additional criteria remain missing.

## Prioritized implementation queue

| Order | Work | Existing basis | Acceptance |
| --- | --- | --- | --- |
| 0 | Make real-package startup reproducible in the primary checkout | Prepared manifest/archive loader and commands already exist | New terminal selects real Gale explicitly; missing archive fails clearly; no accidental synthetic-only demo. |
| 1 | Real solar/time adapter and replay coverage (P2-04/P2-06 closure) | REMS data, documented solar reference, pure daylight evaluator | Location-matched physical-second daylight, exact boundary and missing-data checks across the replay window. |
| 2 | Read-only hindcast/observation provider | 41 exported files and existing per-record selection | Latest eligible forecast with preserved quantiles; no future `observed`, final-window skill or unavailable issue-sol inputs in decisions. |
| 3 | P1 environmental result integration | REMS panel and new provider | Same replay date/cutoff as the mission; separate observed/forecast/retrospective labels; no hidden movement effect. |
| 4 | Original distinct effort candidate and geometric communication extension (P2-05/P2-08) | Directed graph, route metrics and terrain now available | Adopt an explicit effort proxy; prepare visibility with unknowns; deduplicate candidates; report interruption metrics honestly. |
| 5 | Scene-picked destinations and evaluated suggestions | Inverse display adapter and coordinate resolver exist | Bounds/mask-validated targets and counterfactuals with preserved mission/payload requirements. |
| 6 | Reachable area, simulated progress/events and route-level material warnings | Search arrays, analytical geometry and display layers | Remaining-budget semantics, no fabricated data and reproducible event cases. |

Keep communication ahead of additional cosmetic features, as already agreed. Weather-model ingestion can begin now; scientific movement penalties remain a separate decision. Do not delay these adapters to train optional B2/dust/UV models.

## Suggested next Codex slice: solar and hindcast integration

Start a new feature branch from the updated main and read this review, `NAVIGATION_DESIGN.md`, `ENVIRONMENT_REPLAY_DESIGN.md`, ML results/contracts and current service code. Check for newer P1/P3 work first. Preserve unrelated drafts and private environment files.

Deliver three separately verified commits/pushes:

1. **Clock and solar evidence:** replace the real-parcel development clock with a reviewed extensible adapter; normalize solar windows to the evaluator's physical-second timeline. Document the actual location, epoch, method, assumptions and replay coverage. Keep synthetic acceptance cases intact.
2. **Historical forecast provider:** consume existing exports without ML dependencies; establish exact issue/availability/validity semantics with P3. If archival availability is reconstructed, label it as such. Separate retrospective observations and final-window metrics. Preserve interval and provenance metadata explicitly in the draft exchange.
3. **Frontend consumption and end-to-end checks:** show the selected eligible forecast alongside source observations and actual mission daylight checks, preserving request revisions, language switching, geography and existing resource bounds. Changes that are context-only must not rebuild movement searches; active effects must enter explicit cache/context identities.

Stop for review after these deliveries. Do not add arbitrary scientific thresholds, weather-to-speed effects, human radiation budgets, automatic DONKI vetoes or new route-search criteria within this slice.

Critical checks: no complete daily observation before its availability; no future revision; no verification value in decision payloads; independent model-training and replay cutoffs; missing evidence remains missing; location/clock mismatch rejected; boundary equality passes; overrun fails; task +1 s remains +1 s; unchanged movement context reuses searches.

## Verification performed for this review

| Check | Observed outcome |
| --- | --- |
| Engine unittest suite | 40 passed. |
| Non-HTTP service suites including Gale package checks | 41 passed. |
| Analytical preparation checks | 3 passed using the existing analytical venv. The generic Anaconda runtime lacks rasterio; this was resolved by using the appropriate existing interpreter. |
| Standalone catalog/team/movement checks | All 3 passed. |
| Frontend typecheck | Passed. |
| Frontend Node checks without live-service settings | 3 passed, 7 explicitly skipped; no claim that skipped live cases passed here. |
| Full scene-inclusive production build | Passed with a nonsecret placeholder token. Existing large Cesium chunk warning remains. |
| Real Gale package calculation | Recomputed successfully as detailed above; missing daylight preserved. |
| Forecast artifact structure | 41 files / 574 rows, finite numerical values, ordered quantiles, all four target variables present. |
| Processed Parquet inputs | Read successfully; row counts, replay coverage and solar-string presence inspected. |

Not repeated here: full HTTP/browser interaction, streamed terrain/HiRISE/camera visual verification, external NASA retrieval, or model fitting/evaluation reruns. Previous delivery evidence documents some of those checks; it is evidence from that delivery, not a fresh observation by this review.

## Review conclusion

The real-terrain routing milestone is present in main and its calculation was independently reproduced. The principal missing integration is decision-safe environmental evidence: solar/time first, existing forecast outputs second, and controlled display/mission effects after that. The original directed graph can remain in place while these providers are implemented. Additional alternatives, communication and progression remain explicit separate deliverables.
