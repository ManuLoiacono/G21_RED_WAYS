# Navigation goals: implemented scope and remaining work

Date: 2026-11-15.
Validated main: `00559c4`, including backend-only environment PR #14.
Accepted requirements: `docs/NAVIGATION_DESIGN.md` and `docs/ENVIRONMENT_REPLAY_DESIGN.md`.

## Status definitions

- **Implemented:** the agreed mechanism exists and has implementation/acceptance evidence. This does not imply operational or scientific validation of assumed capabilities.
- **Partial:** part of the required behavior exists, but a distinct calculation, consumer integration or data dependency is missing.
- **Pending:** the planned behavior is not implemented.

This is a current implementation assessment, not a percentage-complete estimate. Some older checkboxes in `docs/TAREAS.md` describe pre-integration states. In particular, joint robot movement is implemented despite the old unchecked P2-10 row.

## Goals mapped to actual behavior

| Agreed goal | Status | Evidence and remaining boundary |
| --- | --- | --- |
| Region-independent calculation engine | Implemented | `engine/` consumes metric grids/capabilities; Gale preparation and coordinate adapters are outside the algorithms. |
| Prepared detailed parcel around 3 x 3 km | Implemented | Real HiRISE analytical parcel, 1463 x 1463 cells at about 2.02349 m; native elevations, coverage and conservative slope aggregation. |
| Bounded movement cache and reuse | Implemented baseline | `PreparedPlanner` retains one graph/context and associated base search. Tasks/context-only changes reuse compatible movement results; team/base/parcel changes trigger the required rebuild or search. |
| Regional coverage and moving between several real parcels | Partial | Registration/versioning and algorithm reuse exist; only one real parcel is delivered. No whole-Gale analytical coverage, regional variable atlas or tested general disk-backed multi-parcel cache. |
| Four fixed humans, selectable one to four | Implemented | Central immutable identity/catalog, selection validation and allowlisted mission overrides. No character creation or demographic penalties. |
| Two fixed robots, selectable zero to two | Implemented | Same team traversal and full-sortie temporal checks; all selected participants co-travel. |
| Explicit per-participant total payload | Implemented | Carrying capacity validation and explicit reassignment for comparisons. No invented load-speed penalty or inventory system. |
| Team-dependent speed and admissibility | Implemented | Each participant constrains the edge; group edge duration is the maximum participant duration on that edge. |
| Directed eight-neighbor routing | Implemented | CSR/Dijkstra with separate outbound and return searches, directional grades, missing-data/exclusion handling and no blocked diagonal corner cutting. |
| Real route metrics and Cesium placement | Implemented with registration limits | Real analytical distance/ascent/descent, registered display adapter, calculated outbound/return geometry. Existing geographic registration is provisional. |
| Four editable mission templates | Implemented | Central templates, sequential tasks, mission budget, reserve and participant limits. Numeric defaults remain explicitly synthetic assumptions. |
| Complete sortie evaluation | Implemented | Outbound + tasks + return; reserve counted once; independent mission/participant margins and limiting reasons. |
| Actual-location geometric daylight | Implemented | Mars24 time/solar adapter, UTC/physical-second normalization, departure/return checks, exact boundary and missing-evidence behavior. Not terrain shadow or an atmospheric transmission model. |
| Reproducible historical replay snapshots | Implemented backend | Supported sol window, explicit issue/availability/validity/cutoff semantics, reconstructed-availability policy and versioned local data. |
| A1/A2/B1 provider integration | Implemented backend | Pressure, daily min/max temperature and RAD background-rate context with quantiles, source scope and no verification leakage. These do not change movement costs. |
| Structured failure/missing-evidence semantics | Implemented | Budget/daylight incompatibility, no directed path, missing evidence and interrupted search stay distinct; unavailable totals remain null. |
| HTTP and existing P1 consumer | Implemented | Health/parcel/catalog/plan exchange, calculated results without static fallback, revisions/stale-response protection and compatible geography. Shared-v1 acceptance is still separate. |
| Forecast presentation and updated clock/daylight copy | Partial, P1 follow-up | Existing raw evidence/API/CLI exposes forecasts. New environment cards were deliberately removed to preserve main's UI; old synthetic-clock/missing-daylight copy and ungated retrospective REMS context remain. |
| Prepared destination selection | Implemented | Registered base/POI choices with validated analytical resolution and scene previews. |
| Arbitrary destination picked inside the analytical parcel | Partial | Backend metric-coordinate resolution and inverse display transform exist; the UI still selects registered POIs rather than arbitrary surface picks. |
| Fastest / lower-relative-effort alternatives | Partial | Only `fastest` is accepted/calculated. No adopted effort proxy, effort search or cross-criterion deduplication pipeline. |
| Explain and suggest concrete configuration changes | Partial | Limiting rules/participants are explained; payload-preserving comparison validation exists. No automatic evaluated counterfactual recommendation service. |
| Base-relative geometric communication | Pending | No visibility package/evaluator, total hidden time, longest interruption, unknown-time metric or link-prioritized candidate. |
| Reachable area with safe return/budget | Pending | Search arrays exist, but no derived mask/contour API or complete reachable-area evaluation. |
| Route-level THEMIS/material warnings | Partial overall, pending engine integration | The optical/thermal UI layer exists; crossing aggregation, route warnings and material effects are absent. Brightness is qualitative, not strength or quantified risk. |
| Simulated advancement and event-driven replanning | Pending | No consumed-time/current-position continuation contract, delay/block event flow or remaining-budget replanning. |
| Runtime DONKI context/alerts | Pending | C1 evaluation artifacts exist, but no cutoff-safe operational replay provider. No automatic mission veto. |

