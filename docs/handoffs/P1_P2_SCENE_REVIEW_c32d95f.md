# P1/P2 scene integration review at c32d95f

Date: 2026-11-14.

Reviewed P1 source: `c32d95fcddf8879364c003f018ac88a5d1493970` from freshly fetched `origin/main` and `origin/p1/escena-gale`. Files were read through `git show`; no branch switch, merge, app change or live browser validation was performed. P2 increment 2 is still being implemented independently on `p2/mission-service`.

## Changes since the previous P1 review

- Optional parcel-specific HiRISE mesh generated from a DTM and RED orthoimage; Cesium Mars supplies regional context.
- Live ES/EN display through dictionary keys; code/comments are English. Existing v0 wire values remain unchanged until a reviewed migration.
- A new reported spatial registration between the DTM, Cesium scene and Curiosity waypoints. The integration thread inspected the implementation/documentation but did not reproduce those measurements.

## 1. Reference frames must be explicit

P1's `scripts/README.md`, `CLAUDE.md` and `build_hirise_tiles.py` now describe the following parcel-specific comparisons:

| Comparison | Reported relation | Scope |
| --- | --- | --- |
| DTM to Cesium scene | Script defaults add projected x/y shifts of -25 m / +35 m and a +56.2 m height offset. | Reported fit over 144 parcel points, approximately 0.9 m residual spread. |
| Curiosity waypoints relative to DTM | Approximately -43 m east / +33 m north; waypoint `elev_geoid` approximately DTM -17.9 m. | Reported comparison over 563 points. |
| Earlier Cesium versus waypoint height check | Approximately +71.2 m. | A different source comparison, not a universal DTM-to-scene correction. |

Do not replace or combine these offsets by assumption. They compare different products/locations and require reviewed transform definitions. Constant-offset invariance of route costs does not validate geographic registration.

The mesh generator already applies its x/y and height corrections to visual vertices and records `horizontal_shift_m`, `vertical_offset_m`, `bbox_lonlat_dtm` and display `bbox_lonlat` in generated metadata. `app/src/mission/routes.ts` currently passes incoming lon/lat directly to `Cartesian3.fromDegrees`; it does not apply this scene registration. Raw native-DTM route coordinates therefore need an explicit adapter before they can align with the shifted mesh.

Required integration agreement:

1. The engine remains in native analytical metric coordinates. Costs, slopes, visibility and antenna heights use that analytical reference; no scene offsets enter the graph.
2. Tag locations/geometries with frame ID and data/transform version. A lon/lat pair without a frame is insufficient to distinguish DTM-native, source waypoint and scene-picked coordinates.
3. Choose exactly one owner of analytical-to-display registration. P2 can retain native output and P1 apply a shared transform, or a service adapter can expose explicitly tagged display output. Never apply both.
4. Use the generator's actual coordinate convention: its x/y offsets are added before division by its declared planetary radius. Do not substitute an unrelated geographic/ECEF shift formula merely because the metadata calls the values east/north.
5. Map picks in the display frame need the inverse transform before analytical cell lookup. Preserve requested/effective positions and reject outside/missing/excluded cells without moving to a convenient neighbor.
6. Source POIs/Curiosity waypoints require their own source-to-analytical mapping; do not apply the DTM transform indiscriminately to every source.
7. A clamped polyline obtains visual height from the scene. Do not add a second vertical correction to its analytical heights. Markers/models need a defined visual-height strategy without double correction.
8. Review common coverage: the visual builder's default 0.03 by 0.03 degree window is roughly 1.8 by 1.8 km in the declared projection, not the 3 by 3 km synthetic performance benchmark. Terrain, imagery, masks, route domain and demo target must use the same prepared parcel/version.
9. Keep registrations parcel-specific, with source, residuals and validity extent. Do not generalize the current fit to all Gale.

## 2. Computed synthetic results must survive language changes

Current `main.ts` sets `lastResponseSimulated = simulated || response.fixture === true`. On language change it may replace result cards with `simulatedResponse(destination_poi)`. The result panel likewise treats `fixture: true` as proof that the engine did not calculate the response.

This is incompatible with the project owner's latest decision: the engine must calculate all planning results from reproducible synthetic or real inputs. A computed synthetic response must not be replaced with fixed cards or described as uncomputed. The current language-switch branch can also leave the displayed cards inconsistent with the previously drawn engine route.

Required behavior for the later P1 adapter:

- Separate calculation origin (`engine`) from dataset fixture status and assumed model parameters.
- Changing ES/EN redraws labels and explanations while preserving route geometry, metrics, input identity and selected alternative.
- Use stable reason codes and numeric parameters for translated UI explanations; keep a documented fallback message for unknown codes. A translation must not trigger another planning source.
- Remove the automatic static planning-response fallback from the integrated user flow. Service failure is an explicit error; synthetic mode still invokes the engine. Hard-coded fixtures may remain isolated test assets, not substitute mission calculations.

## 3. Existing v0 gaps remain

The current app still sends schema v0, a single profile, POI IDs and a local-clock string. Its response types expect complete outbound/return legs and numeric metrics. The P2 engine now supports multi-participant missions, absent legs/null totals, separate assessment/search state, normalized physical-second timelines and replay cutoff metadata.

P1/P2/P3 must review the increment-2 draft exchange or an explicit compatibility adapter. Do not rename legacy wire IDs solely to translate UI text; do not silently treat v0 as the new team-aware schema. Publish the catalog/templates centrally rather than keeping independent Python and TypeScript defaults.

Before integration, agree:

- Both leg status and optional geometry/metrics, including a same-cell result that does not need a multi-vertex line.
- Separate activity time, required reserve, participant margins and daylight margin. The engine's temporal `limiting_margin_s` is not by itself the full daylight-constrained return margin.
- Request identity/revision and invalidation for every calculation-relevant change, not only destination changes.
- Structural validation before drawing; the current validator checks only top-level status/reason/alternatives.
- Explicit historical scenario/clock and source availability; current-time weather defaults cannot stand in for the selected 2025 replay.
- English stable engine codes with P1-localized display text. No requirement to change source wire values without version agreement.

## 4. Visual delivery limitation

The new local mesh is optional and generated files are not versioned. Vite currently serves it during development via `/local-data`; the README explicitly says production builds do not yet include it. Verify the intended presentation/startup path on the demonstration machine. Missing mesh generation must not be confused with missing analytical data or a valid fully integrated terrain package.

## 5. First joint acceptance exercise

Use a dynamically calculated synthetic request through the engine, with a declared fixture geographic/display adapter or a reviewed real parcel adapter. Check base, destination and at least two intermediate control locations in both analytical and display frames.

Then verify a passing mission, a participant-limited mission, missing daylight and outbound without return. Confirm that changing team/tasks changes the calculated result as appropriate and changing language preserves that exact result. Finally verify a map-picked display point maps back to the intended analytical cell. Only then declare P1/P2 route display integration complete.

This review is documentation only. It does not change active increment-2 implementation or authorize an unreviewed merge. Share the findings with P1 and the P2 implementation session before enabling real geographic/display adapters.
