# Navigation extensions: delivery evidence and contract

Branch `p2/navigation-extensions` starts from fetched main `00559c4`.
The owner authorizes necessary integration in the existing mission wizard; the
previous whole-app freeze is superseded for these four deliveries.

## A: estimated geometric visibility

Explicit `options.visibility: true` evaluates route communication. Optional
`options.communication` supplies finite nonnegative `base_height_m` (default 5)
and `receiver_height_m` (default 2). These are scenario stipulations: one base
antenna and one co-located group receiver, independent of participant identities.
The normal fastest request does not require visibility preparation.
The numerical envelope limits antenna heights to 100000 m and terrain magnitudes
to 1e8 m; exceeding it returns a structured limitation, not a radio restriction.

The native GDAL 3.10.3 Wang raster scan (edge interpolation) operates on the complete
bounded analytical grid. It does not cast Python rays per destination. The method
uses unshifted ground, analytical resolution and local projected metric distances.
Curvature subtracts distance squared divided by twice the Mars source sphere radius
(3396190 m); refraction is zero. The parcel's documented EQC distortion remains.
This is a raster approximation, not subpixel terrain or measured radio performance.
See [GDAL's algorithm and curvature documentation](https://gdal.org/en/stable/programs/gdal_viewshed.html)
and [the stable C API](https://gdal.org/en/stable/api/gdal_alg.html#_CPPv420GDALViewshedGenerate16GDALRasterBandHPKcPKc12CSLConstListddddddddd15GDALViewshedModed16GDALProgressFuncPv22GDALViewshedOutputType12CSLConstList).

GDAL does not propagate input nodata itself. This adapter runs lower/upper terrain
bounds (missing cells filled at -/+1e9 m), retaining known occlusion from the lower
scan, known visibility from the upper scan and unknown for disagreement or missing
endpoints. It never turns an unexplained terrain gap into confirmed visibility.
Traversal exclusions do not remove observed terrain from the viewshed. One layer
is cached by terrain content, base cell, heights and method; changing these replaces it.
Cesium shifts and panorama elevation offsets never enter the calculation.

Physical exposure splits each edge's actual group duration equally between source
and target visibility states. Sequential tasks use the destination state. Longest
time without confirmed visibility carries across both legs and tasks, counting
occluded plus unknown time. Unused reserve contributes no exposure. No mission is
rejected solely for communication and no additive search enforces a longest-gap limit.

Verification commands: `python -m unittest service.tests.test_visibility` and the
existing engine/service regressions. Real-grid timing and later deliveries are
recorded in this document as they are completed. Delivery A measured the actual
2140369 cells / 2834284 directed edges: startup 1.076 s, first/warm fastest
1.658/0.177 s, first/warm visibility request 0.465/0.159 s, peak whole-process
RSS 347975680 bytes, response 49571 bytes. See the committed performance JSON.
The default route has 1718.737528 s of confirmed geometric visibility; terrain
elsewhere includes known occluded cells. This is not a statement of radio coverage.

Checks at delivery A: engine 40, service 86 including five new visibility/HTTP
checks, frontend 10 + external consumer 5, TypeScript and production build.
Consumer files sharing one planner must run with `--test-concurrency=1`:
an initial parallel-file run correctly received HTTP 409 busy responses. The
serial rerun is the acceptance run; no automatic retry hides busy behavior.

## B: distinct candidates and evaluated suggestions

`criterion: "fastest"` retains the baseline calculation. Explicit
`criterion: "comparison"` adds lower-positive-ascent and visibility-prioritized
optima. Each leg is searched independently on the original directed topology.
Primary Dijkstra uses ascent metres or source/target half-edge time without
confirmed visibility. A second Dijkstra uses physical seconds only on exactly
tight primary edges. Explicit zero primary edges remain present; positive travel
time breaks zero-score cycles. There is no arbitrary metre-to-second weighting.
The tight-edge test uses the same float64 additions as primary Dijkstra, with no
epsilon permitting a worse primary edge. Real elevations originate in float32.

Reconstruction always uses original movement weights. `search_cost_s` remains
physical time (the secondary search duration), never an ascent score. Typed
`optimization` fields record actual units, total positive ascent and hidden/unknown
time. Complete directed cell sequences deduplicate candidates, retaining all
associated criterion badges; at most three routes are returned. Default real
reference input produces one route with three badges. The committed
`gale-comparison.request.json` uses Morgan Vale, no robots and the control POI:
fastest/visibility activity 1208.300784 s, positive ascent 9.135193 m;
lower-ascent activity 1328.456994 s, positive ascent 8.109680 m.

Each candidate has independent complete budgets, checks, assessment and environment
target applicability. Top-level assessment refers to fastest only. A real target-end
test retains four eligible forecasts for fastest and excludes them for the longer
candidate crossing the boundary. No resource-constrained global optimum is claimed.
Selected cards drive the actual map paths, raw environmental evidence and focus action.

`POST /recommendations` accepts the same identified draft request. It evaluates up
to three deterministic departures/team configurations under one planner lock.
The cutoff, endpoints, tasks, reserve, mission budget and total payload stay fixed.
Removed payload is explicitly reassigned within capacities and checked through
`resolve_comparison`. Departures cannot precede cutoff or leave replay coverage.
Known incompatible results are rejected, and unresolved-evidence improvements
are explicitly not proven viable. Coverage is bounded, not exhaustive. The UI
shows proposed names, complete load allocation, departure and calculated deltas;
only "Apply these changes and recalculate" changes state and sends a fresh identity.
Edits invalidate pending recommendations, including edit/revert and newer responses.

Delivery B verification: 42 engine tests; 92 service tests; 17 live
frontend/consumer tests, no skips; TypeScript and production build. The exhaustive
tiny-grid reference has three genuinely distinct objectives and checks each directed
leg's optimum, physical seconds and zero-score ties. Real-grid benchmark:
comparison 1.777 s, distinct Morgan/control comparison 7.645 s, bounded suggestions
11.282 s; 123464-byte distinct response, 6725-byte suggestions, peak whole-process
RSS 774303744 bytes across all contexts under concurrent test load. These are
local measurements, not a performance guarantee or capability validation.
One full run exposed a Windows connection reset on oversized HTTP input. The
adapter now drains at most MAX_BODY_BYTES + 1 bytes with a short timeout before
rejecting a small overflow, preserving the strict body cap and the 413 response.
The focused protocol regression and subsequent full suite are the acceptance checks.
Install `service/requirements.txt` for the navigation runtime; it preserves the
engine NumPy/SciPy pins and supplies GDAL through rasterio's official wheel.

## C: complete-sortie reachable area

`POST /reachable-area` accepts the same identified draft and returns
`p2-reachable-area-1`. It explicitly uses the two fastest physical-time base
searches, regardless of comparison preference. Blocked vector evaluation checks
outbound + sequential tasks + return + reserve against the mission limit, every
participant limit, departure daylight and reserved-return daylight at the actual
base under existing scenario semantics. Communication does not shrink this area.
No route is reconstructed per cell; the ordinary selected destination is evaluated
once while establishing the existing validated context. Task/budget changes reuse
the graph and source arrays. Incomplete searches never produce feasible cells.

The complete analytical grid is retained, with exact center/spacing/row transform,
parcel/solar/team/mission applicability identity, request echo and counts. Status
codes distinguish missing coverage (0), inadmissible (1), no directed round trip
(2), mandatory time/daylight failure (3), movement/time-only with missing daylight
(4), fully assessed model feasibility (5), and inconclusive search (6).
Encoding is base64, two unsigned 4-bit codes per byte, first cell in the low nibble,
row-major, zero unused final nibble. No expanded million-element JSON or truncation.
The existing 2 MiB response cap remains in force.

The results control explicitly calculates/toggles the area. A separate Cesium
source has its own layer switch and legend. It checks registration before drawing.
Only homogeneous 8-cell blocks of status 4 or 5 are drawn, inset one analytical
cell; original grid texture coordinates handle partial final blocks without
stretching. This conservative display can omit narrow feasible corridors but cannot
paint across blocked/unknown cells. Green is modeled full feasibility; amber is
only movement/time feasibility with essential evidence missing. Other states are
transparent. Synthetic domains retain counts without pretending to register on Gale.
Edits, edit/revert, newer plans and cancellation invalidate pending area responses.

Delivery C: 46 engine tests, 94 service tests, 18 live frontend/consumer tests with
no skips, TypeScript and build passed. Independent cell-by-cell mission checks,
equality/+1 s, directed no-return, barrier/nodata, monotonicity and compact padding
checks pass. On the real reference request: all 2140369 cells serialized in
1430898 bytes; 136696 fully assessed cells, 1643808 inadmissible and 359865 without
a complete directed sortie. Cached area 0.196 s, warm 0.208 s, task-edit reevaluation
0.193 s, with graph/base searches reused. Current whole-run high-water RSS is
776642560 bytes. See performance JSON for individual steps and output sizes.
