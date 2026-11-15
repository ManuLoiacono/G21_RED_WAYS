"""Small loopback-only development adapter for the unaccepted planning draft."""

import argparse
from dataclasses import asdict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import logging
from threading import BoundedSemaphore
from urllib.parse import parse_qs, urlsplit

from .exchange import DRAFT_SCHEMA_VERSION, export_catalogs, plan_draft
from .planning import PlannerBusyError, PreparedPlanner
from .prepared import fixture_registry
from .validation import PlanningInputError, loads_strict


ADAPTER_VERSION = "p2-http-local-1"
DEFAULT_ORIGINS = ("http://localhost:5173", "http://127.0.0.1:5173")
ROUTES = {"/health": "GET", "/parcel": "GET", "/catalogs": "GET", "/plan": "POST"}
# Technical resource bounds, independent of scientific/operational thresholds.
MAX_BODY_BYTES = 65_536
MAX_TASKS = 64
MAX_JSON_DEPTH = 32
MAX_GEOMETRY_POINTS = 20_000  # Combined vertices in outbound and return legs.
MAX_RESPONSE_BYTES = 2_097_152
LOGGER = logging.getLogger(__name__)


class HTTPProblem(Exception):
    def __init__(self, status, code, path, message, *, headers=()):
        self.status = status
        self.headers = headers
        self.error = {"code": code, "path": path, "message": message}
        super().__init__(message)


def check_json_depth(raw):
    """Bound nesting before the recursive JSON parser; ignore brackets in strings."""
    depth, quoted, escaped = 0, False, False
    for char in raw:
        if quoted:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                quoted = False
        elif char == '"':
            quoted = True
        elif char in "[{":
            depth += 1
            if depth > MAX_JSON_DEPTH:
                raise HTTPProblem(400, "json_depth_limit", "json", "JSON nesting exceeds the technical limit.")
        elif char in "]}":
            depth -= 1


def encode_bounded(payload):
    """Verify the complete serialized response before sending a success header."""
    body = bytearray()
    for chunk in json.JSONEncoder(allow_nan=False, separators=(",", ":")).iterencode(payload):
        encoded = chunk.encode("utf-8")
        if len(body) + len(encoded) > MAX_RESPONSE_BYTES:
            raise HTTPProblem(500, "response_size_limit", "response", "Serialized output exceeds the technical limit; no plan was returned.")
        body.extend(encoded)
    return bytes(body)


def local_origin(value):
    """Allow explicit HTTP browser origins on the supported IPv4 loopback names."""
    try:
        parts = urlsplit(value)
        valid = (parts.scheme == "http" and parts.hostname in ("localhost", "127.0.0.1")
                 and parts.username is None and parts.password is None and not parts.path
                 and not parts.query and not parts.fragment and parts.port is not None
                 and 1 <= parts.port <= 65535 and value == f"http://{parts.hostname}:{parts.port}")
    except ValueError:
        valid = False
    if not valid:
        raise ValueError("Origin must be exactly http://localhost:PORT or http://127.0.0.1:PORT.")
    return value


