# Prepared planning service modules (draft, no HTTP)

Increment 2 provides framework-independent inputs for the later local service. Shared v0 `contracts/` and `app/` remain unchanged. Nothing here serves HTTP or calls live APIs.

## Registered packages and adapters (delivery A)

`fixture_registry()` loads only the service-owned [synthetic package](fixtures/synthetic_demo.json). Planning selects registered parcel/scenario IDs and exact versions, never a filename, URL or arbitrary georeference. Frozen packages contain read-only `MetricGrid` snapshots, POIs, reference/mask/slope metadata, record metadata and a content digest. Package ingestion is trusted startup work, separate from untrusted requests.

Only `synthetic_metric_v1` coordinates and `synthetic_utc_seconds_v1` clocks are enabled. Real adapters remain unavailable until P3 confirms CRS/planetary convention, cell-center transform, row/column order, boolean masks, conservative coverage/exclusions/slope aggregation, location and solar/time conversion. Geographic conversion is unavailable; no fake lon/lat or Cesium display offset is used.

`resolve_location(parcel, tagged_location)` accepts `{"type":"poi","poi_id":"sample"}` or `{"type":"coordinate","frame":"parcel_metric","xy_m":[31,1]}`. Both use the containing cell and identical coverage/exclusion checks. Cell footprints in increasing index coordinates are `[-0.5, n-0.5)`; an internal border belongs to the higher index. With decreasing-y rows, upper/left outer borders are included and lower/right excluded. No tolerance or search for a passable neighbor is used. Requested location, resolved cell and effective center are retained; containment never snaps across obstacles.

The fixture is a 3 x 3 flat metric grid with 30 m spacing, a missing cell and an excluded cell. It is not a P3 parcel or Gale geography. A 2,250,000-cell ingestion cap is a resource bound, not a scientific threshold or production memory claim. The registry retains small prepared inputs; graph/search retention is bounded separately in delivery B.

The assumed fixture clock assigns offset 100 s to `2025-10-25T12:00:00Z`; elapsed UTC seconds advance physical seconds one-for-one within a declared UTC interval. This is not a Mars-clock conversion or inferred sol length. Daylight must match its epoch, location and physical-second units. Fixture dates do not freeze the real replay start. Source location, spatial applicability, observation/issue/availability/fetch times and evidence classification are separate record fields.

Public boundary errors are `PlanningInputError(code, path, message)`. Run with Python 3.10-3.12 and `engine/requirements.txt` from the repository root:

```sh
python -m unittest service.tests.test_prepared -v
```

## As-of selection and bounded reuse (delivery B)

`select_scenario` gates each record on declared availability, forecast/alert issue time and complete observation interval. Forecast validity may extend beyond the decision instant. Verification records never enter decision inputs. Within a source/kind/series, the latest eligible issue time wins, then effective availability and revision. No accuracy/outcome is used. Unknown publication times are excluded under `exclude_unknown`; `reconstruct_declared` can use a separately supplied reconstructed time plus its explicit assumption, labeled retrospective reconstruction. Fetch time is never treated as historical availability. Missing required solar input becomes `daylight=None`; optional missing daily values remain missing context. Pressure/temperature and event records apply no movement rule.

The snapshot digest identifies the registered scenario content, normalized UTC decision cutoff, eligible record IDs and policy. It echoes the exact selected record metadata and assumptions. Fresh mission departure must be no earlier than the decision cutoff. Both instants require coverage in the declared fixture mapping; no opaque physical offset is equated to UTC without that mapping.

`PreparedPlanner(registry).plan(...)` resolves the team through the engine, canonicalizes participant order, searches prepared movement, then calls `evaluate_mission` every time. Movement context includes the parcel content/data/mask/slope versions, metric geometry, backend/SciPy/model/catalog versions, effective participant IDs/parameters/payloads and an empty applied-effects set. Changing tasks, budget, reserve, departure, cutoff or destination reuses movement when this context/base is unchanged; changing base replaces only the search; changed effective team/parcel configuration rebuilds both. Requested override provenance remains separate from effective parameters for later wire echo. Graph/team/search/base association is checked before reuse. No client-supplied durations or completed assessments are accepted.

Each planner retains at most one graph and one complete base search, clearing incompatible references before replacement. Inconclusive searches are not reused as completed results. Returned evaluations contain routes, not graph/search arrays. Prepared registry inputs, route explanation objects held by callers, and temporary NumPy/SciPy build/search memory are additional; this is not a process-memory cap. A nonblocking instance lock rejects concurrent work with `PlannerBusyError`; multiple planner instances would multiply retention, so the later service must own one. No timeout/cancellation is promised.

All planning results are calculated by the engine from prepared inputs. Synthetic input provenance is independent of calculation origin; no fixed planning-response fallback is present. Run:

```sh
python -m unittest discover -s service/tests -p 'test_*.py' -v
```
