# Backend-only Gale replay delivery

Date: 2026-11-15. Branch: `p2/environment-integration`.
Isolated checkout: `C:/Users/Usuario/Desktop/Nasa Challenge/G21_ENVIRONMENT_INTEGRATION`.
PR: https://github.com/ManuLoiacono/G21_RED_WAYS/pull/14 (owner review; do not merge automatically).

This handoff supersedes the earlier frontend delivery scope. The backend retains
all four deliveries' solar, replay, forecast, navigation and preparation work.
The entire tracked `app/` directory is exactly incorporated main; this branch
contributes no frontend changes. Dedicated environmental cards, translations,
wizard adaptations, validators and seconds-aware formatting were removed.

## Incorporated baseline and corrective publication

- Latest successfully fetched main: `4256ea66fc9ba189660d9b0325221f248d420ce2`.
- Published pre-correction tip: `bb9bad6a0c51bbc7d41c679da3cc9c76fea8d89f`.
- Frontend restoration commit: `be5cf625eb39bc6f38f65999c5faf1d772990240`, pushed and remote SHA verified.
- Both `origin/main:app` and corrected `HEAD:app`: `bddcb89f916ebef19079797fc8dd3c832161cda3`.
- Main was already in ancestry; incorporating it reported `Already up to date.`
  No published history was rewritten and no force-push was used.
- Both direct and triple-dot app diffs are empty. All final compatibility tooling
  and evidence live outside `app/`.

The original checkout, private environment files and
`docs/FLUJO_TRABAJO_EQUIPO.md` remain untouched. The original two assignment/audit
handoffs are retained as historical instructions. The binding backend-only
reconciliation handoff is also included.

## Retained behavior and unchanged consumer

Prepared offline terrain and a compact reproducible environment package support
actual-location Mars24 geometric daylight, physical-second sortie arithmetic,
completed-input historical replay and eligible A1/A2/B1 forecasts. There are
41 source sols, 574 forecast records, quantiles, explicit provenance, applicability,
missing-data states and separate issue/model/input/decision timestamps. Future
observations and final-window skill never enter decision records. Weather/RAD
remain context-only and do not change movement weights or mission status.

Independent directed outbound/return navigation, team/payload rules, participant
and mission margins, resource limits, coordinate registration, input invalidation
and graph/base-search reuse remain functional. Real mode requires explicit
`--gale-package`; missing or tampered requested packages fail without a synthetic fallback.

Main already consumes `p2-plan-draft-1`, health/parcel/catalog metadata, request echo,
geographic geometry and current status/nullability semantics. Its real and synthetic
baseline requests passed without a backend contract rewrite or a new required field.
Additional environment fields remain additive. No date, duration, reserve or unit
was silently reinterpreted to emulate the removed UI. Shared-v1 acceptance remains separate.

The unchanged UI initializes, plans, shows actual routes, totals, participant/daylight
checks and raw evidence. Forecast records are inspectable in the existing raw evidence,
HTTP responses and CLI. Dedicated environmental presentation is deferred to P1.
Main's `hh:mm` editor still accepts `00:10` = 600 s and rejects `00:10:01`;
exact task +1 physical second is tested through direct requests.

### Required P1 presentation follow-up

Main's `nav.realTerrain` still says daylight is missing and the clock is assumed,
and `nav.clock` describes the older synthetic clock. The real response contains
geometric daylight; neither evidence nor status is hidden to fit that copy.
The schedule summary omits seconds and duration presentation rounds to minutes.
The browser REMS panel is date-matched historical reference context and has no
replay decision-cutoff gate; it must not be treated as decision-safe evidence.
Raw scenario identifiers and new evidence fields lack dedicated translated presentation.
These pre-existing contradictions need a separate P1 review before claiming a
polished replay interface or operational readiness. They do not block the tested
navigation/API contract. No main translation, formatter or panel was changed here.

## Verification actually performed after restoration

