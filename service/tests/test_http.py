"""Real loopback HTTP checks for the local draft adapter."""

from contextlib import contextmanager
from http.client import HTTPConnection
import json
from pathlib import Path
import socket
import subprocess
import sys
from threading import Thread
import unittest
from unittest.mock import patch

from service.exchange import export_catalogs
from service.http_server import HTTPApplication, LocalHTTPServer


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


if __name__ == "__main__":
    unittest.main()
