# P1 handoff: display calculated navigation missions

Date: 2026-11-14.

P1 source reviewed: `c32d95fcddf8879364c003f018ac88a5d1493970`. P2 mission/service increment 2 is currently in progress. This document describes required behavior and integration boundaries, not a finalized wire schema or proof that HTTP endpoints are already available.

## Objective and ownership

Connect the existing Cesium app to mission results actually calculated by the Python engine from reproducible synthetic or real prepared inputs. Preserve the visual work and live ES/EN support. Do not introduce a second routing algorithm or hand-authored planning-response fallback in the app.

P1 owns `app/` and display adapters. P2 owns `engine/`, `service/`, authoritative catalog/templates and planning outputs. P3 owns real analytical preparation/georeference and agreed physical-clock inputs. Shared contract changes require producer/consumer review.

All new code, identifiers, comments and developer text must be English. User-facing messages belong in matching ES/EN dictionaries. Existing v0 contract values are not translated silently; any new version/adapter must be explicit.

Suggested branch: `p1/engine-route-integration`, based on the current P1/main revision. Use the P1 checkout or a separate worktree, never switch branches inside the directory where the active P2 session is writing.

## Required changes

| Priority | Area | Required behavior | Verification |
| --- | --- | --- | --- |
| P0 | Calculation origin | Separate engine calculation from synthetic input status and assumed model parameters. `fixture: true` must not mean uncomputed/static. | An engine-calculated synthetic result is labeled accurately and retains its metrics. |
| P0 | Service failure | Remove automatic fixed planning-response fallback from the integrated flow. Show an explicit service error; synthetic mode still calls the engine. | Stop the service: an error appears, without a fabricated route/result. |
| P0 | Language changes | Redraw translated labels/reasons without replacing the response with `simulatedResponse(...)`. Keep request/result identity, geometry, metrics and alternative selection. | Switch ES/EN after calculation; the same calculated mission remains selected. |
| P0 | Team selection | Select 1-4 humans from the four fixed catalog characters and 0-2 robot units. No character creation or identity editing. Assign additional payload and allowed mission overrides explicitly. | Actual selected IDs/loads/overrides reach the supported planning request. |
| P0 | Single defaults source | Consume P2's versioned catalog and four central templates, using the agreed delivery mechanism. Keep specialty/demographics descriptive unless an explicit model says otherwise. | No independently maintained competing capability/template constants. |
| P0 | Exchange version | Update request/response types, runtime validation and mapping to the reviewed increment-2 draft or explicit compatibility adapter. Reject unsupported schemas clearly. | Nested legs, nullability, statuses and finite numeric values are validated before drawing. |
| P0 | Leg states | Accept outbound and return independently: found, no path in evaluated domain or inconclusive. Support null unavailable metrics and same-cell results. | A valid outbound with no return draws only the available geometry; no straight invented return. A one-point route is a marker/no-op, not an invalid line. |
| P0 | Mission metrics | Show activity time, required unused reserve, mission and individual limits/margins, estimated return and daylight deadline separately. | More tasks reduce all participants' margins. A rover can be limiting even with remaining mission budget. |
| P0 | Daylight margin | Do not label the engine's temporal `limiting_margin_s` as the complete daylight-constrained return margin. Keep autonomy and daylight margins distinct. | Exact daylight boundary shows zero daylight margin even with positive temporal-budget margin. |
| P0 | Result lifecycle | Invalidate on every calculation-relevant edit and reject late responses for old request IDs/revisions. Retain explicit Plan mission action. | Team, load, task, departure or scenario edits mark/clear prior results; old responses cannot overwrite newer input. |
| P0 | Display frames | Agree a tagged analytical-to-display transformation and its inverse with P2/P3. Apply it exactly once to native-DTM geometry; inverse-transform map picks before analytical lookup. | Base, destination and intermediate control points match; a picked display point returns to its intended analytical cell. |
| P0 | Parcel/domain | Read active prepared parcel ID/version and enabled analytical coverage. Allow prepared POIs and map-selected valid destinations. Do not infer analytical coverage from visible Cesium terrain. | Outside/missing/excluded selection gets an explicit reason; no hidden nearest-passable-cell snap. |
| P0 | Historical scenario | Use the agreed replay instant/scenario rather than latest REMS defaults. Preserve UTC, Mars local-clock labels and physical durations as distinct concepts. | Request/result echo identifies the same 2025 replay scenario and cutoff; forecast/observation provenance remains visible. |
| P0 | Reasons and uncertainty | Translate stable engine reason codes with supplied numeric parameters; retain a fallback for unknown codes. Separate warnings, failed mandatory rules, missing evidence and technical errors. | Missing daylight is not green; no path, failed budgets and incomplete search remain distinguishable. |
| Next | Communication overlay | Prepare a separate view for known-visible, known-hidden and unknown geometric visibility, plus total/continuous interruption metrics when delivered. | Unknown is not rendered as known coverage; the label does not promise radio performance. |