| Check | Actual result |
| --- | --- |
| Engine unittest suite | 40 passed. |
| Service/environment/HTTP unittest suite | 81 passed; this reconciliation run had no failed tests. |
| Preparation unittest suite | 3 passed. |
| Standalone catalog, team and directed movement scripts | All three passed. |
| Deterministic real acceptance | Five cases passed; boundary task +1 s became incompatible; graph/base reuse and three separated solar references checked. |
| Main's unchanged frontend suite | 10 passed, 0 skipped against the real service. |
| Additional outside-app consumer suite | 5 passed, 0 skipped, using actual unchanged main API/request/validators against real and synthetic servers. |
| Main TypeScript check | Passed. |
| Main Cesium production build | Passed, 1683 modules; existing large-chunk warning remains. A nonsecret token placeholder was used for the build. |
| Runtime dependency consistency | `pip check` passed with engine pins preserved. |
| Frontend invariant | Direct and triple-dot app diffs empty; tree IDs match. |

The outside-app suite verifies synthetic 800/2600, real default/daylight/safe forecasts,
boundary/late/missing/early responses, exact +1 s arithmetic, margins, reuse and
request invalidation without a copied or permissive validator. It adapts only Vite
configuration syntax inside the Node test harness; nothing is injected into the UI.

Browser verification used the actual unchanged five-step wizard and a private existing
Cesium token: default mission/team/task/schedule initialized, calculated 1718.7375283296024 s
activity / 3518.7375283296024 s including reserve, and displayed the actual route.
Existing raw evidence contained four forecasts and real daylight, with no added
environmental panel. Editing payload to 1 kg and task to `00:11` cleared the result;
recalculation produced 1778.7375283296024 s activity. ES/EN preserved that result.
With the owned backend stopped, a new calculation displayed a connection error and
no result; after restart the same unchanged UI recovered and calculated the default
real route again. Cold graph construction outlasted an initial browser wait, but
subsequent observation confirmed the calculation; it was not reported as a skipped pass.

Current evidence: [unchanged-main screenshot](../evidence/backend-only-main-real.jpg),
[backend acceptance JSON](../evidence/gale-environment-acceptance.json),
[evidence classification](../evidence/FRONTEND_EVIDENCE.md).
The earlier four UI images and 13-test/seconds-aware wizard checks are historical
pre-reconciliation evidence, not proof of the final frontend. The earlier benchmark
is also historical runtime measurement, not a fresh performance claim.

## Exact Windows preparation and launch

The delivery worktree already has an isolated venv, installed app dependencies and
the verified ignored real terrain archive. A clean installation can prepare them:

```powershell
$repoRoot = 'C:\Users\Usuario\Desktop\Nasa Challenge\G21_ENVIRONMENT_INTEGRATION'
Set-Location -LiteralPath $repoRoot
# Clean installation only; do not replace the existing working environment.
& 'C:\Users\Usuario\anaconda3\python.exe' -m venv .venv
& "$repoRoot\.venv\Scripts\python.exe" -m pip install -r engine/requirements.txt
& "$repoRoot\.venv\Scripts\python.exe" -m pip install -r scripts/analytical-requirements.txt -r scripts/environment-requirements.txt
# Clean clone only: download the bounded COG window and generate the ignored archive.
& "$repoRoot\.venv\Scripts\python.exe" -m scripts.prepare_gale --factor 2
# Offline deterministic preparation from committed exports; no model training.
& "$repoRoot\.venv\Scripts\python.exe" -m scripts.prepare_environment
```

Keep NumPy 1.26.4 / SciPy 1.11.4. Do not install `ml/requirements.txt` in this runtime.
`/plan` imports no pandas, marstime or LightGBM and does not train or download data.

Backend terminal (check existing listeners; stop only your own process in its terminal):

