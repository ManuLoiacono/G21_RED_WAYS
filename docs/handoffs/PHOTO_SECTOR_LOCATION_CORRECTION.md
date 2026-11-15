# Photo-sector location correction

PR #25 was merged as `63412fe`; this focused branch starts from that fetched main. The previous 400–730 m placement is rejected and superseded. Only location metadata, preparation definitions, identities, dependent examples/tests and acceptance evidence change.

## Placement

The sector is the convex footprint of all 12 actual registered positions in `panoramas.json` and `navcam_panoramas.json`, expressed in the common scene-horizontal EQC plane. It is not the analytical parcel or a radius around Nevado Sajama. Every selected native cell maps inside this footprint. All observed photo coordinates are unchanged.

| Stable ID | Old analytical lon, lat | New analytical lon, lat | Nearest registered marker | Scene-horizontal distance |
|---|---|---|---|---|
| base | 137.375101260029, -4.811074715231 | 137.381792221941, -4.813771582533 | Navcam sol 4861 | 2.714716 m |
| sample | 137.370048901034, -4.813498482046 | 137.381758084380, -4.812986418635 | Navcam sol 4851 | 47.272805 m |
| control | 137.371858191755, -4.810835752306 | 137.381860497062, -4.813669169850 | Navcam sol 4861 | 9.676406 m |
| lookout | 137.372677493214, -4.814044683019 | 137.381894634623, -4.813191243999 | Navcam sol 4861 | 37.608768 m |

Exact values, marker coordinates, all 12 exact-cell audits, nearest valid alternatives and route metrics are in `MISSION_DEMO_LOCATIONS.json`.

Photos render at their observed lon/lat without horizontal movement. To inspect the analytical cells under those registered markers, the existing scene registration is inverted once (+25 m east, -35 m north). Selected native coordinates render with the unchanged forward registration (-25/+35 m) once. No panorama height offset enters this calculation. Thus native latitude need not fall in the raw scene-coordinate latitude range; membership is tested after bringing both into the same frame.

## Constraint evidence and choice

All 12 exact photo cells have analytical coverage, but their native-block maximum slopes are 10.064–50.069 degrees, above the unchanged default rover's 8-degree limit. Nearby valid cells exist, but the nearest cells at individual markers belong to disconnected movement components. The audit records those closest individual options; they were not silently treated as mutually connected.

The selected cells lie in one 211-cell strongly connected component, with 68 cells inside the registered footprint. Base prioritizes immediate proximity to sol 4861; the other points provide distinct connected destinations in that same actual photo sector. The closest cell in this shared component toward sol 4851 is 47.273 m from that marker. Four different photo stops could not be used at their exact cells under the unchanged limits; this placement uses two associated photo stops rather than pretending otherwise. Another shared component approaches sols 4844/4851 at 23.73/35.27 m, but does not provide the selected immediate base proximity to sol 4861. No return to the distant previous region is made.

Photographs give approximate visual context from their actual capture positions. They do not represent the view from every point along the route, and do not validate hypothetical settlement suitability.

## Calculation and identities

All three default-team missions have found outbound and independent return routes and are `viable_model`:

| Destination | Activity including 600 s tasks | Comparison geometries |
|---|---:|---:|
| sample | 1216.689462 s | 1 |
| control | 657.543800 s | 1 |
| lookout | 1106.975712 s | 1 |

Each geometry carries the supported criterion labels after normal deduplication. Additional unchanged-profile teams are also covered by the focused location regression.

Package version advances to `native2-photo-v3`; content identity is recomputed. The existing `terrain.npz` is reused and the loader verifies all six unchanged array identities. No terrain, masks, exclusions, speeds, slope limits, routing criteria, corner rules or coordinate adapters change. The origin-derived default becomes `2025-10-26T00:26:33Z`; baseline/comparison examples use that departure and cutoff. Purpose-specific early/late/missing examples retain their timing semantics with the new package version.

## Actual verification

- 34 tests passed, zero skips (70.729 s): photo-sector membership/proximity/unique IDs and nine real round trips; Gale identity/coverage checks; comparison/deduplication; solar/default-origin behavior; service HTTP checks; analytical preparation checks.
- The shorter comparison paths required the validity-boundary regression to use their actual half-duration gap rather than a fixed 60 s offset. RAD and REMS validity boundaries differ, so the assertion verifies fewer eligible records for the longer candidate rather than assuming all four forecasts expire simultaneously. Both candidate interval and incompatibility assertions remain.
- Browser: inspected all four mission labels together with Navcam sols 4861/4851/4844, then calculated the new default Sample route, inspected its deduplicated criterion labels and displayed it on the map. Screenshots: `docs/evidence/photo-sector-markers.png`, `docs/evidence/photo-sector-route.png`.
- Frontend typecheck/build were not repeated: tracked `app/` is unchanged (tree `1f07c2a14b093d6c78373e6d73a01ebae0e5e3cd`). `engine/` is also unchanged (tree `faae001b3381711ae1ef569906b6a1f417c6b6b6`). Photographs and panorama/camera code are untouched.
- `git diff --check` passed. Latest main was fetched again before publication.

## Local inspection

From `C:/Users/Usuario/Desktop/Nasa Challenge/G21_PHOTO_SECTOR_CORRECTION`, the existing verified Python runtime is reused:

```powershell
& ../G21_MISSION_DEMO_POLISH/.venv/Scripts/python.exe -m service --port 8009 --allow-origin http://127.0.0.1:5179 --gale-package data/processed/gale/analytical/manifest.json
```

In another terminal:

```powershell
$env:VITE_SERVICE_URL='http://127.0.0.1:8009'
& ../G21_MISSION_DEMO_POLISH/.venv/Scripts/python.exe -m scripts.run_frontend --node (Get-Command node.exe).Source --port 5179 --token-env-file '../G21_RED_WAYS/app/.env'
```

Open `http://127.0.0.1:5179/?lang=en`. On Mission step inspect the four labels alongside the observed photo markers; calculate each destination and inspect normal comparison deduplication. No merge or deployment is performed. Private settings, generated source assets and `docs/FLUJO_TRABAJO_EQUIPO.md` are preserved.
