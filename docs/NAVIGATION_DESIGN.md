# Navigation design and integration decisions

Date: 2026-11-14

Reviewed baseline: `13fb56d5e2066eccc7cca3286980ae293b9fe86d`.

Status: product decisions accepted by the project owner. The v1 exchange format below is a proposal for P1/P3 review, not a replacement for the working v0 contract. No navigation implementation is included in this change.

## 1. Accepted product scope

| Subject | Decision |
| --- | --- |
| Human roster | Exactly four predefined characters. No character creation or character editor. |
| Human selection | Select one to four distinct characters. |
| Character identity | Fixed name, avatar reference, age, sex, height, body mass and specialty. All characters are hypothetical. |
| Operational differences | Distinct, documented reference capabilities. Mission settings can override allowed operational parameters without editing the character. |
| Traits | Descriptive labels such as slower pace or greater carrying capacity summarize explicit capabilities; they do not add a second hidden penalty. |
| Demographic effects | No automatic speed or terrain penalty inferred from sex, age, height or body mass. Such a relationship would require a separately justified model. |
| Specialty | Descriptive role and task context initially; no automatic task-duration bonus or mandatory specialist. |
| Payload | Total additional payload in kilograms, assigned explicitly to each selected participant. No item inventory or automatic redistribution. |
| Robots | Two predefined hypothetical units: a light support rover and a transport rover. Select zero to two distinct units. |
| Movement | All selected humans and robots travel together for the entire mission. |
| Mission | One base, one destination, sequential tasks, and return to the same base. |
| Destinations | Prepared points of interest or a point selected within the enabled analytical parcel. A clicked point is a hypothetical target, not a newly verified scientific site. |
| Demo geography | Prepared parcels only. Region-independent engine; regional rendering remains separate. |
| Templates | Geological observation, topographic exploration, reconnaissance and environmental measurement. Editable task durations and mission settings. |
| Environment | Historical demonstration scenario with editable departure time. One frozen scenario per planning request. An independently validated ML provider may supply the same interface later. |
| Alternatives | Fastest and lower relative effort first; geometric visibility becomes the next integration priority. Return only distinct candidates. |
| Interaction | Explicit Plan mission action. Any calculation-relevant edit makes the displayed result stale. |
| Recommendations | Explain limiting factors and evaluate specific configuration changes. Never silently change the requested team or mission. |
| Presentation | Clear selection and comparison, without levels, random attributes or game progression. |
| Language | All newly authored repository code, identifiers, comments, documentation, messages and commit text are in English. |

## 2. Current repository behavior and required adaptations

These observations come from source inspection at the reviewed baseline, not a live browser or performance test.

| Existing implementation | Consequence for navigation integration |
| --- | --- |
| `app/src/mission/api.ts` posts to `/plan` at `VITE_SERVICE_URL`, defaulting to `http://localhost:8000`. | Preserve the endpoint. The service must handle the browser preflight and configured local UI origins. |
| `MissionState` stores one `profile`; `toPlanRequest` wraps it in a one-element `profiles` array. | An array on the wire does not yet implement team selection. Add a roster, selected IDs, assigned loads and mission overrides. |
| `templates.ts` owns temporary defaults and explicitly expects P2 to replace them. | Publish one authoritative catalog/template source; do not maintain divergent Python and TypeScript defaults. |
| `PARCEL_ID` and points of interest are fixtures imported in `main.ts`. | Replace with the active prepared parcel manifest and real/prepared points when P3 is ready. |
| A map click selects an existing POI entity only. | Add surface picking and parcel/mask validation for arbitrary destinations. |
| Destination changes clear prior results, but other parameter edits do not. | Invalidate results for every relevant edit. Associate responses with request IDs/revisions and discard late responses for older inputs. |
| Network failures return fixed per-destination fixtures; HTTP errors are displayed. | Preserve explicit fixture labeling. Fixed fixtures cannot verify that team, load or weather changes affect calculations. |
| Response validation only checks status, reason and an alternatives array. | Establish structural validation before trusting route geometry and nested metrics from a service. |
| Current fixtures include a conditional route through missing elevation and a diagnostic route over a forbidden slope. | These are presentation fixtures, not routing rules. Do not copy this behavior into the navigation graph. |
| The v0 contract sample marks a violated daylight constraint as conditional. | A failed mandatory daylight rule means incompatible. Conditions and missing evidence have different semantics. |
| Legacy template IDs, modes, criterion names and provenance values include Spanish. | Coordinate an explicit v1 migration. Do not silently rename values consumed by the current app or P3. |
| Cesium receives source latitude directly; polylines use `clampToGround`. | Preserve the display convention verified by P1. Do not introduce an extra latitude conversion in the engine-to-view path. |
| P1 reports a measured Cesium height offset of about 71 m. | Do not add this to analytical elevations or costs. Points/labels use visual height sampling; route metrics use the DTM. |
| Scene lighting uses a static presentation sun. | Do not interpret rendered shadows as the mission's computed illumination. |

