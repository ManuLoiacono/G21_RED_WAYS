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

P1's corresponding service setting is `VITE_SERVICE_URL=http://127.0.0.1:8001`. The app still needs a separately reviewed draft consumer. Changing its service URL alone does not migrate v0.

Origins must be exact `http://localhost:PORT` or `http://127.0.0.1:PORT`, without trailing slash. Unconfigured browser origins receive HTTP 403 without an allow-origin header. Local CLI clients need no `Origin`. Responses, including errors for configured origins, carry `Access-Control-Allow-Origin`, `Vary: Origin` and `Cache-Control: no-store`. No credentials are enabled.

## Delivery A routes

| Method and path | Result |
| --- | --- |
| `GET /health` | Adapter/draft versions, pending contract status, synthetic scope and registered parcel identities. Does not build a graph. |
| `GET /parcel?id=synthetic_metric_demo&version=v1` | Exact registered parcel metadata, metric cell-center transform, declared coverage/exclusion/aggregation policy, versions and POIs. No raster or graph/search arrays. |
| `GET /catalogs` | The exact JSON representation of central `export_catalogs()`, including the roster and four templates. No copied defaults. |
| `OPTIONS` on these paths | Allowed route method and `Content-Type`; configured browser origins only when supplied. |

Missing/duplicate/unknown query fields return 422; an unregistered metadata parcel/version returns 404. Unknown paths return 404 and wrong methods return 405. Errors have `{"error":{"code":"...","path":"...","message":"..."}}`. `/health` and `/catalogs` accept no query parameters. Paths are exact and have no trailing slash alias.

At this checkpoint `/plan` is not implemented; it is delivery B. The existing CLI `python -m service.example --case baseline` already calculates through the engine.

The application loads exactly one registry and creates exactly one reusable planner at startup. Metadata does not initialize graph/search arrays. The listener allows at most 16 concurrent connection handlers and a bounded socket backlog; additional connections can be closed before parsing. Each connection closes after one response and has a 10 s socket I/O timeout. This is a local development adapter, not a public production server. A socket timeout or disconnect does not cancel native SciPy work. Ctrl+C stops the listener and waits for active handlers.

## Delivery A verification

```sh
python -m unittest service.tests.test_http -v
python -m unittest discover -s service/tests -p 'test_*.py'
```

Real loopback tests cover metadata/catalog identity, no graph construction, exact version selection, local-origin preflight/errors and a separate-process CLI startup. Existing prepared-planner checks remain applicable.
