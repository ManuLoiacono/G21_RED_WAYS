# P1/P2 frontend integration

Date: 2026-11-14. Branch: `p1/http-mission-integration`, based on `origin/main` at `65b73cb`. No newer commits were present after fetching. Shared v0 and the P2 backend draft remain unchanged; this frontend explicitly adopts `p2-plan-draft-1` for local development, without declaring shared v1 acceptance.

## Delivery A: browser-to-engine connection

- The existing mission panel reads `/health`, exact `/parcel` metadata and `/catalogs`, then submits complete draft requests to `/plan`.
- The initial registered base/sample reconnaissance case calculates 800 s elapsed and 2600 s including reserve. Template defaults come from the central catalog export. Scenario identity/cutoff comes from the service request example.
- Structured HTTP errors, invalid payloads, connection errors and the 30 s browser timeout are visible. No fixed planning response is imported or used. Timeout/disconnect does not cancel service computation; retry is explicit.
- Request IDs, revisions, canonical input comparisons and the latest submit protect against stale/mismatched responses, including reverted edits. Language changes redraw the same engine result.
- Geographic visual fixtures and panorama observations are separate from registered metric planning locations. No metric route is passed to Cesium.
- Planning initializes independently of Cesium credentials/terrain loading. The scene error remains visible without blocking the form.

Verification: frontend typecheck/build passed; two focused consumer checks passed against the running Python service. Browser submission showed 800/2600 s. No local Cesium token was available, so the real scene was not loaded during this delivery. Run commands are in [app/README.md](../../app/README.md).

## Delivery B: configuration and calculated results

The service catalog drives the fixed roster (1–4 humans, 0–2 robots), all four templates and parameter defaults. Payload and the five allowlisted overrides are connected. Empty overrides inherit defaults, and requested override provenance remains in the request/response. Task occurrences, UTC cutoff/departure, reserve and mission budget are editable. The two documented synthetic scenarios are explicit choices; there is no scenario-discovery endpoint. Unsupported scientific effects/preferences have explanations instead of active controls.

Cards expose separate assessment/search states, elapsed/reserved totals, leg/task/reserve durations, mission and participant budgets, separate daylight checks, structured reasons and missing evidence. Exact zero and negative margins are preserved; unavailable metrics are not coerced to zero. Evidence/assumption/version details preserve the actual returned metadata. Results survive ES/EN changes without replay or recalculation.

Verification: five focused checks passed against the real running HTTP service, including all requested arithmetic cases, six-member and zero-robot selections, all allowlisted overrides, same-cell geometry and intentionally incomplete/null payload validation. Typecheck/build passed. Through the running frontend and service, browser verification passed baseline 800/2600, task +1 801/2601, rover -1, exact daylight 0, missing-daylight insufficient evidence and ES/EN preservation. Input edits removed cards immediately.

## Delivery C: metric preview and regressions

The returned outbound and return `xy_m` vertices are rendered with equal x/y scale in a labeled local metric SVG preview. Outbound is solid cyan; return is dashed orange, including coincident legs. Same-cell legs are points. Empty/unavailable legs are not drawn. Resolved cell centres and exact returned coordinates are inspectable. This module has no Cesium import or geographic conversion. No synthetic route is placed on Gale.

Cesium scene setup, camera implementation, panorama data/markers/viewer and layer controls remain in place. The panorama-only +71.2 m visual offset remains in the unchanged panorama module; it never enters a planning request, analytical elevation or movement calculation. Geographic visual POI clicks now explain that the draft accepts registered service locations. Panorama clicks still open optical observations. Scene-dependent buttons stay disabled until their handlers are ready. Sources distinguish synthetic calculation from historical/visual Gale references; obsolete fallback/Apollo-default entries are no longer advertised as active inputs.

### Verification on the running frontend and service

| Case | Observed result |
| --- | --- |
| Baseline | `viable_model`; 800 s activity, 2600 s including reserve |
| Task 601 s | 801 / 2601 s |
| Support rover limit 2599 s | `incompatible`; rover margin -1 s, mission margin +19000 s |
| Departure 2025-10-25T12:38:20Z | Daylight reserved return margin exactly 0 s |
| Missing-daylight scenario | `insufficient_evidence`; both daylight margins unavailable and two missing-evidence checks |
| Actual Python service stopped | Visible connection error; zero result cards; explicit recalculation recovered after restart |
| ES/EN | All calculated metric values and SVG vertex geometry preserved |
| Edit while response held, then revert edit | Late calculated result discarded; no current card |
| Newer submit finishes before held older response | 801/2601 s remains after older 800/2600 s is released |
| Full roster / no robots | Six and four participant result rows respectively |
| Same-cell registered destination | 0 s outbound; two leg points and no polylines |
| Metric preview and source button | Actual local geometry shown; synthetic engine provenance opens/closes |

