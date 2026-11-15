> Location correction: the original distant placement below is superseded by [PHOTO_SECTOR_LOCATION_CORRECTION.md](PHOTO_SECTOR_LOCATION_CORRECTION.md) and the current MISSION_DEMO_LOCATIONS.json. Other delivered behavior remains unchanged.

# Mission demo polish delivery

Branch: `p2/mission-demo-polish`. Started from fetched main `1bf5b4a` (including libexpat1). No production deployment or PR merge is authorized/performed.

## Deliveries and commits

1. `69bd675`: relocated hypothetical base and three destinations to a 7,946-cell strongly connected region of the unchanged default-team directed graph near the rover photo sector. Exact analytical lon/lat, scene-frame distances to the unchanged Nevado Sajama photo marker, route timings and criteria are in `MISSION_DEMO_LOCATIONS.json`. The base is 402.61 m from that marker after scene registration; destinations are 582.43–734.26 m away. The default mission's straight-line base–Sample separation is approximately 332 m. Photo coordinates, terrain, coverage, exclusions and corner restrictions are unchanged.
2. `87cb322`: segmented duration controls reject letters/signs/decimals and malformed paste; minutes are constrained to 00–59; hours retain the existing UI range 00–99. Editing one segment preserves existing sub-minute seconds; rendering and translation do not rewrite seconds. Names use trimmed, whitespace-normalized, case-insensitive comparison; unique generated names, inline bilingual errors, calculation prevention and a service boundary invariant retain separate stable IDs. Optional `name` is additive; legacy templates remain valid.
3. `8712c33`: initial and repeated Calculate requests use comparison, including recommendation application. Real geometry deduplication remains intact. Cards prioritize activity time, round-trip distance, ascent and temporal/daylight margins; total-with-reserve remains distinct in the timeline/details. The selection border and map wiring are retained. Redundant comparison action is removed.
4. `c7cfc76`: simulation consumes only the selected alternative's decision-safe planning snapshot. Forecasts are filtered by their validity at simulated UTC; observations stay historical and cannot appear if absent from the planning snapshot. Daily minimum/maximum temperatures are not interpolated into an hourly curve. Pressure and RAD retain units, classification, validity and horizon tooltips. A small illustrative clock pulse accompanies context; it represents no spatial weather or hazard and honors reduced motion. Pause/restart/edit state reuse the existing tracking lifecycle.

A final integration commit advances the location metadata version to `native2-photo-v2`, updates examples and labels, records evidence and uses the origin-derived `2025-10-26T00:26:35Z` default. The seven-second sunrise change is derived from the relocated origin; availability/cutoff rules are unchanged. The terrain archive was reused and all six array identities verified by the real loader, with no terrain regeneration. Preparation reproduces the new POI metadata with the existing factor-2 input.

## Assumptions

No profile assumptions changed. Ascent/descent degrees remain Avery 14/14, Morgan 15/15, Riley 13/13, Jordan 16/16, Light Support Rover 8/8 and Transport Rover 10/10. These are centralized hypothetical catalog assumptions, not physical validation. Default team is Avery plus Light Support Rover. Real-grid tests additionally cover Morgan alone and Riley plus Transport Rover for all three destinations (nine round trips).

Analytical coordinates use the existing spherical EQC frame (R=3,396,190 m). Scene-only registration is -25 m east/+35 m north. Panorama height correction is independent and is not used in route selection or horizontal distances. Hypothetical locations do not establish settlement suitability.

## Actual checks

- Full service suite: 105 passed, zero skips (83.090 s); additional photo-location test: 1 passed, covering nine actual round trips (57.932 s), repeated in the isolated runtime after adding the absent-archive skip guard: passed with zero skips (61.242 s).
- Full engine suite: 51 passed (0.449 s).
- Frontend/real HTTP suite: 18 passed, zero skips (75.502 s), including comparison, deduplication, recommendation payload conservation, reachable area, request revisions, stale rejection, rendering, duration paste guard and daily simulation filtering.
- TypeScript typecheck passed. Final production build passed: 1,691 modules in 88 s; existing large-bundle warning remains (main 5,278.16 kB before gzip).
- Prepared environment identity `1f83d1f813855d410bf42e4592364abdca741be5a5fc512c803d5c965eb4fb6d` and material identity `87bbb585a10988d2db5cc12ef3e6b97aa1c36634cd0c255734075a6f2fafa2df` loaded successfully. All forecast files have LF bytes. New manifest identity is verified by the real loader. The installed isolated runtime also served an actual HTTP `/plan` comparison successfully (two alternatives, viable in the model).
- An initial comparison regression still targeted Control and expected two paths; it was updated to Sample, where the engine produces distinct geometries. An initial reachability/HTTP run exposed stale example departure times; examples now use the new origin-derived sunrise. Final reruns above passed.
- Browser: first default calculation produced two routes; selected the lower-ascent route and verified tracking legs; tested pause/restart, bilingual daily context, rejected letter paste, unique task creation and inline duplicate rejection, edit clearing/recalculation, and explicit service-unreachable handling after stopping the service. All three destinations were exercised. No fabricated fallback was displayed.
- Deployment boundary: retained libexpat1, existing analytical/material/environment COPY and allowlist paths. New simulation modules/CSS are bundled with the frontend. Docker is unavailable on this host, so Linux container build and in-image comparison `/plan` remain unverified; no deployment success is claimed. LF identities were checked locally.

## Local launch (PowerShell, separate terminals)

Dependencies are installed in the isolated worktree's `.venv`; Node packages are reused via a local junction. No private settings were copied or modified.

```powershell
Set-Location 'C:\Users\Usuario\Desktop\Nasa Challenge\G21_MISSION_DEMO_POLISH'
& .\.venv\Scripts\python.exe -m service --port 8007 --allow-origin http://127.0.0.1:5177 --gale-package data/processed/gale/analytical/manifest.json
```

```powershell
Set-Location 'C:\Users\Usuario\Desktop\Nasa Challenge\G21_MISSION_DEMO_POLISH'
$env:VITE_SERVICE_URL='http://127.0.0.1:8007'
& .\.venv\Scripts\python.exe -m scripts.run_frontend --node (Get-Command node.exe).Source --port 5177 --token-env-file '../G21_RED_WAYS/app/.env'
```

Open `http://127.0.0.1:5177/?lang=en`.

## Manual acceptance

1. Select Sample, Control and Lookout; calculate each and compare the hypothetical markers to the unchanged photo sector. Inspect actual deduplicated criterion labels and route selection/map synchronization in ES/EN.
2. Edit reserve/budget segments; try invalid text/paste and repeated task names with case/whitespace changes. Correct the names and recalculate; verify no obsolete result survives.
3. Simulate, pause, resume and restart. Expand daily context and inspect validity/quantile tooltips. Edit the mission and verify simulation context clears. Stop/restart the service and verify an explicit error followed by successful retry.

## Remaining limitations

No implementation blocker is known. The optional elevation-profile grid is not built in this isolated checkout, so profile plotting and exhaustive panorama/POV camera review were not verified here. Original panorama data and camera code remain unchanged. Daily evidence does not establish hourly conditions; the pulse is illustrative. Container behavior requires verification on a host with Docker.

Unrelated work, generated source assets, private settings and `docs/FLUJO_TRABAJO_EQUIPO.md` were preserved.
