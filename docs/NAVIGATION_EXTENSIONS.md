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
