# Historical environment replay and alert integration

Date: 2026-11-14.

Source: the project owner's supplied `BRAINSTORMING_PREVISION_ALERTAS_Y_DATOS_14NOV.md`, read in full (284 lines). The owner requested using this direction before implementing mission/service evaluation. Its reported external data checks have not been independently reproduced in this review.

This document updates the earlier navigation design's single historical-sol scenario into a historical replay with explicit information cutoffs. It does not change the terrain graph algorithm or adopt a weather-to-speed, radiation-dose or radio-link model.

## 1. Working demonstration scope

| Subject | Working decision |
| --- | --- |
| Primary experience | Historical replay of a hypothetical human mission on a prepared Gale parcel. |
| Target environmental window | 2025-10-25 through 2025-12-05, subject to actual common coverage, quality and availability checks before a particular demonstration start is frozen. |
| Demonstration start | Choose a specific instant inside that window only after validating the required inputs and forecast cutoff. |
| Mission clock | One UTC timeline for replay, physical elapsed seconds for navigation and budgets, and explicit Mars local-time conversion for display/daylight. |
| Weather | Historical REMS measurements and optionally separately generated forecasts with declared issue/validity times. Keep them distinguishable. |
| First weather models | Daily pressure and/or daily minimum/maximum temperature, owned outside the navigation engine. Compare with persistence and seasonal climatology if implemented. |
| Solar geometry | Derived for the parcel location and replay date. Keep geometric daylight separate from atmospheric measurements and terrain shadow. |
| Space weather | Time-stamped DONKI context/alerts where available. No automatic conversion from CME arrival to surface dose or mission prohibition. |
| Radiation | RAD variable/unit/quality reading and relevant-event checks are prerequisites; dose integration and budgets remain deferred. |
| Communication | Base-relative geometric visibility remains the first navigation extension. Orbiter passes and Earth visibility/delay are separate later features. |
| Current-time panel | Optional secondary context; it must not supply present-day events to a 2025 mission replay. |

The document motivates the date window with overlapping REMS, RAD and MAVEN coverage. That is a candidate data intersection, not proof that every required variable is readable or scientifically interchangeable. RAD units/quality and MAVEN units remain unresolved in the supplied report. Do not choose the demo solely because one event appears to match.

## 2. No information from the future

Keep these times separate:

- `replay_start_utc`: initial cutoff for the demonstration.
- `simulation_time_utc`: current instant of the simulated sortie.
- `issued_at_utc`: when a forecast or alert revision was issued.
- `available_at_utc`: when that exact record/revision was available to the decision-maker, if known.
- `observed_at_utc` or `observation_interval_utc`: time covered by a measurement.
- `valid_from_utc` and `valid_to_utc`: interval a forecast or rule describes.
- `fetched_at_utc`: acquisition time of the archived snapshot, not historical availability.

A record is eligible for a decision only if its known availability is no later than the current replay instant. Observation time alone does not establish publication time. A daily maximum/minimum or final daily mean is not available at that sol's start. It must not be shown as an already known observation or used as a forecast input before its complete observation interval and declared availability policy permit it.

If historical publication times or original revisions cannot be recovered, document the reconstructed availability assumption and describe the evaluation as a retrospective hindcast/reconstruction, not an exact reproduction of operational knowledge at that time. Do not hide unknown availability behind the date of the event or the modern download time.

Training, feature preparation, quality filtering and seasonal baseline fitting must respect the forecast cutoff. Verification observations are separate from decision inputs. The UI may reveal later observations for comparison as the replay progresses or in a clearly separate retrospective view; those values cannot leak into the forecast/planning calculation.

DONKI revisions need stable event and simulation identifiers. Select only the eligible revision and preserve its issue time; do not select the most accurate later run after seeing the outcome. Multiple runs or combined-event simulations are not independent observed events. Event association, tolerance windows, misses and false alarms require a declared evaluation procedure before performance claims.

## 3. Environmental snapshot boundary

The following fields are a proposal to refine with P1/P3, not an accepted replacement for the shared v0 contract:

| Field | Meaning |
| --- | --- |
| `scenario_id`, `scenario_version` | Immutable prepared scenario identity. |
| `mode` | `historical_replay`; other modes are explicit and separate. |
| `replay_start_utc`, `simulation_time_utc` | Cutoff and active simulated clock. |
| `availability_policy` | Whether availability timestamps are archival or reconstructed and how incomplete daily summaries are treated. |
| `location` and `spatial_scope` | Parcel location versus original rover measurement location and the declared applicability of a reference observation. |
| `daylight` | Normalized physical-second interval, epoch, time convention, actual evaluation location, method and evidence. |
| `observations` | Eligible source values with observation intervals, availability, units, quality and provenance. |
| `forecasts` | Target variable, resolution, issue/cutoff, valid interval, model version, units and uncertainty when supplied. |
| `events` | Eligible event/forecast revisions, valid intervals, source IDs and explicit rule references, if any. |
| `rule_set_version` | Identifies which scenario effects are actually applied. |
| `not_evaluated` | Unsupported variables, rules or missing evidence. |

The engine consumes a prepared immutable snapshot; it does not train ML, query NASA APIs or infer a local weather field for every terrain cell. The service resolves data/cutoff and exposes the snapshot used. Prepared snapshots allow a deterministic demonstration without relying on live calls during `/plan`.

