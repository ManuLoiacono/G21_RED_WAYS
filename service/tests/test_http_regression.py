"""End-to-end HTTP, portable client and unavailable-route regression checks."""

from dataclasses import replace
from http.client import HTTPResponse
import json
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
from threading import Event
import unittest
from unittest.mock import patch

from engine import RoutingSearch, evaluate_mission
from service.example import example, example_requests
from service.http_server import HTTPApplication, MAX_BODY_BYTES
from service.prepared import registry_from_fixture
from service.tests.test_http import launched, post_plan, request, serving
from service.tests.test_prepared import raw_fixture
from service.validation import loads_strict


ROOT = Path(__file__).resolve().parents[2]


def run_client(server, *args):
    return subprocess.run([sys.executable, "-m", "service.client", "--url",
                           f"http://127.0.0.1:{server.server_port}", *args],
                          cwd=ROOT, capture_output=True, text=True, timeout=15)


class HTTPRegressionChecks(unittest.TestCase):
    def test_separate_service_and_client_processes_calculate_real_requests(self):
        expected = json.loads(json.dumps(example("baseline")))
        with launched("--allow-origin", "http://localhost:5174") as server:
            result = run_client(server, "--request", "service/examples/request.example.json")
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(loads_strict(result.stdout), expected)
            edited = run_client(server, "--case", "task_edit")
            self.assertEqual(edited.returncode, 0, edited.stderr)
            response = loads_strict(edited.stdout)
            self.assertEqual(response["request_echo"]["revision"], 1)
            self.assertEqual(response["request_echo"]["request_id"], "synthetic-task_edit")
            self.assertEqual(response["alternatives"][0]["metrics"]["elapsed_s"], 801)
            self.assertTrue(response["movement_reuse"]["base_search"])
            with tempfile.TemporaryDirectory() as directory:
                path = Path(directory) / "unsupported.json"
                path.write_text('{"schema_version":0}', encoding="utf-8")
                rejected = run_client(server, "--request", str(path))
            self.assertEqual(rejected.returncode, 1)
            self.assertIn("HTTP 422", rejected.stderr)
            self.assertEqual(set(loads_strict(rejected.stdout)), {"error"})
        # The stopped process cannot supply a plan; the client has no fallback.
        stopped = run_client(server, "--timeout", "1")
        self.assertEqual(stopped.returncode, 2)
        self.assertEqual(stopped.stdout, "")
        self.assertIn("HTTP planning request failed", stopped.stderr)

    def test_plan_preflight_and_actual_success_and_errors_for_each_local_origin(self):
        for origin in ("http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:5174"):
            with self.subTest(origin=origin), serving(HTTPApplication(allowed_origins=(origin,))) as server:
                status, headers, _ = request(server, "OPTIONS", "/plan", headers={"Origin": origin,
                    "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "Content-Type"})
                self.assertEqual(status, 200)
                self.assertEqual(headers["Access-Control-Allow-Origin"], origin)
                self.assertEqual(headers["Access-Control-Allow-Methods"], "POST, OPTIONS")
                for method, path, body, content_type, expected in (
                        ("POST", "/plan", json.dumps(example_requests()["baseline"]), "application/json; charset=utf-8", 200),
                        ("POST", "/plan", "{", "application/json", 400),
                        ("POST", "/plan", "{}", "text/plain", 415),
                        ("POST", "/plan", '{"schema_version":0}', "application/json", 422),
                        ("POST", "/plan", " " * (MAX_BODY_BYTES + 1), "application/json", 413),
                        ("GET", "/missing", None, "application/json", 404),
                        ("GET", "/plan", None, "application/json", 405)):
                    status, headers, data = request(server, method, path, body,
                        {"Origin": origin, "Content-Type": content_type})
                    self.assertEqual(status, expected)
                    self.assertEqual(headers["Access-Control-Allow-Origin"], origin)
                    self.assertEqual(headers["Cache-Control"], "no-store")
                    if expected == 405:
                        self.assertEqual(headers["Allow"], "POST, OPTIONS")
                    if expected != 200:
                        self.assertEqual(set(data["error"]), {"code", "path", "message"})
                with patch("service.planning.evaluate_mission", side_effect=RuntimeError("Synthetic failure")), \
                        self.assertLogs("service.http_server", level="ERROR"):
                    status, headers, _ = post_plan(server, example_requests()["baseline"], origin=origin)
                self.assertEqual(status, 500)
                self.assertEqual(headers["Access-Control-Allow-Origin"], origin)

    def test_wire_length_and_duplicate_headers_fail_with_readable_json_errors(self):
        with serving() as server:
            for extra, body, code in (("", b"{}", "invalid_content_length"),
                    ("Content-Length: 2\r\nContent-Length: 2\r\n", b"{}", "invalid_content_length"),
                    ("Content-Length: 9\r\n", b"{}", "incomplete_body"),
                    ("Content-Length: 2\r\nContent-Type: application/json\r\n", b"{}", "unsupported_content_type")):
                with socket.create_connection(("127.0.0.1", server.server_port), timeout=5) as connection:
                    connection.sendall(("POST /plan HTTP/1.0\r\nOrigin: http://localhost:5173\r\n"
                                        "Content-Type: application/json\r\n" + extra + "\r\n").encode() + body)
                    connection.shutdown(socket.SHUT_WR)
                    response = HTTPResponse(connection)
                    response.begin()
                    data = loads_strict(response.read())
                    self.assertEqual(response.status, 415 if code == "unsupported_content_type" else 400)
                    self.assertEqual(data["error"]["code"], code)
                    self.assertEqual(response.getheader("Access-Control-Allow-Origin"), "http://localhost:5173")
                    response.close()

    def test_exact_body_bound_and_unicode_identity_preserve_full_request_and_revision(self):
        payload = example_requests()["baseline"]
        payload.update(request_id='inspection-["quoted\\text"]-\u00e9', revision=42)
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        body += b" " * (MAX_BODY_BYTES - len(body))
        with serving() as server:
            status, _, response = request(server, "POST", "/plan", body, {"Content-Type": "application/json"})
            self.assertEqual(status, 200)
            self.assertEqual(response["request_echo"], payload)
            status, _, response = request(server, "POST", "/plan", body + b" ", {"Content-Type": "application/json"})
            self.assertEqual(status, 413)
            self.assertEqual(set(response), {"error"})

    def test_inconclusive_search_preserves_separate_state_and_null_metrics(self):
        def interrupted(graph, base):
            return RoutingSearch(graph, graph.grid.index(base), "search_inconclusive", "Synthetic interrupted search")
        with serving() as server, patch("service.planning.search_from_base", side_effect=interrupted), \
                patch("service.planning.evaluate_mission", wraps=evaluate_mission) as evaluate:
            status, _, response = post_plan(server, example_requests()["baseline"])
            self.assertEqual(status, 200)
            self.assertIsNone(response["assessment"])
            self.assertEqual(response["status"], "search_inconclusive")
            self.assertEqual(response["search_status"], "search_inconclusive")
            self.assertIsNone(response["alternatives"][0]["metrics"]["elapsed_s"])
            self.assertEqual(response["alternatives"][0]["return"]["xy_m"], [])
            self.assertEqual(evaluate.call_count, 1)

    def test_engine_calculates_found_outbound_without_return_and_same_cell(self):
        raw = raw_fixture()
        raw["parcel"]["grid"].update(elevation_m=[[0, 14]], coverage=[[True, True]], excluded=[[False, False]],
            terrain_slope_deg=[[0, 0]], spacing_m=[100, 100],
            aggregation_policy="Synthetic directed-grade case; exact covered centers, no exclusions, zero separate terrain summaries.")
        raw["parcel"]["pois"] = [{"id": "base", "xy_m": [0, 0]}, {"id": "sample", "xy_m": [100, 0]}]
        payload = example_requests()["baseline"]
        payload["destination"] = {"type": "poi", "poi_id": "sample"}
        payload["team"]["robots"] = []
        payload["team"]["humans"][0]["mission_overrides"] = {"max_ascent_deg": 15, "max_descent_deg": 5}
        with serving(HTTPApplication(registry=registry_from_fixture(raw))) as server:
            status, _, result = post_plan(server, payload)
            self.assertEqual(status, 200)
            self.assertEqual(result["assessment"], "incompatible")
            route = result["alternatives"][0]
            self.assertEqual(route["outbound"]["status"], "found")
            self.assertEqual(route["return"]["status"], "no_path_in_domain")
            self.assertEqual(route["return"]["xy_m"], [])
            self.assertIsNone(route["metrics"]["reserved_total_s"])
            payload["destination"] = payload["origin"]
            status, _, result = post_plan(server, payload)
            self.assertEqual(status, 200)
            self.assertEqual(result["assessment"], "viable_model")
            self.assertEqual(result["alternatives"][0]["outbound"]["xy_m"], [[0, 0]])
            self.assertEqual(result["alternatives"][0]["metrics"]["outbound_s"], 0)

    def test_internal_context_failure_is_technical_not_input_or_success(self):
        app = HTTPApplication()
        with serving(app) as server:
            self.assertEqual(post_plan(server, example_requests()["baseline"])[0], 200)
            app.planner._search = replace(app.planner._search, base_index=1)
            status, _, response = post_plan(server, example_requests()["baseline"])
            self.assertEqual(status, 500)
            self.assertEqual(response["error"]["code"], "stale_movement_context")
            self.assertEqual(set(response), {"error"})

    def test_disconnect_keeps_active_calculation_busy_until_engine_finishes(self):
        entered, release = Event(), Event()
        app = HTTPApplication()
        def blocked_evaluate(*args, **kwargs):
            entered.set()
            if not release.wait(timeout=5):
                raise RuntimeError("Test did not release engine evaluation.")
            return evaluate_mission(*args, **kwargs)
        with serving(app) as server, patch("service.planning.evaluate_mission", side_effect=blocked_evaluate):
            body = json.dumps(example_requests()["baseline"]).encode()
            connection = socket.create_connection(("127.0.0.1", server.server_port), timeout=5)
            try:
                connection.sendall((f"POST /plan HTTP/1.0\r\nContent-Type: application/json\r\nContent-Length: {len(body)}\r\n\r\n").encode() + body)
                self.assertTrue(entered.wait(timeout=3))
                connection.close()
                self.assertEqual(post_plan(server, example_requests()["task_edit"])[0], 409)
            finally:
                connection.close()
                release.set()
            self.assertTrue(app.planner._lock.acquire(timeout=3))
            app.planner._lock.release()
            self.assertEqual(post_plan(server, example_requests()["task_edit"])[0], 200)


if __name__ == "__main__":
    unittest.main()