## P2 task closure view

| Original task | Current implementation assessment |
| --- | --- |
| P2-01: profiles/templates | Implemented; capability/default scientific justification remains an explicit validation limitation. |
| P2-02: directed graph/search | Implemented and exercised on synthetic and real terrain. |
| P2-03: local service | Implemented and compatible with the unchanged main frontend. |
| P2-04: complete mission/daylight | Implemented, including actual-location geometric daylight and physical time. |
| P2-05: alternatives/reasons | Partial: fastest and reasons done; effort and evaluated recommendations missing. |
| P2-06: real parcel/performance | Implemented; independent geographic/operational validation remains limited. |
| P2-07: reachable area | Pending. |
| P2-08: communication/scenarios | Partial: environmental scenarios/provider done; communication absent. |
| P2-09: material warning | Route-level evaluation pending; the display layer alone does not close it. |
| P2-10: support robot co-travel | Implemented, including zero-to-two robots and limiting team pace/rules. |
| P2-11: replanning from progress/events | Pending. |
| P2-12: advanced recommendations/relay/AI explanation | Partial basic explanation only; advanced features pending. |

## What the real acceptance result establishes

The reviewed case uses a hypothetical human/rover team on the real analytical parcel:

- About 149.416 m outbound and 149.416 m return.
- Outbound 539.208 s; return 579.529 s. Direction changes time even when geometry matches.
- Sequential tasks 600 s; activity 1718.737528 s; total with 1800 s reserve 3518.737528 s.
- The default replay case is `viable_model` under the implemented rules.
- Late departure is incompatible; missing daylight yields insufficient evidence.
- Early replay can be viable under daylight/budget rules while forecasts remain unavailable, because forecasts are optional context.
- Exact daylight boundary passes; adding one physical second to the task fails the mandatory daylight rule.

These are model results, not a guarantee of astronaut safety or actual rover capability. Profile/speed coefficients remain assumptions. Human oxygen/fatigue, battery draw, radiation exposure and small-rock hazards are not validated by this case.

## Important distinctions when judging completion

1. **Model ingestion versus movement effects:** the agreed first integration includes A1/A2/B1 as context and uses geometric daylight as an actual mission constraint. A weather-to-speed penalty was not adopted and must not be invented to make the forecasts appear active.
2. **Reasons versus recommendations:** reporting a limiting rover is implemented. Evaluating a payload-preserving changed team and proving the new result is not yet implemented as an automatic suggestion.
3. **One candidate versus missing comparison:** one fastest candidate is honest and expected today. More cards require real distinct optimization criteria, not another color, random detour or reversed leg.
4. **Multi-parcel algorithms versus whole-Gale data:** new parcels can use the same algorithms, but their terrain/weights/base searches still need valid prepared data and compatible computation. Current data coverage is one real prepared domain.
5. **Backend versus product presentation:** the owner explicitly required preserving the teammate's `app/` exactly. The backend supports new environmental evidence; dedicated UI changes need P1 coordination and are not authorized by this status assessment.
6. **Derived sunlight versus scene illumination:** mission solar windows are calculated independently of the visual sun and do not assess terrain shadow.

## Remaining work in recommended order

1. **Close comparison criteria and communication together as explicit small slices.** Adopt a relative-effort proxy with clear interpretation; prepare known/hidden/unknown visibility and interruption metrics; then add distinct candidates without weakening constraints. Communication remains the first navigation extension after the completed baseline, as agreed.
2. **Evaluate configuration suggestions.** Run bounded counterfactuals through the same engine, preserve required tasks/destination/total payload and show actual deltas. Do not silently drop a removed member's payload.
3. **Complete arbitrary destination input with P1.** Reuse the inverse adapter and backend bounds/mask checks; label new targets hypothetical. Until authorized, keep all work outside the protected frontend.
4. **Derive reachable area.** Combine directed outbound/return time with tasks, participant availability, reserve and applicable daylight. Define output limits and missing evidence; a static graph alone does not solve future path-wide communication constraints.
5. **Add remaining-mission replanning.** Define consumed activity, remaining resources and current location; handle delay/block events without resetting availability or treating reserve as activity already spent.
6. **Optional context integrations.** Route-level qualitative THEMIS warning and cutoff-safe DONKI context can follow their explicit data/scientific semantics; they must not become arbitrary traversal penalties or automatic prohibitions.

In parallel, P1 should correct outdated environmental labels and agree how forecasts are presented. Numeric capability evidence, independent registration checks, scientific exclusions where available and shared-contract acceptance remain cross-team quality work.

## Not adopted as mandatory development in this slice

Do not count character creation, inventories, split teams, demographic speed penalties, a whole-Gale detailed graph, hourly weather invented from daily extrema, human dose budgets, fatigue/oxygen/battery models or new ML training as unfinished requirements of the accepted baseline. They were excluded, deferred or require a separately justified model.

## Validation basis and repository impact

This assessment uses source inspection at `00559c4`, the accepted design, the reconciled delivery and the immediately preceding independent checks of the same backend: 40 engine tests, 60 non-HTTP service/environment tests and five real acceptance cases, plus the exact-boundary +1-second case. It does not claim a new full browser or HTTP rerun after the merge.

`app/` remains byte-identical to reviewed P1 main `4256ea6`. This status document changes no code or UI. The unrelated workflow draft remains untouched.