## 3. Engine boundaries and parcel reuse

- `engine/` contains pure Python functions. It does not import Cesium, open HTTP connections or know a Gale-specific location.
- `service/` resolves IDs, validates requests, loads prepared parcel data, manages bounded caches and calls the engine.
- P3 owns terrain preparation, reference frames, coordinate transformations and environmental source preparation.
- P1 owns selection controls, surface picking, display and visual height handling.
- The engine consumes metric geometry, valid-data/exclusion masks, terrain summaries, selected participant capabilities and a normalized environmental scenario.
- Prepared data can exist on disk for multiple parcels. Keep memory bounded, initially to one active parcel and only the working arrays needed for the request.
- Changing parcel reuses algorithms, not paths. Load or recover its geometry; rebuild or recover compatible graph weights and recompute base-dependent searches.
- Cache keys include parcel/data version, resolution, movement-model version, effective participant capabilities, loads, relevant scenario effects and dynamic exclusions. Base-dependent searches also include the origin; visibility includes base position and antenna heights.
- Changing tasks alone can reuse movement searches when it does not change movement costs or constraints. It still requires mission and communication-duration reevaluation.
- Do not promise whole-Gale analytical coverage. Unsupported or missing regions remain explicitly unavailable.
- Paths stay inside the active analytical domain. Failure inside a 3 x 3 km parcel does not prove failure outside it. P3 should prepare a derivative-processing halo without implying a larger routing domain.

## 4. Team movement and mission evaluation

For an edge `e` and selected participant `i`, a movement model returns admissibility, `duration_s`, an optional relative-effort proxy, limiting reasons and evidence references.

1. An edge is usable only if every selected participant can traverse it under the configured rules.
2. Group edge duration is `max(participant_duration_s)` for that edge. Summing these maxima over edges is necessary: taking the slowest participant's entire-route time can miss a change of bottleneck between segments.
3. Upward and downward travel are evaluated separately. The return path is calculated, not assumed to be the outbound path reversed.
4. No diagonal may cut blocked corners. Missing essential elevation blocks analytical traversal; do not replace missing values with zero or bridge gaps silently.
5. Cell terrain summaries and directed edge grade are separate inputs. A p90 summary must not hide an exclusion or missing-data region; agree a conservative blocking policy with P3.
6. Payload is additional carried mass. Declare whether a profile's baseline already includes a suit or fixed equipment. Never double-count it.
7. Load-capacity validation is distinct from a load-to-speed model. Do not invent a continuous speed penalty just because a load field exists. Every active effect requires a documented rule and evidence or explicit assumption.
8. Tasks are sequential. Humans and robots stay together while tasks take place. Initially, their configured temporal availability covers the complete sortie, including stationary task time.
9. Let `elapsed_s = outbound_s + tasks_s + return_s`. For mission and participant temporal limits, report separate margins after the configured reserve. The limiting available margin determines temporal compatibility; budgets are not pooled.
10. Reserve is a required margin, not simulated activity or a second task. Report actual estimated return time and the reserved deadline separately.
11. Resolve daylight into the same physical-second time axis as route durations. Agree the source clock convention with P3; do not directly add terrestrial seconds to a 24-hour Mars solar clock.
12. Check departure against the enabled daylight interval as well as return plus reserve against its end. If required daylight information is absent, report insufficient evidence.
13. Keep search scores separate from physical durations. Relative effort is not calories, oxygen consumption, battery usage or a physiological claim.
14. Compare profiles on the same terrain and payload basis. A faster solo participant should reduce duration on an otherwise identical route, but need not change its geometry.