```powershell
$repoRoot = 'C:\Users\Usuario\Desktop\Nasa Challenge\G21_ENVIRONMENT_INTEGRATION'
Set-Location -LiteralPath $repoRoot
Get-NetTCPConnection -LocalPort 8000,5173 -State Listen -ErrorAction SilentlyContinue
& "$repoRoot\.venv\Scripts\python.exe" -m service --gale-package data/processed/gale/analytical/manifest.json
```

Health must report `gale_hirise_019698/native2-v1` and historical replay. A no-argument
service startup explicitly defaults to synthetic development, not real Gale.

Frontend in a second PowerShell terminal (installed dependencies can skip `npm ci`):

```powershell
$repoRoot = 'C:\Users\Usuario\Desktop\Nasa Challenge\G21_ENVIRONMENT_INTEGRATION'
$nodeExe = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $nodeExe) {
  $nodeExe = Get-AppxPackage -Name '*CodexPrimaryRuntime*' |
    Sort-Object @{ Expression = { [version]$_.Version } } -Descending |
    ForEach-Object { Join-Path $_.InstallLocation 'dependencies\node\bin\node.exe' } |
    Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}
if (-not $nodeExe) { throw 'Install Node or set $nodeExe to the installed executable.' }
Set-Location -LiteralPath "$repoRoot\app"
$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
if ($npmCommand) {
  & $npmCommand.Source ci
} else {
  $pnpmCli = Join-Path (Split-Path (Split-Path $nodeExe)) 'node_modules\pnpm\bin\pnpm.cjs'
  & $nodeExe $pnpmCli --package npm@10.9.2 dlx npm ci
}
Set-Location -LiteralPath $repoRoot
& "$repoRoot\.venv\Scripts\python.exe" -m scripts.run_frontend --node $nodeExe --token-env-file 'C:\Users\Usuario\Desktop\Nasa Challenge\G21_RED_WAYS\app\.env'
```

Open `http://127.0.0.1:5173/?lang=en`. The optional launcher reads only the existing
private Cesium token into process environment, never copies/prints it, and launches
ordinary Vite with strict port binding. It does not inject content, rewrite code,
create an alternate entry point or change the main app's startup behavior. Omit
`--token-env-file` to use Vite's normal configuration. Planning works without scene credentials.

## Manual acceptance cases

Use the real parcel, explorer_01 plus support_rover, zero loads, reconnaissance,
600 s task, 1800 s reserve and 21600 s budget; reset defaults between cases.
In the wizard advance Mission, Team, Tasks, Schedule and calculate on Summary.
Use main's normal minute controls. Send precise boundary/+1 s cases through JSON/CLI.

| Case / committed request | UTC instant and expected result |
| --- | --- |
| `gale-replay.request.json` | Cutoff/departure `2025-10-26T00:26:28Z`; viable, activity 1718.7375283296024 s, total including reserve 3518.7375283296024 s; four eligible forecasts in raw evidence. |
| `gale-replay-late.request.json` | Default cutoff, departure `2025-10-26T12:30:00Z`; incompatible, reserved daylight margin -2880.527273329586 s. |
| `gale-replay-missing.request.json` | Default times, scenario `gale_historical_missing_daylight`; insufficient evidence and explicit missing daylight. |
| `gale-replay-early.request.json` | Both times `2025-10-25T03:26:03Z`; viable from daylight/budgets, four forecast variables missing/ineligible. |
| `gale-replay-boundary.request.json` | Default cutoff, departure `2025-10-26T11:41:59.472727Z`; viable within 1 microsecond arithmetic tolerance. Direct task +1 s becomes incompatible; duration increases exactly 1 s and reserve is counted once. |

```powershell
Set-Location -LiteralPath 'C:\Users\Usuario\Desktop\Nasa Challenge\G21_ENVIRONMENT_INTEGRATION'
& .\.venv\Scripts\python.exe -m service.client --request service/examples/gale-replay-boundary.request.json
& .\.venv\Scripts\python.exe -m scripts.verify_environment
```

