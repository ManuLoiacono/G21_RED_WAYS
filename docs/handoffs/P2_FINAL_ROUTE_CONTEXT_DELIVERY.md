# Final route context delivery

Date: 2026-11-15. Branch: `p2/final-route-context`.
Initial base: `19d8303d952efb4e5c271a169d1a53d609f4cdb6`. Incorporated latest main `7359c4f7a79856fca8bb051ea13c59dce433bcb2` through a merge, preserving published history. Its new Azure image requires the prepared material directory; added that directory to its COPY and build-context allowlist.

## Completed scope

- Each calculated alternative receives additive `terrain_context` from the existing 30 x 30 THEMIS crop. Every analytical edge is partitioned at raster boundaries in the unshifted spherical equirectangular frame. Distance and existing physical edge time are aggregated by original brightness categories; outside/nodata stays unknown. Missing legs retain partial/unavailable status. Reserve is excluded. Routing, eligibility, ranking and assessment are unchanged.
- Selected-candidate decision records populate an existing-style environmental disclosure. Only supplied eligible pressure, minimum/maximum temperature and detector B RAD background rates are consumed. Observations and predictions remain separately classified; exact quantiles, units, dates and horizons are in tooltips. Optional nulls and verification records are omitted. A comparison candidate without its own evidence does not inherit the baseline evidence; legacy single-route responses remain compatible. No browser forecast recomputation.
- Removed the public capability inventory and replaced the obsolete wizard checklist with a positive scope statement in both languages. Backend `not_evaluated`, assumptions and provenance remain intact. The current wizard, styling, map integration, comparison, reachability, recommendations and progress flow are retained.

The backend crop is reproducible with `python -m scripts.prepare_material`; content ID is `87bbb585a10988d2db5cc12ef3e6b97aa1c36634cd0c255734075a6f2fafa2df`. No new source download is needed.

## Actual automated verification

- Initial `python -m unittest discover -s service/tests`: 103 passed, 0 skipped (65.574 s). Repeated after incorporating latest main and adding missing-leg assertions: 104 passed, 0 skipped (271.924 s), including the new hosted-origin checks, real-grid route advisory invariance and navigation regressions.
- `python -m unittest service.tests.test_material scripts.tests.test_prepare_material`: 5 passed, 0 skipped. Repeated after adding missing-leg assertions: 22.589 s. Covers crossed cells that contain neither endpoint, fractions/reverse direction, half-open boundaries, nodata/outside, frame alignment, physical duration/reserve and unchanged real-grid routing/assessment.
- `SERVICE_TEST_URL=http://127.0.0.1:8006 node --test --test-concurrency=1 app/tests/context.test.cjs app/tests/mission.test.cjs app/tests/navigation.test.cjs`: 16 passed, 0 skipped initially (45.236 s); final post-merge rerun with the selection guard: 16 passed, 0 skipped (116.423 s). Includes real HTTP distinct candidates, proposal application, and 2,140,369-cell reachable area.
- Final strengthened context tests: 3 passed, 0 skipped. Actual renderer selection, candidate-local empty evidence, ES/EN, null/verification omission, malformed terrain rejection and partial coverage are covered. Public real-response fixture is committed; tests do not depend on a local `.venv` response file.
- TypeScript `tsc --noEmit`: passed.
- Final Vite production build: passed, 1,689 modules; existing chunk-size warning remains (main bundle 5,273.98 kB before gzip; final build 1 min 37 s).
- `git diff --check`: passed.

One intermediate consumer run had a stale comparison fixture and omitted the Python test setting (14 passed, 1 failed, 1 skipped). The fixture was updated to carry candidate-local evidence and the complete suite was rerun with the setting enabled; final results are reported above. An overlapping build attempt was stopped during memory pressure; only completed builds are reported.

Browser smoke used the real backend on port 8006 and current frontend on 5176. Verified five-step wizard, calculation, bilingual classified values and terrain distances, comparison, selecting the lower-ascent candidate, edit invalidation and recalculation. Changing tasks from 10 to 11 minutes changed total including reserve from 58 min 39 s to 59 min 39 s. No public capability inventory appeared.

## Local launch (PowerShell, two terminals)

The isolated worktree has its own installed `.venv` and `app/node_modules`. Its ignored real analytical archive was reused and validated against the committed manifest. Existing private token settings were read without modification.

```powershell
Set-Location 'C:\Users\Usuario\Desktop\Nasa Challenge\G21_FINAL_ROUTE_CONTEXT'
& .\.venv\Scripts\python.exe -m service --port 8006 --allow-origin http://127.0.0.1:5176 --gale-package data/processed/gale/analytical/manifest.json
```

```powershell
Set-Location 'C:\Users\Usuario\Desktop\Nasa Challenge\G21_FINAL_ROUTE_CONTEXT'
$env:VITE_SERVICE_URL='http://127.0.0.1:8006'
& .\.venv\Scripts\python.exe -m scripts.run_frontend --node (Get-Command node.exe).Source --port 5176 --token-env-file '../G21_RED_WAYS/app/.env'
```

Open `http://127.0.0.1:5176/?lang=en`.

## Three manual acceptance steps

1. Calculate a mission; expand Environmental context and Terrain context. Check classifications, units/date tooltips, approximately 100 m source resolution and explicit unknown coverage.
2. For Morgan Vale alone to Eastern control target, compare routes and select the other card. Check selected route/context and ES/EN; confirm the capability inventory stays absent.
3. Edit task duration, recalculate, and check updated timing and context while retaining map/camera controls.

## Limitations

No blocking implementation issue remains. Docker is not installed on this host, so the newly incorporated image packaging was inspected but no container build/deployment was claimed. The local browser reports the existing optional HiRISE elevation-profile grid is not built in this worktree; profile plotting was therefore unavailable. Map rendering, calculated paths and route calculations were available. Exhaustive camera/panorama and progress-event simulation were not repeated in this finishing pass. Backend/HTTP regressions cover existing navigation behavior; this is not a claim of exhaustive browser coverage. The static crop retains its own source provenance and coverage; it is qualitative advisory context.

Other worktrees, private settings and `docs/FLUJO_TRABAJO_EQUIPO.md` were preserved. No merge was performed.
