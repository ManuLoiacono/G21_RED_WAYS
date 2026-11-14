"""Real loopback HTTP checks for the local draft adapter."""

from contextlib import contextmanager
from http.client import HTTPConnection
import json
from pathlib import Path
import socket
import subprocess
import sys
from threading import Event, Thread
import unittest
from unittest.mock import patch

from engine import build_graph, evaluate_mission, search_from_base
from engine.routing import RouteReconstructionError
from service.example import example_requests
from service.exchange import export_catalogs
from service.http_server import HTTPApplication, LocalHTTPServer, MAX_BODY_BYTES, MAX_JSON_DEPTH, MAX_TASKS


@contextmanager
def serving(app=None):
    app = HTTPApplication() if app is None else app
    with LocalHTTPServer(app, port=0) as server:
        thread = Thread(target=server.serve_forever, kwargs={"poll_interval": 0.01})
        thread.start()
        try:
            yield server
        finally:
            server.shutdown()
            thread.join(timeout=5)


def request(server, method, path, body=None, headers=None):
    connection = HTTPConnection("127.0.0.1", server.server_port, timeout=5)
    try:
        connection.request(method, path, body=body, headers=headers or {})
        response = connection.getresponse()
        return response.status, dict(response.getheaders()), json.loads(response.read())
    finally:
        connection.close()


def post_plan(server, payload, *, origin="http://localhost:5173"):
    headers = {"Content-Type": "application/json"}
    if origin is not None:
        headers["Origin"] = origin
    return request(server, "POST", "/plan", json.dumps(payload).encode("utf-8"), headers)


