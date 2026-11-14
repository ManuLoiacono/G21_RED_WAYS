# Gale routing delivery and review gate

Date: 2026-11-14. Branch: `p1/gale-routing-integration`.
Base: fetched `origin/main` at `fc0cc89`, containing frontend integration `7c7ba51`.
Implementation uses the isolated `G21_GALE_ROUTING` worktree. The original checkout and
untracked `docs/FLUJO_TRABAJO_EQUIPO.md` remain untouched. No P3 package or active P3 branch
was present after fetching; this delivery supplies the minimal reproducible preparation.

## A: legacy scene cleanup

Removed production fixture route/POI imports, entities, picking and highlight handlers.
Panorama modules, source controls, camera controls and calculated synthetic planning remain.
The synthetic mode explicitly explains unavailable geographic planning. The result identifies
one fastest calculated candidate; no additional criterion is implied.

Verification: TypeScript check and production build passed. The existing 21 HTTP checks
ran; one Windows loopback connection was aborted (WinError 10053). Its isolated rerun passed.
Real-terrain/panorama interaction is verified with delivery C, not claimed by this build.

## B: reproducible real analytical terrain and registration

Preparation commit: `2aaafc7` (pushed and verified). The generated archive stays outside Git;
the manifest records exact array identities and regeneration commands. Service registration
requires an explicit manifest path, verifies content/array hashes and bounds search grids.
No private `.env` was copied or changed. No delivered P3 analytical files were replaced.

The real case is [gale.request.json](../../service/examples/gale.request.json), with explorer_01
and support_rover, zero payload and unchanged catalog limits. Parcel `gale_hirise_019698`, version
`native2-v1`, content `89841fb7875d22c00dbd9f64fb3c8ee781fc7ddbbc38a386e833eb6d0da7291a`.
Grid: 1463 x 1463, 2.023493589 m cells, 2,140,369 covered cells, 496,561 traversable team cells,
2,834,284 directed edges. No scientific exclusion layer was delivered; all-false explicit
exclusions do not assert absence of rocks or hazards. The processing halo and maximum native
slope aggregation are recorded in the manifest. All raw heights remain unshifted.

Both directed searches found 62-vertex legs: outbound 149.416 m / 539.208 s / +10.655 m / -0.073 m;
return 149.416 m / 579.529 s / +0.073 m / -10.655 m. Matching geometry is a calculated result,
not an assumed reversed return. Full metrics and resolved locations are in the compact
[benchmark evidence](../evidence/gale-routing-benchmark.json). Load 1.555 s, graph build 4.087 s,
two source searches 0.610 s, reconstruction 0.047 s; process peak RSS 351,354,880 bytes.
Measurements use the existing benchmark's OS high-water method and include imports/native work.

The environment has no location-matched solar evidence: `insufficient_evidence`, required
`daylight` missing, no decision records. The existing assumed development clock and hypothetical
participant model stay explicitly labeled. Real terrain does not make them observations.

Verification: 3 focused preparation checks, all 62 service checks (including integrity/masks),
40 engine checks, 8 frontend checks against the running service, TypeScript and build passed.
Synthetic baseline 800/2600 s, task +1, rover -1, exact daylight boundary and missing daylight
semantics remain covered. Frontend parcel/scenario selection comes from exact service metadata.

## Review boundary

Stop after A-C for owner/P1/P3 review. Do not merge or begin scene picking, extra optimization,
communication, weather effects or simulation. Original assignment: [implementation handoff](P1_P2_GALE_ROUTING_IMPLEMENTATION.md).
