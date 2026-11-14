# Local HTTP adapter: unaccepted development draft

Adapter version: `p2-http-local-1`. Planning schema: `p2-plan-draft-1`, with consumer review pending. This is a local synthetic development service, not shared v1 or real Gale integration. The adapter uses Python's standard library; there are no additional dependencies beyond the pinned `engine/requirements.txt`.

## Launch from the repository root

Use Python 3.10-3.12 with NumPy 1.26.4 and SciPy 1.11.4. With an activated environment:

```sh
python -m pip install -r engine/requirements.txt
python -m service
```

This binds IPv4 loopback `127.0.0.1:8000` (also accessible through an IPv4 `localhost`). `--host localhost` is an alias for the same IPv4 binding. Other addresses and IPv6 are unsupported. Run one service process; do not launch additional planning workers that duplicate graph memory.

The verified existing Windows runtime is Python 3.11.7 at `C:\Users\Usuario\anaconda3\python.exe`. The default Windows Store `python` on that machine has no SciPy. In PowerShell, select the working interpreter explicitly:

```powershell
& 'C:\Users\Usuario\anaconda3\python.exe' -m service
```

The default browser origins are exactly `http://localhost:5173` and `http://127.0.0.1:5173`. Repeated `--allow-origin` flags replace that list. For a Vite instance on port 5174 and an alternate service port:

```sh
python -m service --port 8001 --allow-origin http://localhost:5174 --allow-origin http://127.0.0.1:5174
```

P1's corresponding service setting is `VITE_SERVICE_URL=http://127.0.0.1:8001`. The feature branch `p1/http-mission-integration` explicitly consumes the draft; see its [integration handoff](../docs/handoffs/P1_P2_FRONTEND_INTEGRATION.md) and [frontend run instructions](../app/README.md). Changing the URL in an older v0 frontend alone does not migrate its schema.

Origins must be exact `http://localhost:PORT` or `http://127.0.0.1:PORT`, without trailing slash. Unconfigured browser origins receive HTTP 403 without an allow-origin header. Local CLI clients need no `Origin`. Responses, including errors for configured origins, carry `Access-Control-Allow-Origin`, `Vary: Origin` and `Cache-Control: no-store`. No credentials are enabled.

## Supported routes

| Method and path | Result |
| --- | --- |
| `GET /health` | Adapter/draft versions, pending contract status, synthetic scope and registered parcel identities. Does not build a graph. |
| `GET /parcel?id=synthetic_metric_demo&version=v1` | Exact registered parcel metadata, metric cell-center transform, declared coverage/exclusion/aggregation policy, versions and POIs. No raster or graph/search arrays. |
| `GET /catalogs` | The exact JSON representation of central `export_catalogs()`, including the roster and four templates. No copied defaults. |
| `POST /plan` | Strict `p2-plan-draft-1` request to `loads_strict` and `plan_draft` on the application-owned planner. Calculated engine response only. |
| `OPTIONS` on these paths | Allowed route method (`POST` for `/plan`, `GET` for metadata) and `Content-Type`; configured browser origins only when supplied. |

Missing/duplicate/unknown query fields return 422; an unregistered metadata parcel/version returns 404. Unknown paths return 404 and wrong methods return 405. Errors have `{"error":{"code":"...","path":"...","message":"..."}}`. `/health` and `/catalogs` accept no query parameters. Paths are exact and have no trailing slash alias.

`POST /plan` accepts the complete [draft request](examples/request.example.json), unchanged from the [exchange documentation](EXCHANGE_DRAFT.md). Supply `Content-Type: application/json` (optionally `charset=utf-8`) and one decimal `Content-Length`. UTF-8 JSON is required. Chunked transfer, compression and other content types/parameters are unsupported. The service parses raw JSON with `loads_strict`; duplicate keys, nonfinite constants and overflowing exponents are HTTP 400. Client-supplied movement-leg durations or completed assessments are not accepted.

Every successful planning response comes from the engine. Repeated compatible requests reuse the same planner's movement while evaluating the mission again. Changing the baseline task from 600 to 601 seconds changes elapsed time from 800 to 801 seconds and reduces temporal/daylight margins by one second. Technical errors never return a successful or fixed plan. Local CLI clients may omit `Origin`.

## Status and resource boundaries

All errors use `{"error":{"code":"...","path":"...","message":"..."}}`; they have no planning alternatives. Planning payload semantics and nullability are the existing explicit draft.

| HTTP status | Meaning and representative codes |
| --- | --- |
| 200 | Completed calculated planning result, including `incompatible` and `insufficient_evidence`. An engine `search_inconclusive` also preserves its separate state with null unavailable metrics. Metadata and valid `OPTIONS` also use 200. |
| 400 | Malformed/nonfinite/duplicate JSON, invalid UTF-8, excess nesting (`json_depth_limit`), invalid/missing/duplicate length (`invalid_content_length`), short/timed-out body (`incomplete_body`), chunked encoding (`unsupported_transfer_encoding`) or unsupported preflight headers. |
| 403 | `origin_not_allowed`; no allow-origin header for unconfigured origins. |
| 404 | `unknown_endpoint` or exact metadata parcel/version not registered (`unknown_parcel`). |
| 405 | Wrong route method or unsupported requested preflight method. |
| 409 | `planner_busy`: one calculation is active. No job is queued. Retry explicitly when it finishes. |
| 413 | `body_size_limit`. Rejected before reading an oversized declared body. |
| 415 | `unsupported_content_type` or `unsupported_content_encoding`. |
| 422 | Invalid supported-draft fields/version, parcel/scenario/endpoint inputs, query fields or `task_limit`. Current v0 receives `unsupported_schema_version`. Unknown planning parcel/version is 422, unlike metadata lookup's 404. |
| 500 | Unexpected backend/reconstruction/serialization failure (`backend_failure`), internal movement-association failure (`stale_movement_context`) or complete-output bound (`geometry_size_limit`, `response_size_limit`). No success is published. |

