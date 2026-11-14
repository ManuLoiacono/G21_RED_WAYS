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