No fatigue, oxygen or battery-consumption model is adopted by this document. Four human capability presets, robot capabilities, speed/grade behavior, load effects and the effort definition need a parameter register before real-data claims. A synthetic fixture may exercise these mechanisms with clearly assumed values.

## 5. Evaluation and recommendation semantics

- Preserve `viable_model`, `conditional`, `incompatible` and `insufficient_evidence`; technical errors and `search_inconclusive` remain separate.
- A violated mandatory constraint produces `incompatible`, not a conditional acceptance. A conditional result names an explicit condition.
- Explain the limiting participant or rule, with its configured threshold and calculated value where available.
- Distinguish a disconnected graph, incomplete data, no acceptable evaluated candidate and an interrupted search.
- Rejecting time/effort candidates does not prove no feasible route exists under all mission-wide constraints. State the search scope and candidate limitation.
- Do not fabricate an executable route through excluded edges to illustrate failure. Any relaxed diagnostic search would need a separate opt-in output type and labeling; it is outside the first slice.
- Suggestions are separately evaluated counterfactuals with explicit changes and metric deltas. Preserve destination, tasks and required total payload unless the suggestion explicitly changes them.
- Removing a person or rover must not silently delete their payload. Reassign it explicitly within the remaining participants' capacities before evaluating the suggestion.
- Never suggest crossing a forbidden slope, dropping a mandatory reserve or treating missing data as safe.
- If a possible change has not been calculated, label it as unevaluated advice rather than a demonstrated solution.

## 6. Early communication integration

Communication is the first extension after the baseline route and budget work, ahead of cosmetic additions and complex robot behavior.

1. P3 supplies a base-specific geometric visibility layer with known/unknown state, base location, antenna assumptions, method and data version. Missing terrain evidence is not equivalent to a visible or hidden cell.
2. P2 measures estimated time without visibility, maximum continuous interruption and unknown-visibility time over outbound travel, destination tasks and return. Define the edge sampling rule and carry continuity across leg/task boundaries.
3. A preference can penalize known hidden travel to generate a link-prioritized candidate. Keep edge weights nonnegative and record the approximation/tie-breaking rule.
4. A maximum continuous interruption limit is a path-wide check; a simple additive Dijkstra cost does not enforce it exactly. Evaluate candidates honestly without claiming a globally optimal constrained solution.
5. Unknown visibility cannot receive a free link benefit. If it is essential to a mandatory rule, the result has insufficient evidence.
6. Reserve remains unused margin, so do not add fictitious communication exposure during reserve. A separate delayed-return simulation may evaluate it later.
7. Display this as estimated geometric visibility, not proven radio coverage. Do not infer link reliability, range or throughput.

Until that layer exists, return communication in `not_evaluated`; a nonzero preference must not silently imply that communication was optimized. Use synthetic visible/hidden cases to develop the evaluator independently.

## 7. Proposed v1 exchange shape

The following is a shape illustration, not a runnable real-data request. Catalog IDs, masks and scenario IDs must resolve to a prepared, versioned package. These examples are not yet accepted shared contracts.

```json
{
  "schema_version": 1,
  "request_id": "team-preview-001",
  "parcel_id": "gale_demo_v1",
  "origin": { "type": "poi", "poi_id": "poi_base" },
  "destination": {
    "type": "coordinate",
    "lonlat": [137.3851, -4.8189]
  },
  "team": {
    "catalog_version": "demo-team-v1",
    "humans": [
      { "profile_id": "explorer_01", "payload_kg": 0, "mission_overrides": {} }
    ],
    "robots": []
  },
  "mission": {
    "template_id": "geological_observation",
    "tasks": [{ "id": "context_photography", "duration_s": 900 }],
    "scenario_id": "rems_sol_4995",
    "departure_local": "09:00",
    "time_budget_s": 25200,
    "reserve_s": 3600
  },
  "preferences": { "time": 1, "effort": 0.5, "comm": 0 }
}
```

