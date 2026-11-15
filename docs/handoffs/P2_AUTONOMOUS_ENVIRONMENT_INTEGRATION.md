# Autonomous delivery: real Gale environment and historical forecasts

Date: 2026-11-15.
Reviewed starting main: `ec00116`. Fetch and inspect newer main before starting.
Source checkout: `C:/Users/Usuario/Desktop/Nasa Challenge/G21_RED_WAYS`.

## Owner authorization and completion goal

The owner authorizes completing all four deliveries below without planned approval pauses between them. Make routine implementation choices autonomously within the documented scientific and product boundaries. Commit and push each verified delivery, then open one reviewable pull request into main if authenticated tooling permits it. Do not merge automatically.

This is an implementation assignment, not another planning-only task. Continue through all four deliveries unless a concrete external blocker makes a specific part impossible. A missing optional data source, historical publication timestamp, token or browser tool has an explicit fallback below and does not justify abandoning independent work.

The owner will review the completed changes and may merge the PR from a phone. Commit before pushing: the owner should not need to create missing implementation commits afterward.

The end result must allow a user to start a reproducible real Gale planning session, choose a supported historical decision/departure time, calculate with actual location-matched geometric daylight, and inspect eligible historical forecasts alongside the calculated mission. A clean installation, unsupported data and unknown evidence must behave explicitly.

## Required reading and verified context

Read applicable `AGENTS.md`, `CLAUDE.md`, then:

- `docs/handoffs/NAVIGATION_REVIEW_2026_11_15.md`
- `docs/NAVIGATION_DESIGN.md` and `docs/ENVIRONMENT_REPLAY_DESIGN.md`
- `docs/handoffs/GALE_ROUTING_DELIVERY.md`
- `docs/ML_PREDICCION.md`, especially its solar reference, and `docs/ML_RESULTADOS.md`
- `service/HTTP_API.md`, `service/EXCHANGE_DRAFT.md`, `contracts/forecast.example.json`
- `service/gale.py`, `prepared.py`, `scenarios.py`, `planning.py`, `exchange.py`
- `scripts/prepare_gale.py`, `scripts/README.md`, the analytical manifest
- `ml/export/forecasts.py`, `ml/config.py`, relevant dataset/time definitions
- Existing mission/environment frontend modules and tests.

Treat old task checkboxes and dated handoffs as historical records. The executable implementation and the current audit establish what is already complete. The reviewed main already includes real analytical routing and Cesium display; do not rebuild that integration from scratch.

Current integration facts:

- Real parcel `gale_hirise_019698/native2-v1`, grid 1463 x 1463, approximately 2.02349 m cells; route display adapter already exists.
- The real scenario intentionally lacks daylight and inherits a synthetic clock covering only 2025-10-25 11:00 through 2025-10-26 12:00 UTC.
- The 41-sol target window is sols 4699-4739, dated 2025-10-25 through 2025-12-05 in the prepared weather dataset. Do not assume its date labels define complete physical sol intervals.
- There are 41 forecast files with 574 rows: pressure and RAD background-rate leads 1/3/5/10; daily minimum/maximum temperature leads 1/3/5.
- Exported `observed` values and final-window `skill_summary` are retrospective verification, not decision inputs.
- Forecast training cutoff, issue-sol/date, replay decision cutoff and target validity are distinct concepts.
- Current runtime planning does not ingest those forecasts. P1's browser REMS/THEMIS layers are contextual only.
- Engine NumPy/SciPy pins conflict with the ML training environment's NumPy pin. Consume exported data without importing training code into runtime.

## Working tree, branch and publication rules

