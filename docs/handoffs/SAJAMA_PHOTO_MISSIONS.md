# Missions from Nevado Sajama to Curiosity 360 stops

Supersedes the photo-sector placement of `native2-photo-v3` (PR #26). Goal: a base at the Nevado Sajama panorama and three destinations at Navcam 360 stops, with short, medium and long missions, so every destination has a real 360 image as reference.

## Why the slope limits changed

Around Nevado Sajama the HiRISE 1 m terrain is steep. From the closest usable base cell, the engine reaches:

| Team limit (most restrictive member) | Cells reachable both ways | Navcam stops reached (< 3 m) |
|---|---:|---|
| 8° (support rover, previous default) | 38 | none |
| 10–12° | 126–305 | 4818 |
| 14° (Avery) | 1,701 | 4818, 4834 |
| 15° (Morgan) | 135,970 | 4571, 4575, 4818, 4834, 4844, 4851, 4861 |

So the catalog now has two humans and one robot at 15° or more; slopes are unchanged real terrain:

| Profile | Before | Now |
|---|---|---|
| Morgan Vale (explorer_02) | 15° | 15° (unchanged) |
| Jordan Reed (explorer_04) | 16° | **17°** |
| Transport Rover (transport_rover) | 10° | **15°** |

Others keep their values (Avery 14°, Riley 13°, Light Support Rover 8°), so choosing them shows an honest "no route / incompatible" here. References: Mark III suit test at 30 % grade (~16.7°, Earth) for humans; Curiosity itself traversed these stops. These are scenario assumptions, not Mars operational limits. Catalog version string is unchanged (`synthetic-team-v1`).

## Points (`native2-photo-v4`)

| POI | Reference | Distance to marker | Default team out / back |
|---|---|---:|---:|
| base | Nevado Sajama (Mastcam, sols 4714–4741) | 46.2 m (closest connected valid cell) | — |
| sample | Navcam sol 4818 | 0.8 m | 9.3 / 8.9 min (short) |
| control | Navcam sol 4844 | 3.0 m | 15.9 / 16.6 min (medium) |
| lookout | Navcam sol 4571 | 0.8 m | 42.0 / 40.3 min (long) |

Sol 4587 was requested but is not reachable even at 15° (nearest connected cell 74 m away); sol 4571 replaces it as the long mission. Selection: same frame convention as PR #26 (scene registration inverted once, +25 m east / −35 m north; photo coordinates unchanged).

The manifest also declares `planning_team` (Morgan Vale + Transport Rover), exposed as `planning_defaults.team` by `GET /parcel`; the app uses it as the initial team (synthetic parcels keep the example team). Gale request examples now use version v4 and that team. Terrain arrays and all array identities are unchanged; only the manifest metadata (POIs, selection text, version, default team) and its content identity change.

## Verification

`service/tests/test_photo_locations.py`: points within 50 m (base) / 5 m (destinations) of their panoramas; round trips found and `viable_model` for Morgan + Transport Rover, Morgan alone and Jordan + Transport Rover; durations increase short → medium → long; the 8° rover does not connect.

Local note: prepared JSON under `data/processed/ml/forecasts` and `data/processed/gale/environment` must be checked out with LF (see `.gitattributes`); an older Windows checkout with CRLF fails with `forecast_identity_mismatch` until those files are re-checked out.