class HTTPApplication:
    """One application owns one immutable registry and one reusable planner."""

    def __init__(self, *, allowed_origins=DEFAULT_ORIGINS, registry=None, default_parcel=None):
        self.allowed_origins = frozenset(local_origin(item) for item in allowed_origins)
        self.registry = fixture_registry() if registry is None else registry
        first = self.registry.parcels[0]
        self.default_parcel = (first.id, first.version) if default_parcel is None else default_parcel
        self.registry.parcel(*self.default_parcel)
        self.planner = PreparedPlanner(self.registry)

    def health(self):
        return {"status": "ok", "adapter_version": ADAPTER_VERSION,
                "schema_version": DRAFT_SCHEMA_VERSION, "contract_status": "consumer_review_pending",
                "scope": "local_terrain_development" if any(not p.grid.fixture for p in self.registry.parcels) else "local_synthetic_development",
                "geographic_conversion": "available" if any(p.geographic_adapter for p in self.registry.parcels) else "unavailable",
                "default_parcel": dict(zip(("id", "version"), self.default_parcel)),
                "registered_parcels": [{"id": p.id, "version": p.version, "fixture": p.grid.fixture}
                                       for p in self.registry.parcels]}

    def plan(self, payload):
        if (isinstance(payload, dict) and payload.get("schema_version") == DRAFT_SCHEMA_VERSION
                and isinstance(payload.get("mission"), dict)):
            tasks = payload["mission"].get("tasks")
            if isinstance(tasks, list) and len(tasks) > MAX_TASKS:
                raise HTTPProblem(422, "task_limit", "mission.tasks", "Task count exceeds the technical limit.")
        try:
            result = plan_draft(self.planner, payload)
        except PlannerBusyError as exc:
            raise HTTPProblem(409, "planner_busy", "planner", "One calculation is active; retry explicitly after it finishes.") from exc
        except PlanningInputError as exc:
            status = 500 if exc.code == "stale_movement_context" else 422
            raise HTTPProblem(status, exc.code, exc.path, str(exc)) from exc
        points = sum(len(candidate[leg]["cells"]) for candidate in result["alternatives"]
                     for leg in ("outbound", "return"))
        if points > MAX_GEOMETRY_POINTS:
            raise HTTPProblem(500, "geometry_size_limit", "alternatives", "Calculated geometry exceeds the technical limit; no plan was returned.")
        return result

    def parcel(self, query):
        try:
            params = parse_qs(query, keep_blank_values=True, strict_parsing=True, max_num_fields=2)
        except ValueError as exc:
            raise HTTPProblem(422, "invalid_query", "query", "Supply exactly one id and one version.") from exc
        if set(params) != {"id", "version"} or any(len(v) != 1 or not v[0] for v in params.values()):
            raise HTTPProblem(422, "invalid_query", "query", "Supply exactly one id and one version.")
        try:
            parcel = self.registry.parcel(params["id"][0], params["version"][0])
        except PlanningInputError as exc:
            raise HTTPProblem(404, exc.code, exc.path, str(exc)) from exc
        grid = parcel.grid
        scenarios = [s for s in self.registry.scenarios if (s.parcel_id, s.parcel_version) == (parcel.id, parcel.version)]
        scenario = scenarios[0] if scenarios else None
        return {"schema_version": DRAFT_SCHEMA_VERSION, "contract_status": "consumer_review_pending",
                "id": parcel.id, "version": parcel.version, "content_id": parcel.content_id,
                "fixture": grid.fixture, "evaluation_location_id": parcel.evaluation_location_id,
                "coordinate_frame": "parcel_metric", "coordinate_adapter": parcel.coordinate_adapter,
                "geographic_conversion": "available" if parcel.geographic_adapter else "unavailable",
                "geographic_adapter": parcel.geographic_adapter,
                "bounds_lonlat": loads_strict(parcel.metadata_json)["bounds_lonlat"] if parcel.metadata_json else None,
                "reference_description": parcel.reference_description,
                "scenarios": [{"id": s.id, "version": s.version, "fixture": s.fixture} for s in scenarios],
                "planning_defaults": {"origin_poi_id": "base", "destination_poi_id": "sample",
                                      "scenario": {"id": scenario.id, "version": scenario.version, "as_of_utc": scenario.clock.utc_epoch},
                                      "departure_utc": scenario.clock.utc_epoch} if scenario else None,
                "grid": {"shape": grid.shape, "spacing_m": grid.spacing_m,
                         "origin_center_xy_m": grid.origin_center_xy_m, "row_direction": grid.row_direction,
                         "data_version": grid.data_version, "aggregation_policy": grid.aggregation_policy},
                "masks": {"version": parcel.mask_version, "coverage_true": "analytical_coverage",
                          "excluded_true": "blocked", "covered_cells": int(grid.coverage.sum()),
                          "excluded_cells": int(grid.excluded.sum())},
                "slope_version": parcel.slope_version,
                "containment_policy": "half_open_cell_footprints_in_index_axes; no_neighbor_snapping",
                "pois": [asdict(poi) for poi in parcel.pois]}