class MetadataHTTPChecks(unittest.TestCase):
    def test_cli_launch_from_another_process(self):
        with socket.socket() as reservation:
            reservation.bind(("127.0.0.1", 0))
            port = reservation.getsockname()[1]
        process = subprocess.Popen([sys.executable, "-m", "service", "--port", str(port)],
                                   cwd=Path(__file__).resolve().parents[2], stdout=subprocess.PIPE,
                                   stderr=subprocess.STDOUT, text=True)
        try:
            startup = process.stdout.readline()
            self.assertIn(f"http://127.0.0.1:{port}", startup)
            connection = HTTPConnection("127.0.0.1", port, timeout=5)
            try:
                connection.request("GET", "/health")
                response = connection.getresponse()
                self.assertEqual(response.status, 200)
                self.assertEqual(json.loads(response.read())["schema_version"], "p2-plan-draft-1")
            finally:
                connection.close()
        finally:
            process.terminate()
            process.communicate(timeout=10)

    def test_health_metadata_and_catalogs_use_one_application_without_graph_build(self):
        app = HTTPApplication()
        planner = app.planner
        with patch("service.planning.build_graph") as build, serving(app) as server:
            for _ in range(2):
                status, _, health = request(server, "GET", "/health")
                self.assertEqual(status, 200)
                self.assertEqual(health["schema_version"], "p2-plan-draft-1")
                self.assertEqual(health["scope"], "local_synthetic_development")
                self.assertTrue(health["registered_parcels"][0]["fixture"])
                status, _, metadata = request(server, "GET", "/parcel?id=synthetic_metric_demo&version=v1")
                self.assertEqual(status, 200)
                self.assertEqual(metadata["grid"]["shape"], [3, 3])
                self.assertEqual(metadata["coordinate_adapter"], "synthetic_metric_v1")
                self.assertEqual(metadata["geographic_conversion"], "unavailable")
                self.assertEqual(metadata["pois"][0]["id"], "base")
                self.assertNotIn("elevation_m", metadata["grid"])
                status, _, catalogs = request(server, "GET", "/catalogs")
                self.assertEqual(status, 200)
                self.assertEqual(catalogs, json.loads(json.dumps(export_catalogs())))
            build.assert_not_called()
        self.assertIs(app.planner, planner)
        self.assertIs(planner.registry, app.registry)

    def test_exact_metadata_identity_queries_and_methods(self):
        with serving() as server:
            for path, expected in (("/parcel", 422), ("/parcel?id=synthetic_metric_demo", 422),
                                   ("/parcel?id=x&version=v1", 404), ("/parcel?id=synthetic_metric_demo&version=v2", 404),
                                   ("/parcel?id=x&id=y&version=v1", 422), ("/health?extra=1", 422), ("/missing", 404)):
                status, _, data = request(server, "GET", path)
                self.assertEqual(status, expected, path)
                self.assertEqual(set(data["error"]), {"code", "path", "message"})
            self.assertEqual(request(server, "POST", "/health")[0], 405)

    def test_configured_origins_preflight_success_and_errors(self):
        origin = "http://localhost:5174"
        app = HTTPApplication(allowed_origins=(origin,))
        with serving(app) as server:
            for path in ("/health", "/catalogs", "/parcel?id=synthetic_metric_demo&version=v1"):
                status, headers, _ = request(server, "OPTIONS", path, headers={"Origin": origin,
                    "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "content-type"})
                self.assertEqual(status, 200)
                self.assertEqual(headers["Access-Control-Allow-Origin"], origin)
                self.assertEqual(headers["Access-Control-Allow-Methods"], "GET, OPTIONS")
                self.assertEqual(headers["Access-Control-Allow-Headers"], "Content-Type")
            status, headers, _ = request(server, "GET", "/missing", headers={"Origin": origin})
            self.assertEqual(status, 404)
            self.assertEqual(headers["Access-Control-Allow-Origin"], origin)
            self.assertIn("Origin", headers["Vary"])
            status, headers, _ = request(server, "GET", "/health", headers={"Origin": "http://localhost:5173"})
            self.assertEqual(status, 403)
            self.assertNotIn("Access-Control-Allow-Origin", headers)
            self.assertEqual(request(server, "GET", "/health")[0], 200)
            self.assertEqual(request(server, "OPTIONS", "/health", headers={"Origin": origin,
                "Access-Control-Request-Method": "POST"})[0], 405)
            self.assertEqual(request(server, "OPTIONS", "/health", headers={"Origin": origin,
                "Access-Control-Request-Headers": "Authorization"})[0], 400)

    def test_nonlocal_binding_and_origin_configuration_are_rejected(self):
        app = HTTPApplication()
        with self.assertRaises(ValueError):
            LocalHTTPServer(app, host="0.0.0.0", port=0)
        for origin in ("*", "null", "https://example.com:5173", "http://localhost:5173/", "http://localhost:0"):
            with self.assertRaises(ValueError):
                HTTPApplication(allowed_origins=(origin,))


class PlanningHTTPChecks(unittest.TestCase):
    def test_repeated_http_calls_reuse_one_planner_and_recalculate_task_edits(self):
        app = HTTPApplication()
        planner = app.planner
        requests = example_requests()
        with serving(app) as server, patch("service.planning.build_graph", wraps=build_graph) as build, \
                patch("service.planning.search_from_base", wraps=search_from_base) as search, \
                patch("service.planning.evaluate_mission", wraps=evaluate_mission) as evaluate:
            status, headers, baseline = post_plan(server, requests["baseline"])
            self.assertEqual(status, 200)
            self.assertEqual(headers["Access-Control-Allow-Origin"], "http://localhost:5173")
            status, _, edited = post_plan(server, requests["task_edit"], origin=None)
            self.assertEqual(status, 200)
            self.assertEqual((build.call_count, search.call_count, evaluate.call_count), (1, 1, 2))
        self.assertIs(app.planner, planner)
        for name, result in (("baseline", baseline), ("task_edit", edited)):
            self.assertEqual(result["request_echo"], requests[name])
            self.assertEqual(result["calculation_origin"], "engine")
            self.assertTrue(result["input_provenance"]["fixture"])
            self.assertEqual(result["assessment"], "viable_model")
        metrics = baseline["alternatives"][0]["metrics"]
        changed = edited["alternatives"][0]["metrics"]
        self.assertEqual(metrics["elapsed_s"], 800)
        self.assertEqual(changed["elapsed_s"], 801)
        self.assertEqual(metrics["temporal_budget_limiting_margin_s"] - changed["temporal_budget_limiting_margin_s"], 1)
        self.assertEqual(metrics["daylight_reserved_return_margin_s"] - changed["daylight_reserved_return_margin_s"], 1)
        self.assertEqual(edited["movement_reuse"], {"graph": True, "base_search": True})

    def test_calculated_incompatible_missing_and_exact_daylight_remain_http_200(self):
        with serving() as server, patch("service.planning.evaluate_mission", wraps=evaluate_mission) as evaluate:
            for case, assessment, temporal, daylight in (("participant_limit", "incompatible", -1, 2300),
                    ("missing_daylight", "insufficient_evidence", 15400, None),
                    ("exact_daylight", "viable_model", 15400, 0)):
                status, _, response = post_plan(server, example_requests()[case])
                self.assertEqual(status, 200)
                self.assertEqual(response["assessment"], assessment)
                metrics = response["alternatives"][0]["metrics"]
                self.assertEqual(metrics["temporal_budget_limiting_margin_s"], temporal)
                self.assertEqual(metrics["daylight_reserved_return_margin_s"], daylight)
            self.assertEqual(evaluate.call_count, 3)

    def test_malformed_raw_json_is_400_and_never_reaches_planning(self):
        bodies = ((b'{invalid', "invalid_json"), (b'{"a":1,"a":2}', "duplicate_field"),
                  (b'{"a":NaN}', "nonfinite_json"), (b'{"a":Infinity}', "nonfinite_json"),
                  (b'{"a":1e999}', "invalid_json"), (b'\xff', "invalid_json"),
                  (("[" * (MAX_JSON_DEPTH + 1) + "0" + "]" * (MAX_JSON_DEPTH + 1)).encode(), "json_depth_limit"))
        with serving() as server, patch("service.http_server.plan_draft") as plan:
            for body, code in bodies:
                status, headers, response = request(server, "POST", "/plan", body,
                    {"Content-Type": "application/json", "Origin": "http://localhost:5173"})
                self.assertEqual(status, 400, body)
                self.assertEqual(response["error"]["code"], code)
                self.assertEqual(headers["Access-Control-Allow-Origin"], "http://localhost:5173")
            plan.assert_not_called()

    def test_schema_and_endpoint_errors_keep_structured_input_meaning(self):
        with serving() as server, patch("service.planning.build_graph") as build:
            for payload, code in (({"schema_version": 0}, "unsupported_schema_version"),
                                   ({"schema_version": "v1"}, "unsupported_schema_version"),
                                   ({}, "missing_field"), ([], "invalid_structure")):
                status, _, response = post_plan(server, payload)
                self.assertEqual(status, 422)
                self.assertEqual(response["error"]["code"], code)
            payload = example_requests()["baseline"]
            payload["parcel"]["version"] = "missing"
            status, _, response = post_plan(server, payload)
            self.assertEqual(status, 422)
            self.assertEqual(response["error"]["code"], "unknown_parcel")
            build.assert_not_called()

    def test_body_media_type_and_task_limits_reject_instead_of_truncating(self):
        with serving() as server:
            for headers, status, code in (({}, 415, "unsupported_content_type"),
                    ({"Content-Type": "text/plain"}, 415, "unsupported_content_type"),
                    ({"Content-Type": "application/json; charset=latin-1"}, 415, "unsupported_content_type"),
                    ({"Content-Type": "application/json", "Content-Encoding": "gzip"}, 415, "unsupported_content_encoding"),
                    ({"Content-Type": "application/json", "Transfer-Encoding": "chunked"}, 400, "unsupported_transfer_encoding"),
                    ({"Content-Type": "application/json", "Content-Length": "-1"}, 400, "invalid_content_length"),
                    ({"Content-Type": "application/json", "Content-Length": str(MAX_BODY_BYTES + 1)}, 413, "body_size_limit")):
                actual, _, response = request(server, "POST", "/plan", b"{}", headers)
                self.assertEqual(actual, status, headers)
                self.assertEqual(response["error"]["code"], code)
            payload = example_requests()["baseline"]
            payload["mission"]["tasks"] = [{"id": f"task-{i}", "duration_s": 0} for i in range(MAX_TASKS + 1)]
            status, _, response = post_plan(server, payload)
            self.assertEqual(status, 422)
            self.assertEqual(response["error"]["code"], "task_limit")
            payload["mission"]["tasks"].pop()
            status, _, response = post_plan(server, payload)
            self.assertEqual(status, 200)
            self.assertEqual(len(response["request_echo"]["mission"]["tasks"]), MAX_TASKS)

    def test_active_real_calculation_is_busy_without_queuing_or_another_planner(self):
        entered, release = Event(), Event()
        app = HTTPApplication()
        completed = []
        def blocked_evaluate(*args, **kwargs):
            entered.set()
            if not release.wait(timeout=5):
                raise RuntimeError("Test did not release the calculation.")
            return evaluate_mission(*args, **kwargs)
        with serving(app) as server, patch("service.planning.evaluate_mission", side_effect=blocked_evaluate) as evaluate:
            worker = Thread(target=lambda: completed.append(post_plan(server, example_requests()["baseline"])))
            worker.start()
            try:
                self.assertTrue(entered.wait(timeout=3))
                status, headers, data = post_plan(server, example_requests()["task_edit"])
                self.assertEqual(status, 409)
                self.assertEqual(data["error"]["code"], "planner_busy")
                self.assertEqual(headers["Access-Control-Allow-Origin"], "http://localhost:5173")
                self.assertEqual(evaluate.call_count, 1)
                self.assertEqual(request(server, "GET", "/health")[0], 200)
            finally:
                release.set()
                worker.join(timeout=5)
            self.assertFalse(worker.is_alive())
            self.assertEqual(completed[0][0], 200)
            self.assertEqual(post_plan(server, example_requests()["task_edit"])[0], 200)

    def test_backend_and_reconstruction_failures_are_500_without_fallback_then_recover(self):
        for target, error in (("search_from_base", RuntimeError("Synthetic backend failure")),
                              ("routes_to", RouteReconstructionError("Synthetic corrupt predecessor")),
                              ("evaluate_mission", TimeoutError("Synthetic backend timeout"))):
            with self.subTest(target=target), serving() as server:
                with patch(f"service.planning.{target}", side_effect=error), self.assertLogs("service.http_server", level="ERROR"):
                    status, headers, data = post_plan(server, example_requests()["baseline"])
                self.assertEqual(status, 500)
                self.assertEqual(set(data), {"error"})
                self.assertEqual(data["error"]["code"], "backend_failure")
                self.assertEqual(headers["Access-Control-Allow-Origin"], "http://localhost:5173")
                self.assertEqual(post_plan(server, example_requests()["baseline"])[0], 200)

    def test_complete_geometry_and_output_are_checked_before_success_headers(self):
        with serving() as server:
            for bound, value, code in (("MAX_GEOMETRY_POINTS", 3, "geometry_size_limit"),
                                       ("MAX_RESPONSE_BYTES", 1024, "response_size_limit")):
                with patch(f"service.http_server.{bound}", value):
                    status, headers, data = post_plan(server, example_requests()["baseline"])
                self.assertEqual(status, 500)
                self.assertEqual(set(data), {"error"})
                self.assertEqual(data["error"]["code"], code)
                self.assertEqual(headers["Access-Control-Allow-Origin"], "http://localhost:5173")
            with patch("service.http_server.MAX_GEOMETRY_POINTS", 4):
                status, _, data = post_plan(server, example_requests()["baseline"])
            self.assertEqual(status, 200)
            self.assertEqual(sum(len(data["alternatives"][0][leg]["xy_m"]) for leg in ("outbound", "return")), 4)


if __name__ == "__main__":
    unittest.main()