Also verify edit/revert clears stale results, ES/EN preserves calculated values and
stopped-service calculation shows an explicit error without a fixed fallback.
Restart and retry. Synthetic default startup retains 800 s activity / 2600 s with reserve.
The default real instant was chosen chronologically from eligible coverage/daylight,
not later forecast outcomes; source-sol bounds are not Earth-date REMS labels.

## Repeatable checks

```powershell
Set-Location -LiteralPath 'C:\Users\Usuario\Desktop\Nasa Challenge\G21_ENVIRONMENT_INTEGRATION'
& .\.venv\Scripts\python.exe -m unittest discover -s engine/tests
& .\.venv\Scripts\python.exe -m unittest discover -s service/tests
& .\.venv\Scripts\python.exe -m unittest discover -s scripts/tests
& .\.venv\Scripts\python.exe -m engine.tests.test_catalog
& .\.venv\Scripts\python.exe -m engine.tests.test_team
& .\.venv\Scripts\python.exe -m engine.tests.test_movement
& .\.venv\Scripts\python.exe -m pip check
$env:SERVICE_TEST_URL = 'http://127.0.0.1:8000'
$env:P2_TEST_PYTHON = (Resolve-Path .venv/Scripts/python.exe).Path
& $nodeExe --test app/tests/mission.test.cjs
& $nodeExe app/node_modules/typescript/bin/tsc --noEmit -p app/tsconfig.json
# In a separate owned terminal: python -m service --port 8001 (synthetic).
$env:SYNTHETIC_SERVICE_TEST_URL = 'http://127.0.0.1:8001'
& $nodeExe --test scripts/tests/main_frontend_compatibility.test.cjs
```

Build unchanged main from `app` with `node node_modules/vite/bin/vite.js build` and
normal Vite configuration (a nonsecret placeholder suffices for build verification).
The local synthetic 8001 process is test-only. Do not terminate another contributor's listener.

## Scientific limits and preserved backlog

Daylight uses a spherical geometric horizon at solar-center altitude zero, without
refraction, disk correction, elevation dip or terrain shadow. Three separated
rover-sol references differ by at most 0.899 local clock minutes; they are not exact
base sunlight validation. `completed-inputs-retrospective-v1` assumes zero processing
lag after all source/model inputs complete. Modern source revisions cannot establish
exact original archival knowledge. Unknown RAD retrieval timestamps stay null.

Reference-rover forecasts are not a validated spatial field or base-altitude correction.
Existing temperature intervals under-cover; no final-window recalibration/model selection
was performed. RAD is RTG-corrected silicon detector B background rate, not human effective
dose or a particle-event predictor. No weather speed penalty, human radiation threshold,
exposure integration or DONKI veto was added. Independent geographic registration,
operational/scientific validation, optional mesh interaction and exhaustive camera
clearance remain unverified. Dedicated environmental presentation is deferred to P1.
Effort, geometric communication, map destination selection, evaluated recommendations,
reachable area and progression/replanning remain separate backlog work.

## Final review and owner merge

After committing and fetching main again, require both app diffs to be empty and
both tree IDs identical; inspect the complete PR scope. Do not merge automatically.

```powershell
git diff --exit-code origin/main HEAD -- app/
git diff --exit-code origin/main...HEAD -- app/
git rev-parse origin/main:app
git rev-parse HEAD:app
git diff --name-status origin/main...HEAD
git status --short --branch
```

After an owner merge, stop services in their own terminals before switching/restarting.
In the original checkout preserve unrelated drafts and any untracked handoff files
outside the checkout before pulling newly tracked versions. Never overwrite/delete
private environment files or `docs/FLUJO_TRABAJO_EQUIPO.md`.
Use `git fetch --prune origin`, `git switch main`, `git pull --ff-only origin main`,
then inspect `git status --short --branch` and `git log -5 --oneline`. Prepare a
matching ignored terrain archive in that checkout; do not depend permanently on the
implementation worktree. Repeat the real default and late-departure cases after restart.