class LocalHTTPServer(ThreadingHTTPServer):
    """Bound transport concurrency; all handlers share the application's planner."""

    daemon_threads = False
    request_queue_size = 16

    def __init__(self, application, host="127.0.0.1", port=8000):
        if host not in ("127.0.0.1", "localhost"):
            raise ValueError("Only IPv4 loopback binding is supported.")
        self.application = application
        self._connections = BoundedSemaphore(16)
        super().__init__(("127.0.0.1", port), RequestHandler)

    def process_request(self, request, client_address):
        if not self._connections.acquire(blocking=False):
            # Transport overload is closed before parsing, never queued as a plan.
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except BaseException:
            self._connections.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self._connections.release()


class RequestHandler(BaseHTTPRequestHandler):
    server_version = "P2LocalHTTP/1"
    sys_version = ""

    def setup(self):
        super().setup()
        self.connection.settimeout(10)

    def log_message(self, format, *args):
        # Do not log request bodies, queries or arbitrary client-supplied text.
        pass

    def _send_json(self, status, payload, *, extra_headers=()):
        body = encode_bounded(payload)
        self.close_connection = True
        try:
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("Connection", "close")
            self.send_header("Vary", "Origin")
            headers = getattr(self, "headers", None)
            origins = headers.get_all("Origin", []) if headers is not None else []
            if len(origins) == 1 and origins[0] in self.server.application.allowed_origins:
                self.send_header("Access-Control-Allow-Origin", origins[0])
            for name, value in extra_headers:
                self.send_header(name, value)
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)
        except OSError:
            # Only socket writes are ignored. Backend timeouts remain HTTP 500.
            # A lost client does not cancel native work or alter a result.
            return

    def send_error(self, code, message=None, explain=None):
        self._send_json(code, {"error": {"code": "http_error", "path": "http",
                                        "message": "HTTP request could not be processed."}})

    def _read_payload(self):
        if self.headers.get_all("Transfer-Encoding"):
            raise HTTPProblem(400, "unsupported_transfer_encoding", "headers.Transfer-Encoding", "Chunked requests are unsupported; send Content-Length.")
        if self.headers.get_all("Content-Encoding"):
            raise HTTPProblem(415, "unsupported_content_encoding", "headers.Content-Encoding", "Compressed request bodies are unsupported.")
        types = self.headers.get_all("Content-Type", [])
        params = self.headers.get_params() or []
        if (len(types) != 1 or self.headers.get_content_type() != "application/json"
                or any(name != "charset" or not isinstance(value, str) or value.lower() != "utf-8"
                       for name, value in params[1:])
                or len(params) > 2):
            raise HTTPProblem(415, "unsupported_content_type", "headers.Content-Type", "Send application/json with optional charset=utf-8.")
        lengths = self.headers.get_all("Content-Length", [])
        if len(lengths) != 1 or not lengths[0].isascii() or not lengths[0].isdecimal():
            raise HTTPProblem(400, "invalid_content_length", "headers.Content-Length", "One decimal Content-Length is required.")
        normalized = lengths[0].lstrip("0") or "0"
        maximum = str(MAX_BODY_BYTES)
        if len(normalized) > len(maximum) or (len(normalized) == len(maximum) and normalized > maximum):
            raise HTTPProblem(413, "body_size_limit", "body", "Request body exceeds the technical byte limit.")
        length = int(normalized)
        try:
            body = self.rfile.read(length)
        except TimeoutError as exc:
            raise HTTPProblem(400, "incomplete_body", "body", "Timed out while reading the declared body.") from exc
        if len(body) != length:
            raise HTTPProblem(400, "incomplete_body", "body", "Body is shorter than its declared Content-Length.")
        try:
            raw = body.decode("utf-8")
            check_json_depth(raw)
            return loads_strict(raw)
        except (PlanningInputError, UnicodeError, RecursionError) as exc:
            error = exc.as_dict() if isinstance(exc, PlanningInputError) else {
                "code": "invalid_json", "path": "json", "message": "Expected finite UTF-8 JSON within the nesting limit."}
            raise HTTPProblem(400, **error) from exc

    def _dispatch(self):
        try:
            origins = self.headers.get_all("Origin", [])
            if len(origins) > 1 or (origins and origins[0] not in self.server.application.allowed_origins):
                raise HTTPProblem(403, "origin_not_allowed", "headers.Origin", "Browser origin is not configured.")
            try:
                parts = urlsplit(self.path)
            except ValueError as exc:
                raise HTTPProblem(400, "invalid_target", "path", "Malformed request target.") from exc
            if parts.scheme or parts.netloc or parts.fragment or not self.path.startswith("/"):
                raise HTTPProblem(400, "invalid_target", "path", "Use a local absolute-path request target.")
            method = ROUTES.get(parts.path)
            if method is None:
                raise HTTPProblem(404, "unknown_endpoint", "path", "Endpoint is not supported.")
            if self.command == "OPTIONS":
                requested_method = self.headers.get("Access-Control-Request-Method")
                requested_headers = self.headers.get("Access-Control-Request-Headers", "")
                if requested_method and requested_method != method:
                    raise HTTPProblem(405, "method_not_allowed", "headers.Access-Control-Request-Method", "Method is not supported on this route.",
                                      headers=(("Allow", f"{method}, OPTIONS"),))
                if any(item.strip().lower() != "content-type" for item in requested_headers.split(",") if item.strip()):
                    raise HTTPProblem(400, "headers_not_allowed", "headers.Access-Control-Request-Headers", "Only Content-Type is allowed.")
                self._send_json(200, {"method": method}, extra_headers=(
                    ("Access-Control-Allow-Methods", f"{method}, OPTIONS"),
                    ("Access-Control-Allow-Headers", "Content-Type"),
                    ("Allow", f"{method}, OPTIONS")))
                return
            if self.command != method:
                raise HTTPProblem(405, "method_not_allowed", "method", "Method is not supported on this route.",
                                  headers=(("Allow", f"{method}, OPTIONS"),))
            if parts.path != "/parcel" and parts.query:
                raise HTTPProblem(422, "invalid_query", "query", "This route accepts no query parameters.")
            app = self.server.application
            if parts.path == "/health":
                payload = app.health()
            elif parts.path == "/catalogs":
                payload = export_catalogs()
            elif parts.path == "/plan":
                payload = app.plan(self._read_payload())
            else:
                payload = app.parcel(parts.query)
            self._send_json(200, payload)
        except HTTPProblem as exc:
            self._send_json(exc.status, {"error": exc.error}, extra_headers=exc.headers)
        except Exception:
            LOGGER.exception("HTTP adapter failed")
            self._send_json(500, {"error": {"code": "backend_failure", "path": "service",
                                           "message": "Technical service failure; no plan is available."}})

    do_GET = do_POST = do_OPTIONS = do_HEAD = do_PUT = do_DELETE = do_PATCH = _dispatch


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", choices=("127.0.0.1", "localhost"), default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--allow-origin", action="append", help="Repeat to replace the default browser origins.")
    parser.add_argument("--gale-package", help="Explicit trusted manifest path; register this exact Gale package and make it the UI default.")
    args = parser.parse_args(argv)
    if not 1 <= args.port <= 65535:
        parser.error("Port must be between 1 and 65535.")
    try:
        registry = None
        default_parcel = None
        if args.gale_package:
            from .gale import gale_registry
            registry = gale_registry(args.gale_package)
            real = registry.parcels[-1]
            default_parcel = (real.id, real.version)
        app = HTTPApplication(allowed_origins=DEFAULT_ORIGINS if args.allow_origin is None else args.allow_origin,
                              registry=registry, default_parcel=default_parcel)
    except ValueError as exc:
        parser.error(str(exc))
    logging.basicConfig(level=logging.INFO)
    with LocalHTTPServer(app, args.host, args.port) as server:
        print(f"P2 draft service at http://127.0.0.1:{server.server_port}; schema={DRAFT_SCHEMA_VERSION}; scope={app.health()['scope']}", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("Stopping listener; waiting for active handlers (no native cancellation).", flush=True)


if __name__ == "__main__":
    main()
