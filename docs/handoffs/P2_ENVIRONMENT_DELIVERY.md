# Gale environment integration delivery

Date: 2026-11-15. Branch: `p2/environment-integration`.
Isolated checkout: `C:/Users/Usuario/Desktop/Nasa Challenge/G21_ENVIRONMENT_INTEGRATION`.
Initial base: fetched `origin/main` at `ec00116`. Finalization detected concurrent
main `4256ea6` (P1's mission wizard, PR #15); it was integrated by a merge commit
without rewriting published history. The five-step wizard, team cards, map-point
preview and live summaries are preserved. Its schedule uses advertised replay
coverage and real clock labels. Optional seconds in `hh:mm[:ss]` retain exact
physical durations while preserving minute-only defaults.
All four authorized deliveries are implemented. Main integration requires owner review;
no automatic merge is performed.

## Delivered behavior

1. Offline assets: verified and copied the adjacent generated terrain archive after all
   six array identities and shapes matched. The binary remains ignored. The committed
   environmental source package is small, bounded, content addressed and reproducible
   from existing Parquet/JSON exports. A separate compatible venv retains engine pins.
   Analytical preparation no longer imports the optional mesh's Pillow dependency.
2. Solar/time: actual resolved analytical-origin coordinates drive Mars24 geometric
   daylight on the engine's physical-second timeline across all 41 source sols.
   UTC, local sol/LMST and source date labels remain distinct. The legacy marstime
   0.5.6 leap-table discrepancy is explicitly accounted for in daily input completion.
3. Historical provider: 41 files / 574 forecasts, frozen validation model selection,
   preserved quantiles/nulls/units/provenance, complete input/model availability gates,
   full reserved-mission target validity, distinct horizons/revisions and explicit gaps.
   Future target observations, baselines and final-window skill never enter decision
   records. Raw archive hashes attest source integrity but do not affect semantic
   snapshot identity. Weather/RAD do not affect movement weights or mission status.
4. UI: advertised replay defaults and editable coverage, derived daylight plus eligible
   observation/prediction details, both languages and existing team/task/budget edits.
   The browser REMS panel is explicitly retrospective reference context. Its earlier
   report fallback cannot become mission solar evidence. One fastest candidate remains.

The two supplied assignment/audit documents are included in delivery 1. The original
checkout, private environment files and `docs/FLUJO_TRABAJO_EQUIPO.md` remain untouched.
Shared v0 contracts remain unchanged; this is still `p2-plan-draft-1`, consumer review
pending, not a declaration of shared-v1 acceptance.

## Windows preparation and launch

The following commands use the verified local Python base and an isolated runtime.
The existing prepared archive is already present in this delivery checkout. A clean
clone must prepare it using the command shown; no adjacent checkout is required.

```powershell
$repoRoot = 'C:\Users\Usuario\Desktop\Nasa Challenge\G21_ENVIRONMENT_INTEGRATION'
Set-Location -LiteralPath $repoRoot
# Clean installation only; the delivery worktree already has this environment.
& 'C:\Users\Usuario\anaconda3\python.exe' -m venv .venv
& "$repoRoot\.venv\Scripts\python.exe" -m pip install -r engine/requirements.txt
& "$repoRoot\.venv\Scripts\python.exe" -m pip install -r scripts/analytical-requirements.txt -r scripts/environment-requirements.txt
# Clean clone only: downloads the bounded COG window and generates the ignored archive.
& "$repoRoot\.venv\Scripts\python.exe" -m scripts.prepare_gale --factor 2
# Offline and deterministic: reads committed exports; no training or downloads.
& "$repoRoot\.venv\Scripts\python.exe" -m scripts.prepare_environment
```

Do not install `ml/requirements.txt` into this runtime. Runtime needs NumPy 1.26.4 /
SciPy 1.11.4; preparation adds rasterio/affine and pandas/pyarrow. `/plan` imports
none of pandas, marstime or LightGBM and never trains/downloads data.

Backend terminal (check for an existing listener first; stop its own terminal with
Ctrl+C before restarting, and do not stop another contributor's service):

```powershell
$repoRoot = 'C:\Users\Usuario\Desktop\Nasa Challenge\G21_ENVIRONMENT_INTEGRATION'
Set-Location -LiteralPath $repoRoot
Get-NetTCPConnection -LocalPort 8000,5173 -State Listen -ErrorAction SilentlyContinue
& "$repoRoot\.venv\Scripts\python.exe" -m service --gale-package data/processed/gale/analytical/manifest.json
```

Health must report default parcel `gale_hirise_019698/native2-v1`,
`environment_mode: historical_replay`; without `--gale-package`, health identifies
synthetic development. Missing/tampered requested packages fail instead of falling back.

Frontend preparation in a second terminal. Node is available in the Codex runtime
here, although ordinary Windows terminals may not include it on PATH. This discovers
the executable rather than hardcoding a Codex runtime version:

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
# Local review: privately read the existing token; no file is copied or printed.
& "$repoRoot\.venv\Scripts\python.exe" -m scripts.run_frontend --node $nodeExe --token-env-file 'C:\Users\Usuario\Desktop\Nasa Challenge\G21_RED_WAYS\app\.env'
```

Open `http://127.0.0.1:5173/?lang=en`. For another installation, supply an existing
private token file of your choice, or omit `--token-env-file` and use Vite's normal
environment configuration. Planning/metadata work even if scene credentials are absent.
The launcher uses `--strictPort`; it will not silently start a second instance elsewhere.

## Exact manual acceptance cases

Use the real parcel, explorer_01 plus support_rover, zero loads, reconnaissance,
600 s task, 1800 s reserve and 21600 s mission budget. Restore defaults between cases.
All five requests are committed under `service/examples/gale-replay*.request.json`.
In the new wizard, choose **New mission**, advance through Mission, Team, Tasks and
Schedule, then calculate on Summary. Schedule's **Advanced** section edits decision
cutoff/scenario. Duration inputs accept `00:10` for the 600 s task, `00:30` reserve
and `06:00` budget; `00:10:01` is exactly 601 s. Edit mission returns to the summary
and its step buttons reopen the relevant controls.

| Case | Decision cutoff / departure UTC | Expected result |
| --- | --- | --- |
| Default, `gale-replay.request.json` | Both `2025-10-26T00:26:28Z` | `viable_model`; 1718.7375283296024 s activity / 3518.7375283296024 s including reserve; four forecasts for target sol 4700; four eligible daily observations. Pressure p10/p50/p90 = 685.37/687.05/688.63 Pa; RAD = 107.28/110.48/113.63 microgray/day. |
| Late, `gale-replay-late.request.json` | Cutoff remains default; depart `2025-10-26T12:30:00Z` | `incompatible`; reserved daylight margin -2880.527273329586 s. |
| Missing, `gale-replay-missing.request.json` | Default times; scenario `gale_historical_missing_daylight` | `insufficient_evidence`; two missing daylight checks and no invented solar window. |
| Early, `gale-replay-early.request.json` | Both `2025-10-25T03:26:03Z` | `viable_model` from daylight/budgets; all four forecast variables explicitly missing/ineligible. |
| Boundary, `gale-replay-boundary.request.json` | Cutoff default; depart `2025-10-26T11:41:59.472727Z` | `viable_model` within 1 microsecond arithmetic tolerance. Add 1 s to the task: `incompatible`, activity rises by exactly 1 s and reserve is counted once. |

The first default was selected chronologically by eligible coverage and base daylight,
not by later forecast outcomes. Source-sol coverage is 2025-10-24T18:11:08.102760Z
inclusive through 2025-12-05T21:14:13.112782Z exclusive. These are physical source-sol
bounds, not the REMS dataset's Earth-date labels. Exact boundary input can also be sent
without browser millisecond normalization using:

```powershell
Set-Location -LiteralPath 'C:\Users\Usuario\Desktop\Nasa Challenge\G21_ENVIRONMENT_INTEGRATION'
& .\.venv\Scripts\python.exe -m service.client --request service/examples/gale-replay-boundary.request.json
```

Also check ES/EN preserves the result, editing then reverting inputs clears it, and
stopping the backend shows an explicit connection error with no route. Restart with
the documented command and calculate again. The synthetic request example retains
the original 800 s activity / 2600 s including reserve acceptance case.

## Verification actually performed

| Check | Actual result |
| --- | --- |
| Engine suite | 40 passed. |
| Full service suite, including HTTP | 81 passed. A focused 11-provider check additionally verifies semantic snapshot identity excludes raw retrospective hashes. |
| Standalone catalog, mission/team, directed movement | All three passed. |
| Analytical preparation | 3 passed after removing the accidental optional Pillow import. |
| Real deterministic acceptance | All five cases passed; boundary +1 s failed as required; graph/base reuse checked. |
| Forecast inventory | 41 files, 574 rows imported; finite/ordered quantiles, mapping, nulls, source hashes, malformed/duplicate/unknown/future records and target/spatial gates checked. |
| Frontend transport/consumer | 13 passed, 0 skipped against the actual service with `SERVICE_TEST_URL` and `P2_TEST_PYTHON`, including wizard duration round trips. |
| TypeScript and full Cesium production build | Passed; existing large-chunk warning remains. Build used a nonsecret placeholder. |
| Runtime dependency consistency | `pip check` passed; no ML requirements installed. |
| Browser, private token | Streamed terrain, actual outbound/return/endpoints, predictions, daylight, ES/EN, task +1, stale edits, incompatible/missing/early cases and stopped-service/restart recovery verified. |
| Delayed transport in browser | Real engine response held by the existing regression proxy, then task edited/reverted before release: no result resurrected. |
| Preserved scene | Real Nevado Sajama panorama loaded; orbit drag, reset/focus and THEMIS toggle checked; mission totals unchanged. |
| Concurrent main integration | Five-step wizard recalculated the same real route; +1 s task, invalidation, ES/EN, editable cutoff, early missing forecasts, late incompatibility and missing daylight were rechecked. TypeScript and the full production build passed after integration. |

One initial HTTP test aborted with Windows WinError 10053, matching the prior handoff's
intermittent loopback issue. Its isolated rerun and later full suites passed; it is not
reported as an initial clean pass. No tests are represented as browser verification
merely because the build succeeded. Exhaustive camera-clearance and optional generated
HiRISE mesh interaction were not tested; that optional mesh is explicitly not built.

Run the deterministic checks from the repository root:

```powershell
& .\.venv\Scripts\python.exe -m unittest discover -s engine/tests
& .\.venv\Scripts\python.exe -m unittest discover -s service/tests
& .\.venv\Scripts\python.exe -m unittest discover -s scripts/tests
& .\.venv\Scripts\python.exe -m engine.tests.test_catalog
& .\.venv\Scripts\python.exe -m engine.tests.test_team
& .\.venv\Scripts\python.exe -m engine.tests.test_movement
& .\.venv\Scripts\python.exe -m scripts.verify_environment
$env:SERVICE_TEST_URL = 'http://127.0.0.1:8000'
$env:P2_TEST_PYTHON = (Resolve-Path .venv/Scripts/python.exe).Path
& $nodeExe --test app/tests/mission.test.cjs
& $nodeExe app/node_modules/typescript/bin/tsc --noEmit -p app/tsconfig.json
```

Evidence: [acceptance JSON](../evidence/gale-environment-acceptance.json),
[benchmark](../evidence/gale-environment-benchmark.json),
[route and forecasts](../evidence/gale-environment-replay.jpg),
[integrated wizard](../evidence/gale-environment-wizard.jpg),
[daylight](../evidence/gale-environment-daylight.jpg),
[loaded panorama](../evidence/gale-environment-panorama.jpg).

Real route: 62 vertices each leg; 149.416 m outbound/return, 539.208 s outbound and
579.529 s return. Representative final benchmark: package load 4.471 s, graph 7.254 s,
two searches 1.132 s, reconstruction 0.125 s, peak whole-process RSS 338.25 MiB.
Measurements varied under simultaneous browser/host load; these are local runtime
observations, not fresh planetary or physiological validation. The separate acceptance
process measured its first calculation at 10.311 s with already-loaded packages.

## Scientific limits and preserved backlog

Geometric daylight uses a spherical horizontal horizon, solar center at 0 degrees,
with no atmospheric refraction, solar disk, elevation dip or terrain shadows. Three
separated rover-sol references (4699, 4719, 4739) differ from rounded REMS sunrise/sunset
by at most 0.899 local clock minutes. They are independent reference reports, not
exact base sunlight. Analytical coordinates/heights and the scene adapter are unchanged.

`completed-inputs-retrospective-v1` assumes zero processing/publication delay after
all included REMS/waypoint, RAD sol/CDF Earth-day, SILSO daily and frozen model-training
inputs complete. Model/training cutoff, issue, availability, target interval, decision
cutoff and modern retrieval remain separate. Source revisions are modern; original
archival knowledge cannot be reconstructed exactly. Missing per-observation RAD
retrieval timestamps remain null with an explicit reason. No NASA lag is invented.

Forecast spatial applicability is an explicit reference-rover assumption limited to
the prepared parcel, not a validated weather field or an altitude transformation to
the base. Minimum-temperature intervals under-cover in the existing validation
(roughly 0.65–0.69 versus nominal 0.80); no post-exam recalibration or model selection
was performed. RAD is RTG-corrected silicon B background rate, not human effective
dose or a particle-event predictor. There are no weather speed penalties, operational
radiation thresholds, exposure integration or DONKI vetoes.

No remaining blocker prevents review of these four deliveries. Independent geographic
registration accuracy and operational/scientific validation remain limitations. Effort,
geometric communication, map destination selection, evaluated recommendations,
reachable area and simulated progression/replanning remain separate backlog work.

## After owner merge

Stop backend/frontend in their own terminals before switching/restarting. In the
original checkout, preserve the unrelated untracked workflow draft. The two included
handoff drafts may collide with the newly tracked files: preserve them outside that
checkout first, rather than deleting or overwriting them.

```powershell
Set-Location -LiteralPath 'C:\Users\Usuario\Desktop\Nasa Challenge\G21_RED_WAYS'
$draftBackup = Join-Path (Split-Path (Get-Location).Path) ('environment-handoff-backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $draftBackup
foreach ($draft in @('docs/handoffs/P2_AUTONOMOUS_ENVIRONMENT_INTEGRATION.md','docs/handoffs/NAVIGATION_REVIEW_2026_11_15.md')) {
  if (Test-Path -LiteralPath $draft) {
    git ls-files --error-unmatch -- $draft 2>$null
    if ($LASTEXITCODE -ne 0) { Move-Item -LiteralPath $draft -Destination $draftBackup }
  }
}
git fetch --prune origin
git switch main
git pull --ff-only origin main
git status --short --branch
git log -5 --oneline
```

Then use the preparation and launch commands above with `$repoRoot` set to the original
checkout. Prepare or copy a verified ignored terrain archive beside its matching
manifest; do not make the implementation worktree a permanent data dependency.
Restart the backend with `--gale-package`, restart the frontend, and repeat the default
and late-departure cases. Never force-update main, auto-merge or delete branches here.