Eight focused frontend checks pass, including actual loopback calculations, roster/override echo, nullable/inconclusive payloads, finite nested values, transport errors and metric rendering. The final check generates actual HTTP no-return and interrupted-search responses using the existing service test infrastructure; leg reasons are preserved as nullable strings, while check reasons remain structured objects. The existing 21 Python HTTP adapter/regression tests pass. Frontend typecheck includes the component harness; production build passes both without a token and with a nonsecret placeholder to exercise the complete Cesium bundle. Vite reports the existing large Cesium chunk warning; this delivery does not introduce a bundling redesign.

### Component verification and remaining browser gap

`app/tests/browser.html` loads the production panorama, layer, provenance and camera modules in a real, token-free Cesium viewer. Verified: 12 markers; visibility toggles; actual NASA Mastcam image loaded; panorama open/close; source panel; 71.2 m visual marker offset; camera reset wiring and the existing pinch-only Cesium zoom configuration. A wheel gesture without terrain did not establish terrain-clearance behavior.

**Unverified:** the full application's streamed Gale tileset, optional generated HiRISE layer, marker picking/terrain registration, visual quality presets and camera clearance against real terrain. No `app/.env`/Cesium ion token was available. The harness verifies components and does not replace this final real-scene check. Use a valid token and the existing real-scene controls before the presentation.

### Reproduce regression tooling

Normal launch and form edits are in [app/README.md](../../app/README.md). With the real service on port 8000, run:

```sh
cd app
npm run typecheck
npm run build
npm run test:mission
```

For actual HTTP frontend checks, set `SERVICE_TEST_URL=http://127.0.0.1:8000` before `npm run test:mission` (PowerShell: `$env:SERVICE_TEST_URL = 'http://127.0.0.1:8000'`). Without that variable, the live-service cases are explicitly skipped. Set `P2_TEST_PYTHON` to a Python interpreter with the engine dependencies for the additional calculated HTTP edge-case check (PowerShell: `$env:P2_TEST_PYTHON = 'C:\Users\Usuario\anaconda3\python.exe'`). That check is explicitly skipped when the interpreter is not configured. Python checks from the root:

```sh
python -m unittest service.tests.test_http service.tests.test_http_regression -q
```

Open `http://127.0.0.1:5173/tests/browser.html?lang=en` for the development-only component harness. It is not a production build entry.

For deterministic late deliveries, run `python app/tests/delay_proxy.py` from the root, then a second Vite instance with `VITE_SERVICE_URL=http://127.0.0.1:8002` on port 5174. In PowerShell:

```powershell
$env:VITE_SERVICE_URL = 'http://127.0.0.1:8002'
cd app
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

Call `http://127.0.0.1:8002/__test/hold` with `Invoke-RestMethod` or curl; submit in the port-5174 browser; `/__test/status` must show `waiting: 1`. Edit/revert or submit a newer request, then call `/__test/release` within 25 seconds. This loopback-only test proxy forwards real calculations and holds only their delivery. It rewrites the test origin to the service's configured origin and is not a deployment/CORS solution. Stop it after testing. Service computation is never cancelled by the frontend's 30 s timeout or an input edit.

## Dependencies for real Gale routing

1. A reviewed service-registered real analytical parcel: DTM/grid transform and cell-centre convention, coverage/exclusion masks, aggregation and slope versions, and validated origin/destination registrations.
2. An agreed analytical-to-geographic and display adapter, including Mars CRS/longitude/latitude conventions and measured horizontal/vertical registration. Neither the synthetic metric origin nor the panorama visual offset supplies this transform.
3. Reviewed solar normalization and historical availability/revision policy for a real scenario, tied to its evaluation location and as-of cutoff. The assumed UTC/physical-second fixture mapping is not a Mars clock or real daylight model.
4. P1/P2/P3 review of the explicit draft before any shared-contract version migration or production hosting. HTTP/CORS configuration and a valid Cesium ion token are still required for the complete scene.

No backend code, shared contract, P3 model, scientific penalty, communication search or unrelated engine behavior changed. The pre-existing untracked `docs/FLUJO_TRABAJO_EQUIPO.md` was preserved unchanged. Stop here for review; do not merge automatically.