The catalog defines four immutable human identities, two immutable robot identities, versioned default operational capabilities, units, sources/assumptions and an allowlist of mission overrides. The service resolves identities and capabilities; clients cannot silently replace catalog identity or inject undeclared rules. Numeric defaults are not defined by this request example.

Validate coordinate bounds and masks server-side. Record the requested coordinate, resolved cell and effective coordinate; do not silently snap across obstacles or outside the parcel. Prepared POIs resolve through the same coordinate checks. Base/destination identity must not change with a template switch without a visible explanation.

Canonical v1 IDs and enum values are English, including `geological_observation`, `topographic_exploration`, `reconnaissance`, `environmental_measurement`, `on_foot`, `with_support_robots`, `fastest`, `lowest_relative_effort` and `best_geometric_visibility`. Derive movement mode from the selected team rather than accepting a conflicting independent mode field. Preserve external source values verbatim only as raw source data, with English normalized fields.

Retain the existing response concepts: status/reason, outbound and return legs, task time, reserve, budgets, constraint checks, warnings and `not_evaluated`. Propose adding request ID, resolved team and input versions, per-participant margins, limiting participant/reason, communication metrics and evaluated suggestions. Agree names and examples with P1 before changing its consumer.

Migration rule: leave v0 files and the working UI unchanged during design. P1/P2/P3 review the proposal, publish matching schemas and examples, then update producers and consumers together. If temporary v0 support is needed, make its mapping explicit, tested and separately versioned. Do not reinterpret legacy fixtures as real calculations.

## 8. Execution order and ownership

| Slice | Owner | Deliverable and completion condition |
| --- | --- | --- |
| Contract review | P2 drafts; P1/P3 review | Agree roster, locations, time convention, terrain masks, response fields and English v1 migration. |
| P2-01 team and movement | P2 | Immutable roster structure, mission resolution/validation and pure directed-edge evaluation; synthetic cases pass. See `handoffs/P2_01_TEAM_AND_MOVEMENT.md`. |
| P2-02 search | P2 | Directed eight-neighbor graph, source-limited Dijkstra and return on the transposed graph; known small-map results. |
| P2-03/04 baseline integration | P2 with P1/P3 | `/plan`, prepared parcel loading, physical-time budget/daylight checks and a real outbound/return result. |
| P2-05 alternatives and suggestions | P2 | Distinct time/relative-effort candidates and bounded, explicitly evaluated configuration changes. |
| Early P2-08 communication | P3 layer; P2 metrics/search; P1 display | Known/unknown visibility, interruption metrics and a meaningful visibility-prioritized candidate where distinct. |
| P2-06 measurements | P2 with P3 | Measure graph build/search time and peak memory on the real parcel; select 2 m or 4 m based on observed behavior. |

Robot types are present in the contract immediately; enable their movement after the human baseline is verified. Do not let a second robot or complex recommendations block the first integrated mission. Communication preparation can proceed in parallel as soon as the base and terrain contract are stable.

This discussion remains the decision/integration thread. Use a fresh implementation session for the first slice once its handoff is supplied. Concurrent writers need separate worktrees and non-overlapping ownership. New sessions read this file, their handoff, `CLAUDE.md`, `docs/TAREAS.md` and current contracts rather than relying on conversation history.

The project owner requested incremental publication: split each implementation slice into small verified deliveries, commit and push each completed increment to its `p2/...` feature branch, and report the result. Do not accumulate the whole navigation engine into one final push. Main-branch integration still follows team review; network failures must be reported without claiming a push succeeded.

## 9. Remaining integration decisions

- P1/P3 acceptance of v1 fields and the legacy-value migration; the product owner has already accepted the product behavior.
- Evidence-backed or explicitly assumed numeric capabilities, movement/load rules and relative-effort definition.
- P3's exact raster alignment, cell-center transform, conservative aggregation/missing-data policy and daylight normalization.
- P3's visibility sampling, unknown-data treatment and declared antenna geometry.
- Per-participant temporal limits and the operational override allowlist in the shared catalog schema.

These are bounded technical tasks, not reasons to reopen character creation, whole-Gale navigation, split-team coordination or an inventory system.
