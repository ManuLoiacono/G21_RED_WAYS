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

Deliveries B (configuration/results) and C (metric preview/regression verification) follow on this branch before review. Do not merge automatically.