1. Inspect status, branches, worktrees and new remote commits before changing anything. Use updated main as the implementation base. If fetch fails, record the failure and proceed from the latest locally fetched main rather than claim a remote update or wait for the owner unnecessarily.
2. Prefer a new isolated worktree within `C:/Users/Usuario/Desktop/Nasa Challenge`, such as `G21_ENVIRONMENT_INTEGRATION`, on `p2/environment-integration`. Do not switch another running contributor's branch or modify their worktree.
3. The audit and this assignment may initially be untracked in the source checkout. Read them there, copy only these requested documents into the implementation worktree if needed, and include them in an appropriate scoped commit. Leave `docs/FLUJO_TRABAJO_EQUIPO.md` unchanged and outside all commits.
4. Preserve unrelated tracked/untracked work and existing stashes. Never use blanket clean/reset operations to resolve a collision. If an incoming tracked file conflicts with a local untracked draft, preserve the draft outside the checkout first.
5. All new code, comments, docstrings, logs, files, docs, commits and PR text must be English. User-facing translations belong in the existing ES and EN dictionaries. Preserve established external IDs and shared wire values deliberately.
6. Use exact-path staging. Commit each coherent delivery after its focused checks, and push it before proceeding. More than four commits are allowed when they keep changes reviewable; do not accumulate everything into one final commit.
7. After each push, verify the remote branch SHA when network/authentication permits. A failed push is not a completed publication. Continue local implementation and prepare exact recovery commands if credentials/network are unavailable.
8. Fetch main again before finalizing. Incorporate necessary upstream changes without rewriting already-published history; resolve routine conflicts from intended behavior and rerun affected checks. Do not change unrelated incoming features.
9. Do not merge, delete branches, force-push or alter repository access settings. Do not send teammate messages or emails.
10. Preserve private environment files and never print/commit tokens. Do not run `ml.run_all` or reinstall ML requirements into the engine interpreter. Existing forecasts and model metrics are inputs to this work.

## Delivery 1: reproducible runtime assets and environmental contract

Implement the minimal runtime preparation and discovery needed by subsequent deliveries.

### Assets and environment

- Detect the engine runtime and analytical dependencies. Create an isolated compatible runtime environment if needed; retain `engine/requirements.txt` compatibility. Add only justified runtime/preparation dependencies with explicit commands.
- A verified generated `terrain.npz` existed beside the manifest in `C:/Users/Usuario/Desktop/Nasa Challenge/G21_GALE_ROUTING/data/processed/gale/analytical/`. Inspect it before any download. If its manifest and array identities match, reuse/copy the generated archive to the implementation checkout without committing the ignored binary. Otherwise run the existing preparation into the intended package location, preserving any mismatching existing package separately.
- A clean clone must have a documented preparation command; do not make an adjacent worktree path a permanent dependency. Do not silently fall back from a requested real parcel to a synthetic success.
- Preserve synthetic mode as an explicit regression/development option. Real mode must be selected explicitly and advertised accurately by health/parcel metadata.
- Establish a versioned, prepared environmental input package or equivalent immutable provider configuration. Its source data and content identities, policy versions, coverage and source locations must be inspectable. Planning must not train or download NASA data.

### Exchange and evidence boundaries

- Make additive draft changes coherently in service, frontend types/validators, examples and docs. Keep shared v0 files unchanged unless absolutely required by demonstrated compatibility; do not silently declare shared v1 acceptance.
- Separate training cutoff, model availability, reconstructed/archival issue/availability, observation interval, target-validity interval, replay cutoff and modern retrieval timestamp.
- Forecast output must preserve variable, units, p10/p50/p90, model identity, issue/target sol, validity, provenance and applicability limitations. Do not squeeze intervals into an undocumented scalar or discard uncertainty.
- Define stable explicit missing-data states and supported scenario/time discovery. UI defaults must come from advertised metadata rather than hardcoded synthetic dates/scenarios.

Acceptance: a documented startup can load verified real terrain and prepared environmental metadata with bounded resources; existing synthetic inputs remain valid; missing/tampered assets fail explicitly; no private settings or large generated data enter Git.

## Delivery 2: real solar/time normalization and mission daylight

