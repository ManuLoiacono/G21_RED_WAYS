# Reconcile the environment delivery while preserving P1's frontend

Date: 2026-11-15.
Reviewed main: `4256ea6`, PR #15 (`p1/mission-ui-redesign`).
Reviewed published delivery: `p2/environment-integration` at `bb9bad6`.
Delivery worktree: `C:/Users/Usuario/Desktop/Nasa Challenge/G21_ENVIRONMENT_INTEGRATION`.

## Latest owner instruction: binding scope change

The owner wants to preserve the teammate's current mission interface and interaction model exactly. Retain and integrate the navigation/environment backend work, but remove this branch's frontend contributions before merging.

This instruction supersedes the frontend delivery in `P2_AUTONOMOUS_ENVIRONMENT_INTEGRATION.md`, previous permission to adapt the wizard, and the earlier frontend acceptance scope. The owner has NOT authorized merging the current branch.

Implement the correction on the existing published feature branch in its own worktree. Preserve its history and publish corrective commits. Do not merge into main, force-push, or rewrite published commits. Do not stop after producing another plan.

## Non-negotiable frontend invariant

At final review, the complete tracked `app/` tree in the feature branch must be identical to the newest main incorporated into the branch.

This protects not only styling but all frontend behavior: HTML, CSS, text, translations, the five-step wizard, team cards, live summaries, destination/map preview, results, date/duration controls, camera, panoramas, source panels, frontend types/validators, tests, dependencies and app documentation.

Do not make even a small frontend "compatibility fix", add a forecast panel, add time fields, change minute/second formatting, inject browser code from the server, or recreate a removed feature through another frontend entry point. Make compatibility changes in the backend instead. If something cannot be exposed through the unchanged UI, keep the backend capability and document its API/CLI use for a separate P1 review.

## What was found during review

Main `4256ea6` already exists in the ancestry of `bb9bad6`. Codex integrated the wizard by merge, but still changed these paths relative to main:

```text
app/README.md
app/src/environment/layer.ts
app/src/i18n/en.ts
app/src/i18n/es.ts
app/src/main.ts
app/src/mission/draft.ts
app/src/mission/environment.ts
app/src/mission/panel.ts
app/src/mission/results.ts
app/src/mission/time.ts
app/src/mission/validation.ts
app/tests/mission.test.cjs
```

The list may grow if upstream or the feature branch has advanced. Protect the whole directory rather than only this list. In particular, the newly added `environment.ts`, environmental cards, replay coverage labels and seconds-aware formatting belong to the removed frontend contribution, even if they were previously tested.

## Step 1: update and restore the main frontend

1. Read applicable instructions, inspect the feature worktree and preserve unrelated changes before any restoration. Leave `docs/FLUJO_TRABAJO_EQUIPO.md`, private `.env` files and other contributors' worktrees untouched.
2. Fetch origin and record the exact main/feature SHAs. If the source checkout has already fetched newer refs, use them. Never claim a successful fetch after a network failure. If no current remote access is possible, identify the latest locally fetched baseline in the final report.
3. Work on `p2/environment-integration` in `G21_ENVIRONMENT_INTEGRATION`, not in the owner's main checkout. A local safety reference to the published pre-correction tip is acceptable; the existing commits must remain recoverable.
4. Merge updated `origin/main` into the feature branch without rewriting history. Resolve frontend conflicts by preserving main's current complete frontend. Inspect and resolve backend conflicts semantically rather than applying a blanket ours/theirs rule.
5. Once unrelated work has been preserved, restore tracked `app/` from the incorporated `origin/main`. An appropriate command in the feature worktree is:

```powershell
git restore --source=origin/main --staged --worktree -- app/
```

This command intentionally removes the feature-only tracked frontend file as well as reverting modified tracked files. It must not be used to discard unrelated uncommitted frontend work. It does not authorize deletion of private or untracked files.

6. Verify the staged correction and commit it with a clear message such as `Preserve main frontend and retain environment backend work`. Push and verify the branch SHA when possible.

Do not reverse all environment commits or revert P1's wizard commits: retain backend logic and preserve the latest main interface.

## Step 2: preserve backend behavior and prove compatibility

Keep the legitimate backend/navigation delivery, subject to existing tests and any demonstrated correction needed:

- `service/solar.py`: real location-specific geometric daylight and physical-time normalization.
- `service/environment_package.py`, `real_environment.py`, `historical_forecasts.py`: bounded offline source inventory, replay scenarios, eligible observations/forecasts, quantiles, provenance and reconstructed availability.
- Relevant changes in `service/prepared.py`, `scenarios.py`, `planning.py`, `exchange.py`, `gale.py`, `http_server.py`.
- Preparation/verification scripts, environment requirements, committed compact source metadata, backend tests, request examples and accurate documentation.
- Independent directed navigation, team/payload rules, mission/participant margins, real analytical terrain, coordinate registration, resource limits, input invalidation protocol and search reuse.