## Frame agreement needed before real geographic integration

See `P1_P2_SCENE_REVIEW_c32d95f.md`. P1's mesh builder currently adds projected x/y shifts of -25/+35 m and a +56.2 m height offset, using the reported parcel registration. The earlier ~71.2 m value compares Cesium and Curiosity waypoint heights and is not interchangeable with that DTM registration. These measurements were reported by P1; the integration reviewer did not reproduce them.

Proposed ownership for agreement: P2 provides native analytical geometry and frame/version metadata; P1 applies the reviewed display registration once and inverse registration on scene picks. P3 confirms actual reference/transform semantics. If P2 instead supplies display geometry, label that explicitly and P1 must not transform it again. Choose one route, not both.

Analytical elevation, slope, timing and visibility remain in the DTM reference. Clamped lines use scene heights; do not add a second vertical correction. Source waypoint POIs need a source-specific transform, not a blanket DTM shift. Missing/unsupported adapters must be reported rather than guessed.

The visual builder's default window is approximately 1.8 x 1.8 km; the 3 x 3 km routing benchmark is synthetic and does not define the real shared parcel. Confirm identical bounds, data versions and control points for visual and analytical products. Registrations are parcel-specific, not whole-Gale constants.

## What P1 can start now

- Fix the fixture/calculation/language distinctions and service-error behavior.
- Separate display components for team selection, unavailable legs, temporal/daylight margins and structured reasons.
- Introduce request-revision/stale-result handling and display-frame adapter boundaries.
- Prepare focused UI tests using examples actually generated by engine commands as test inputs. Such recorded examples are schema/test assets only; do not make them a user-facing planning fallback.

Do not hard-code the unfinished increment-2 response structure, invent HTTP/catalog endpoint names, assume real geographic conversion is already enabled or declare integration complete from fixture-only UI tests. Synthetic-only metric packages do not provide real Gale lon/lat by implication.

## What P2 will provide at the next checkpoint

- A reviewed draft request/response and executable command-line planning example with calculated synthetic cases.
- Catalog/template exports and exact version fields.
- Calculation-origin, input-provenance, frame/location and request-identity semantics.
- Cases for a passing mission, participant-limited failure, missing daylight, no return and an exact daylight boundary.
- Supported adapters and explicit remaining P3 dependencies.

HTTP `/plan` and `/parcel`, launch commands, catalog/template access and configured CORS follow in increment 3. An unsupported schema or unavailable adapter remains an explicit error until supported. Optional future forecasts/alerts do not imply an implemented weather-speed or radiation model.

## Small delivery sequence

1. Correct calculated-synthetic result handling, language preservation, explicit failures and stale-response lifecycle. Verify and publish a small P1 feature-branch commit.
2. Add team/result components and runtime validation against the reviewed exchange. Verify and publish another small commit. Do not invent a competing shared schema while the final example is pending.
3. Wire geographic display/picking and the available HTTP service; run the joint exercise below. Verify and publish the integration commit.

Keep main runnable and use the team's review before merging. Do not force-push, overwrite another person's working directory or silently migrate the shared contract. Do not wait for one giant final push.

## Joint acceptance exercise

1. Use an engine-calculated request and a declared fixture display adapter or a reviewed real parcel adapter. Confirm the same parcel/team/scenario IDs across request, response and map.
2. Compare base, destination and two intermediate control locations in analytical/display frames; verify reverse mapping for a clicked point.
3. Change the selected team, then a task duration. Confirm the engine changes geometry/time/assessment where appropriate; task-only changes may preserve geometry.
4. Show a participant-limited failure, missing daylight and outbound without return without invented totals or geometry.
5. Switch ES/EN and confirm the exact same calculation/selection remains visible.
6. Stop the service and verify an explicit error with no static planning substitution.
7. Confirm the intended demo startup can serve the optional HiRISE mesh; it is currently generated locally and served by Vite in development, not included automatically in production output.

Report branch, commits, checks, example/request IDs and remaining assumptions. Only a working app-to-service-to-engine round trip establishes P1/P2 integration; a source review or separately passing components do not.