- Implement a reviewed UTC/sol/local-mean-solar-time adapter over the supported replay window. Use the actual analytical evaluation coordinates and an explicit physical-second epoch. Preserve the engine's physical duration semantics.
- Reuse and validate the existing documented astronomical method/library where suitable. Parameterize location; the example's nominal Gale latitude is not the parcel's actual latitude. Do not confuse source planetary latitude conventions with a second unreviewed display conversion.
- Compute derived geometric daylight for the actual evaluation location. State the horizon/refraction convention, method/version and limitations. This is not a terrain-shadow calculation or a REMS observation at the base.
- Use REMS sunrise/sunset as an independent reference with its source location, date/sol convention and rounding limitations. It must not be copied as exact base sunlight solely because an Earth-date label matches.
- Normalize the interval to the same physical-second timeline as outbound/tasks/return/reserve. Do not equate one Mars clock minute to 60 terrestrial elapsed seconds or infer a Mars sol from an Earth midnight-to-midnight interval.
- Resolve which solar interval applies to the mission's departure; support eligible decision/departure dates across the prepared replay. Do not keep the old one-day fixture coverage for the real scenario.
- Preserve departure-daylight checks, return-plus-reserve checks, equality tolerance and missing-evidence semantics. If sunset is exceeded, return incompatibility; unsupported/unknown solar context remains insufficient evidence.
- Keep raw analytical elevations and the existing geographic scene adapter unchanged. Derived sunlight and source evidence must not affect graph weights unless an independently adopted movement effect exists.

Acceptance: the real route can receive a complete daylight assessment; departures outside daylight, an exact boundary, a small overrun, location mismatch and missing evidence have correct separate results. Verify several separated dates, including replay boundaries, rather than one convenient example.

## Delivery 3: decision-safe historical forecast provider

Implement a read-only importer for the already-exported A1/A2/B1 forecasts and relevant historical observations.

### Eligibility and reconstruction policy

- Never pass raw forecast documents into decision snapshots: every exported row contains a target observation from the future, and documents contain whole-final-window skill metrics.
- Split data into eligible observations, eligible forecasts and separate retrospective verification. Strip future `observed` and final-window `skill_summary` from planning responses, ranking, recommendations and cache/context decisions. This slice does not require a retrospective UI.
- Do not use the frozen training `cutoff_utc` as each forecast's issue timestamp. Map issue/target sols to actual intervals using delivery 2.
- Reuse known archival availability if present. Otherwise use an explicitly named, versioned retrospective reconstruction policy; this is authorized for the demo and must be labeled as an assumption rather than exact 2025 operational knowledge.
- That policy must never release a daily summary or forecast before all included daily input intervals are complete. Account for the issue sol, any RAD/SILSO daily dependencies and model-training-data completion. A sol/date label alone is insufficient. Do not invent an undocumented NASA publication lag.
- If an input dependency or its timing cannot be established safely, mark availability unknown and exclude that forecast. Continue implementing the provider and other supported cases. Do not fabricate metadata to force coverage.
- Preserve model selection frozen by validation. Do not pick a different model, interval or replay start because its later outcome looks better. If the nominal training-cutoff label differs from effective reconstructed model availability, record both and gate on the latter.
- Filter by decision cutoff AND mission target-validity interval. Keep distinct lead/target series before selecting latest eligible revisions. An eligible issue time does not make every forecast horizon applicable.
- Keep source rover location/elevation and spatial scope. These models are not a validated weather field at every route cell. Record any reference-location applicability assumption rather than silently transforming values to the base.
- Map variable names explicitly, including exported `min_temp_c`/`max_temp_c` and current service names. Quantiles, nulls and units must survive the exchange.
- B1 is the RTG-corrected silicon detector B rate in microgray/day. It is not human effective dose, a suit/battery budget or a particle-event predictor. Do not add exposure integration or operational radiation thresholds.

### Runtime behavior