Forecast and observation origins must be labeled independently. Historical measurements are still historical even when the simulated clock reaches their observation time. Prefer labels such as observed in replay and forecast as of the replay cutoff; never unqualified live Mars weather.

Daily pressure and temperature summaries do not establish hourly conditions or the time of minimum temperature. Do not invent an intraday curve, cold-hour alert or spatial interpolation. Any additional temporal/spatial model requires its own explicit method and validation. REMS missing values remain missing; fixed `Sunny` text is not a dust measurement.

## 4. Mission effects and alert semantics

| Input | Initial use | Boundary |
| --- | --- | --- |
| Parcel/date solar geometry | Check configured daylight departure and reserved return deadline. | Astronomical daylight does not prove sunlight in terrain shadow. |
| Time elapsed and return costs | Remaining-return margin and an explicit return-now warning. | Never reset original autonomy when reevaluating. |
| Base-relative visibility | Later route/task interruption metrics and a visibility-prioritized candidate. | Geometric visibility, not demonstrated radio coverage. |
| REMS daily values and optional forecasts | Preparation context and forecast-versus-observation display. | No undocumented temperature/pressure multiplier or invented suit threshold. |
| DONKI event forecast | Context/warning with the source, issue time, predicted interval and limitations. | CME arrival is not a measured local particle/dose event. Do not automatically veto a mission. |
| RAD | Deferred until variable, unit, quality and interpretation checks. | No dose, dose budget or visible-sky scaling in the first evaluator. |
| MAVEN flux | Context/verification after units and orbital sampling are understood. | Orbital flux is not interchangeable with surface dose. |

Every rule that changes a recommendation, cost or mandatory constraint needs an identifier, parameters, evidence/assumption label and stated scope. Unsupported effects remain informational or unevaluated. A hypothetical operational threshold must be presented as a scenario assumption, not a measured human or robot limit.

Warnings and overall mission assessment are separate. An unvalidated space-weather warning does not silently become `incompatible`; a violated mandatory modeled rule does. Missing required evidence cannot produce a green/pass check. Keep `conditional` for a named condition rather than using it to hide a mandatory failure.

## 5. Preserve the current routing model

The current Dijkstra graph is time independent for a fixed team, terrain and movement configuration. Keep that property for the baseline service. A frozen environmental snapshot may affect a whole-mission check without changing movement weights.

If a new approved rule changes movement costs or exclusions, rebuild the graph under a new explicit configuration and invalidate incompatible search caches. Do not add arrival-time-dependent edge weights to static Dijkstra and claim it solves time-dependent routing. That is a separate algorithmic extension.

A simulated event can request reevaluation at the current route position with the original elapsed time, remaining tasks and original participant limits. With an unchanged graph/base, return costs can be read from the existing return-to-base search. With changed terrain/movement rules, recompute the affected graph/search first.

Let `remaining_available_s` be the smallest remaining mission/participant temporal limit, and `return_required_s = current_return_s + reserve_s`. Their difference is the remaining-return margin. At zero margin, warn to return immediately; a negative margin means the configured reserve cannot be preserved under this model. It does not prove physical return is impossible. Daylight adds a separate remaining window. No route or inconclusive search must remain distinct.

## 6. Solar geometry and rendering

Use the actual selected parcel/base coordinates and replay date; the source document's reference latitude of -4.59 degrees is not a universal constant for Gale. P3 owns normalized solar/time data and its method/version.

The source reports agreement between `marstime` and REMS clock fields; this has not been independently reproduced here and is not independent validation against measured sunlight. Preserve whether sunrise/sunset are derived rather than observed. Use physical-second conversion for mission arithmetic; Mars local clock strings are presentation/input values with declared convention.

P1 may derive a directional scene light from the same solar state after testing the coordinate conversion. Visual shadows cannot drive navigation alerts, and a static presentation light must not be portrayed as replay-time illumination. Terrain shadow computation on the analytical DTM is an additional layer, not supplied by astronomical sunrise/sunset alone.

The approximately 71 m Cesium/DTM display offset remains a separate rendering/reference issue; it does not enter analytical slopes, mission durations or antenna elevations relative to the DTM.

## 7. Ownership and next deliveries

- P2: mission budgets and normalized daylight evaluation now; replay snapshot contract and event hook in the service; remaining-return checks when simulation is implemented. No weather training or radiation model in this task.
- P3/environment-model owner: validate the common 2025 coverage; prepare data/forecast snapshots and availability metadata; normalize solar/time information; verify RAD if pursued; supply geometric visibility with unknown-state semantics.
- P1: replay controls and clock, labeled forecast/observation/context display, alert panel and result invalidation; source/evidence detail remains on demand. No separate game system is implied.

Implementation order remains small verified pushes: pure mission evaluation, parcel/scenario exchange and caching, then HTTP service. Communication remains the next navigation extension. Replay simulation, live DONKI, radiation and orbiter features must not block the first complete mission result.

Before freezing the demonstration, resolve the exact start instant, common data quality, forecast target/resolution and availability policy. These decisions do not block synthetic engine tests. Confirm or keep editable the proposed 5 m base and 2 m explorer antenna heights; they are scenario assumptions, not accepted instrument specifications. Handle robot receiver geometry explicitly if relevant.

Any archived API test payload committed later must omit credentials and API keys from request URLs and logs. Source/data files with secrets are not suitable repository artifacts as received.