| Technical limit | Value and behavior |
| --- | --- |
| Request body | At most 65,536 bytes of UTF-8 JSON. |
| JSON nesting | At most 32 object/array levels; checked before parsing. |
| Task occurrences | At most 64, including zero-duration tasks; excess is rejected, never dropped. |
| Geometry | At most 20,000 route vertices combined across outbound and return candidates; includes same-cell vertices. Grid cells and metric positions are returned in full or the response fails. |
| Serialized output | At most 2,097,152 bytes including the full response; checked before response headers. No geometry, participants, checks or echo fields are truncated. |

These are local resource bounds, not scientific or operational thresholds. Output checks bound publication, not native computation or peak process memory: the exchange/reconstruction can materialize a complete result before this wrapper checks it. The registered packages remain tiny synthetic inputs. Prepared inputs, caller-held route objects, temporary NumPy/SciPy allocations and exchange serialization are additional to the planner's one retained graph/base search.

## Clients in a second terminal

Keep the server running in the first terminal. From the same repository root and Python environment, use the portable standard-library HTTP client:

```sh
python -m service.client --case baseline
python -m service.client --case task_edit
python -m service.client --case participant_limit
python -m service.client --case exact_daylight
python -m service.client --case missing_daylight
python -m service.client --request service/examples/request.example.json
```

For the alternate service port, append `--url http://127.0.0.1:8001`. This client sends requests to `/plan`; it does not calculate a replacement or replay a response file. It prints the complete received finite JSON. Exit code 0 means HTTP 200 (which may be an incompatible/missing-evidence/inconclusive result); 1 means a structured HTTP error; 2 means connection, read, input-file or JSON failure. The default socket I/O timeout is 30 s, configurable with `--timeout`. It is not a server job deadline and does not cancel native work. There is no automatic retry.

PowerShell with the existing verified interpreter:

```powershell
& 'C:\Users\Usuario\anaconda3\python.exe' -m service.client --case baseline
Invoke-RestMethod 'http://127.0.0.1:8000/health'
Invoke-RestMethod 'http://127.0.0.1:8000/parcel?id=synthetic_metric_demo&version=v1'
Invoke-RestMethod 'http://127.0.0.1:8000/catalogs'
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:8000/plan' -ContentType 'application/json' -InFile 'service/examples/request.example.json'
```

On a POSIX shell with curl:

```sh
curl -sS http://127.0.0.1:8000/health
curl -sS 'http://127.0.0.1:8000/parcel?id=synthetic_metric_demo&version=v1'
curl -sS http://127.0.0.1:8000/catalogs
curl -sS -H 'Content-Type: application/json' --data-binary @service/examples/request.example.json http://127.0.0.1:8000/plan
curl -i -X OPTIONS -H 'Origin: http://localhost:5173' -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: Content-Type' http://127.0.0.1:8000/plan
```

`curl.exe` provides the same curl commands on Windows where installed; plain `curl` may be a PowerShell alias. If creating a new Python environment, avoid activation differences by using its interpreter directly: `.venv/Scripts/python.exe` on Windows or `.venv/bin/python` on POSIX, after `python -m venv .venv` and installing `engine/requirements.txt` with that interpreter.

## Consumer handoff and limits

The concise [P1 HTTP handoff](../docs/handoffs/P1_HTTP_API_INCREMENT3.md) identifies exact response paths, statuses and example values. The [frontend integration branch](../docs/handoffs/P1_P2_FRONTEND_INTEGRATION.md) adopts this draft explicitly, removes active static fallbacks and renders local metric geometry. This does not declare shared v1 acceptance or supply a real geographic adapter. All HTTP planning responses calculate through the existing engine.

Only service-owned synthetic metric parcels and the declared assumed UTC/physical-second mapping are enabled. No real/geographic/display adapter, accepted v1/v0 mapping, live NASA calls, forecast training, communication search, weather-speed/radiation model, simulated mission progression, cancellation or production hosting is provided. This increment stops for review here.

The application loads exactly one registry and creates exactly one reusable planner at startup. Metadata does not initialize graph/search arrays. The listener allows at most 16 concurrent connection handlers and a bounded socket backlog; additional connections can be closed before parsing. Each connection closes after one response and has a 10 s socket I/O timeout. This is a local development adapter, not a public production server. A socket timeout or disconnect does not cancel native SciPy work. Ctrl+C stops the listener and waits for active handlers.

## Verification

```sh
python -m unittest service.tests.test_http -v
python -m unittest service.tests.test_http_regression -v
python -m engine.tests.test_catalog
python -m engine.tests.test_team
python -m engine.tests.test_movement
python -m unittest discover -s engine/tests -p 'test_*.py'
python -m unittest discover -s service/tests -p 'test_*.py'
```

Real loopback tests cover metadata/catalog identity, no graph construction for metadata, exact versions, configured preflight/errors and separate-process CLI/client startup. Planning tests observe actual engine calls, movement reuse and changed-input arithmetic, participant failure, exact daylight equality, missing evidence, concurrent busy handling, backend/reconstruction/timeout failure and recovery, malformed/schema/body/task rejection and complete-output bounds. Regressions preserve request/revision, inconclusive/null states, calculated one-way/no-return and same-cell geometry, exact byte bounds, duplicate framing, stopped-service errors and continued busy state after disconnect. Existing prepared-planner checks remain applicable.