- Read a bounded local inventory and validate finite values, ordered quantiles, versions and timestamps. Reject malformed/ambiguous packages with structured errors.
- Do not fit models, import LightGBM or query external sources during `/plan`.
- Choose the first demonstration instant by chronological eligible coverage and usable daylight, without outcome scoring. Publish it through prepared metadata with an explanation. Keep date controls editable within known coverage.
- Weather/radiation forecasts are context-only in this slice. They do not change speed, terrain exclusions or mission status through invented thresholds. Existing legitimate daylight/budget rules continue to affect status.
- Preserve reusable movement searches for context-only changes. If a future applied movement effect is introduced, it must be versioned explicitly in context/cache identities.

Acceptance: real exports are consumed with complete traceability; future verification and later revisions are excluded; incomplete issue-sol inputs cannot appear early; target horizons remain distinct; missing forecast coverage is visible; no scientific movement penalty is introduced.

## Delivery 4: frontend integration, regression evidence and reviewable PR

- Connect the existing mission UI to supported replay metadata, actual daylight evaluation and the service-selected forecasts/observations. Preserve team selection, overrides, tasks, reserve and budgets.
- Show model/date/horizon, units and p10/p50/p90, source/applicability and reconstruction labels on demand. Distinguish historical observation, model prediction and derived geometric daylight. Do not present the hindcast as current Mars weather.
- Align the existing REMS context panel with the mission's decision semantics. A full daily report not available at the cutoff must either remain unavailable in decision view or be explicitly separate retrospective context. The closest-earlier report fallback cannot silently become mission solar evidence.
- Do not synthesize hourly temperatures, dust, wind or humidity. Do not interpret rendered scene shadows as mission daylight.
- Preserve current route geometry, analytical/display coordinate separation, scene sources, panoramas, camera controls, layers and both languages. Do not copy private `.env` files into another worktree. A locally available token may be passed privately to the test process without printing or committing it.
- Keep request ID/revision matching, invalidation on relevant edits, and rejection of delayed/reverted-input responses. Do not reintroduce static planning-response fallbacks.
- Clearly label the single fastest candidate. Multiple route criteria remain outside this slice; no extra cards, random detours or simulated alternatives.
- Update English run/setup instructions, service/draft examples and an implementation handoff with actual verified/pending scope. Update task statuses accurately without marking unrelated P2/P3 work complete.
- Include deterministic prepared examples for a valid daylight mission, incompatible daylight, missing evidence, and missing/ineligible forecasts. Preserve the original synthetic 800/2600 acceptance case.

Complete focused verification, push the final delivery, and open one PR into main if tooling/authentication permits. Title example: `Integrate real Gale daylight and decision-safe historical forecasts`. The body must summarize resulting behavior, tests, reconstruction/scientific limits and any remaining unverified browser steps. Do not merge it.

## Required verification

Use existing tests and add meaningful boundary tests for new behavior. Do not retrain models merely to repeat published scores, or repeat broad checks after they pass unless changes justify it.

Backend and data checks:

1. Existing catalog/team/movement standalone checks, engine tests, service regressions and affected preparation tests remain valid.
2. UTC/sol conversion round trips and actual physical sol duration; multiple dates and active-location solar evidence; exact boundary pass and overrun failure; no daily data before interval completion.
3. Missing, unknown-availability, malformed, duplicate and future-revision records; no future observations/final-window metrics in decision JSON; distinct training/issue/availability/validity/decision timestamps.
4. Quantiles, nulls, units and RAD classification preserved; wrong spatial/epoch context rejected; target interval selection correct for multiple horizons.
5. Task +1 s changes totals by +1 s. Mission and participant margins still include reserve once. Context-only environmental changes reuse graph/base searches.
6. A calculated real Gale request with exact package/model/policy versions and actual daylight/forecast evidence. Record route totals and representative latency/memory without claiming fresh planetary validation.

Frontend/transport checks:

7. Typecheck, production build, actual service consumer tests and relevant HTTP tests. Distinguish skipped tests from passes. Set `SERVICE_TEST_URL` and `P2_TEST_PYTHON` appropriately for existing live checks.
8. Browser flow: metadata -> team/mission -> compute -> actual route and environment; valid/incompatible/missing cases; language switch; stale edits; service stopped; recovery after restart.
9. Check real scene/panorama/layer/camera behavior with a valid private token when available. If unavailable, run independent logic/component checks and document the exact visual gap. Never claim browser verification from a build alone.
10. Clean restart using only documented commands and prepared assets. Keep technical request/task/geometry/output resource bounds; no silent route truncation, hidden fallback, native-cancellation claim or mandatory live download during planning.

## Autonomous handling of blockers

| Situation | Required action |
| --- | --- |
| Missing raw historical publication time | Apply the explicit conservative reconstruction policy if its dependencies are known; otherwise exclude the record with a reason. Continue. |
| Forecasts start after the earliest replay instant | Advertise the first chronologically supported instant; preserve missing coverage for earlier decisions. Do not cherry-pick outcomes. |
| No valid token/browser surface | Finish backend, tests and build; record specific unverified scene steps. Do not fabricate a screenshot or ask the owner to reveal a token in chat. |
| Data download unavailable | Reuse verified local artifacts or complete independent synthetic/boundary checks; report the exact missing package and recovery command. |
| Network/authentication blocks push or PR creation | Keep the completed commits, retry only when justified, report exact failed action and provide push/PR commands. Never claim publication succeeded. |
| Main changes concurrently | Inspect, integrate relevant upstream changes without published-history rewrite, rerun affected checks and preserve unrelated work. |
| Platform requests execution permission | Request only the concrete necessary action and state why. Do not stop implementation for already-authorized routine choices. |
| A real correctness blocker remains | Complete independent work, document reproduction and limitation, and mark the PR unready for merge. Do not hide failure behind a synthetic result. |

Platform approvals may still require the owner; this assignment is not a promise that runtime approval controls can be bypassed.

## Explicit scope boundaries

Do not implement new effort/communication search, terrain-visibility preparation, scene-picked destinations, reachable-area output, simulated progress/events, route-level THEMIS penalties, B2/dust/UV models or an online DONKI pipeline in these four deliveries. They remain in the agreed backlog.

Do not reuse C1's final `alerts.parquet` or centred-window RAD event labels as an operational replay feed. A future DONKI provider must select raw eligible revisions at each cutoff before retrospective aggregation. Do not turn an ENLIL arrival into a dose spike or mission veto.

Keep the region-independent directed graph. Preserve prepared bounds and masks, co-travel, group edge timing, explicit total payload, fixed identities and nonnegative physical-time movement costs. Do not relax terrain constraints to manufacture a successful route.

This assignment supersedes earlier instructions to pause after the first intermediate environment increment. It authorizes all four deliveries and their incremental publication, followed by one final review gate before main integration.

## Final report to the owner

Lead with what now works. Include:

- All delivery commits, local branch/base and verified remote HEAD.
- PR URL, its actual readiness, and outstanding blockers/checks. If no PR could be created, provide the exact compare link or command.
- Copy-paste Windows commands with full working-directory and interpreter information for preparation, backend and frontend. Detect that Node may not be on the owner's PATH; use a verified executable and avoid a hardcoded runtime version when discovery is possible. Do not start duplicate services on occupied ports.
- Three to five exact manual test cases with expected statuses/values and a chronological supported replay instant.
- Test counts, skipped/unverified cases, real-package evidence and limits of reconstructed availability and model applicability.
- A concise preserved backlog: effort, geometric communication, map selection, evaluated recommendations, reachable area and simulated replanning.
- The audit and this assignment included in an appropriate commit, without the unrelated workflow draft.
- Post-merge commands: fetch/prune, switch main, fast-forward only, status/log and restart both services. The owner merges only after review; do not merge automatically.

Leave a concrete reviewable result, not an offer to continue later. If everything passes, the owner should only need to review the PR, try the documented cases and merge.
