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

## Review boundary

Stop after A-C for owner/P1/P3 review. Do not merge or begin scene picking, extra optimization,
communication, weather effects or simulation. Original assignment: [implementation handoff](P1_P2_GALE_ROUTING_IMPLEMENTATION.md).