Keep optional frontend-launch tooling only if it is genuinely needed for local setup/testing and does not alter UI content or startup behavior behind the owner's back. Do not let a launcher become a route for injecting new frontend behavior.

### Preserve the API the current main app actually consumes

- Read main's unchanged `app/src/mission/api.ts`, `request.ts`, `draft.ts`, `validation.ts`, `panel.ts` and `time.ts` before adapting the backend.
- Preserve `p2-plan-draft-1` required request and response fields, `/health`, exact `/parcel`, catalogs, request echo, geographic adapter, route geometry, nullability and existing status semantics.
- Additional environment fields may remain additive. Do not require a frontend-only new request field, parser or control to use existing navigation.
- Defaults advertised through existing metadata may select the legitimate replay scenario and eligible instant, but do not silently reinterpret user-entered dates, durations, reserves or units to emulate removed UI controls.
- Verify both synthetic and real-terrain configurations. The unchanged frontend must still initialize and calculate through the current contract.
- Forecasts can remain inspectable through backend responses, the existing raw evidence details, CLI examples or metadata. A dedicated new environmental presentation is deferred to P1.
- Keep exact physical-second arithmetic in the backend. Main's duration editor currently accepts `hh:mm`; preserve that editor. Test task +1 second through direct requests/CLI rather than changing the UI to accept `hh:mm:ss`.
- Retain no-future-information guarantees, completed-input/model availability, target interval applicability and distinct forecast horizons. Never drop the safeguards to make a frontend compatibility check pass.
- Weather/RAD remain context-only. No new speed penalties, human radiation thresholds, automatic DONKI vetoes or fabricated alternatives.

### Existing main copy that will need P1 follow-up

At the reviewed baseline, `nav.realTerrain` still says daylight evidence is missing and the clock is assumed; `nav.clock` describes the old synthetic clock. The upgraded backend can now provide actual geometric daylight. Main's duration formatter also rounds presentation to minutes.

Document these pre-existing presentation limitations explicitly. Do not edit translations or formatting in this correction, conceal real backend evidence to match the copy, or claim that the unchanged UI now has the new forecast/clock presentation. P1 can address copy and presentation in a separate authorized change. Identify any contradiction that materially prevents acceptance in the final report.

## Step 3: verification and publication

- Run appropriate engine/service/environment regressions, including synthetic 800/2600, real Gale, boundary, late, missing, early/ineligible forecasts, payload/team checks and task +1-second arithmetic.
- Run main's unchanged frontend typecheck/build/tests against the corrected service. Run browser tests of the actual five-step wizard when available: initialize, choose mission/team/tasks/schedule, calculate, inspect routes, edit/recalculate, change language and recover from a stopped service. Do not claim skipped checks passed.
- Keep consumer-compatibility regression tooling outside `app/` if new tooling is necessary. It should exercise the actual unchanged frontend validators rather than a rewritten permissive copy.
- Verify a real calculated request through the unchanged app. An endpoint-only pass is not sufficient evidence of consumer compatibility; if browser access is unavailable, report the exact gap and provide the manual steps.
- Do not alter the actual outcome/status or create a fixed fallback just to keep the UI happy. Keep missing evidence and technical errors explicit.
- Update English backend documentation and the delivery handoff/PR description to match the new backend-only scope. Mark previous UI screenshots/checks as historical branch evidence, not proof of the corrected final frontend.
- Make small corrective commits, push each completed unit and verify remote HEAD. If the existing PR was opened for this branch, update its title/body around the final scope. If it does not exist, open a PR when authenticated tooling permits. Do not merge.

Suggested PR title: `Integrate Gale replay backend while preserving the main frontend`.

## Mandatory final frontend checks

After committing, and again after incorporating any newer main:

```powershell
# Both commands must print no paths and exit successfully.
git diff --exit-code origin/main HEAD -- app/
git diff --exit-code origin/main...HEAD -- app/

# The two printed tree IDs must be identical.
git rev-parse origin/main:app
git rev-parse HEAD:app

# Review the actual PR scope.
git diff --name-status origin/main...HEAD
git status --short --branch
```

A clean frontend diff against an older main is insufficient if newer P1 work has appeared. Record the precise main SHA used in the final verification. All frontend files, including `app/README.md`, tests and dependencies, are inside this invariant.

If any UI path remains in the PR diff, the correction is unfinished. Do not force the merge or downgrade this requirement to "looks similar".

## Completion report

Return the corrected branch/commits, push verification, PR URL, exact incorporated main SHA and matching frontend tree IDs. Explain which backend features remain functional through the existing UI versus API/CLI only, any stale main copy and any browser checks not performed. Provide launch commands for the corrected worktree and manual acceptance cases. The owner reviews and merges only after this report.

The key acceptance condition is: all navigation/environment backend improvements are reviewable and compatible, while merging the PR contributes zero frontend changes relative to the incorporated latest main.
