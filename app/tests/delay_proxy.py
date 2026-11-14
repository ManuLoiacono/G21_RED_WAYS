"""Loopback-only regression proxy: forward real engine results, hold one delivery on demand."""
import argparse
import http.client
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--port", type=int, default=8002)
parser.add_argument("--upstream-port", type=int, default=8000)
args = parser.parse_args()
release = threading.Event()
release.set()
lock = threading.Lock()
state = {"hold_next": False, "waiting": 0}


class Handler(BaseHTTPRequestHandler):
    def respond(self, status, body, content_type="application/json"):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        origin = self.headers.get("Origin")
        if origin in ("http://127.0.0.1:5174", "http://localhost:5174"):
            self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def dispatch(self):
        if self.path.startswith("/__test/"):
            with lock:
                if self.path == "/__test/hold":
                    state["hold_next"] = True
                    release.clear()
                elif self.path == "/__test/release":
                    release.set()
                body = json.dumps(state).encode()
            self.respond(200, body)
            return
        held = False
        if self.path == "/plan" and self.command == "POST":
            with lock:
                held = state["hold_next"]
                state["hold_next"] = False
        body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
        connection = http.client.HTTPConnection("127.0.0.1", args.upstream_port, timeout=30)
        headers = {"Origin": "http://127.0.0.1:5173"}
        if body:
            headers.update({"Content-Type": "application/json", "Content-Length": str(len(body))})
        try:
            connection.request(self.command, self.path, body=body or None, headers=headers)
            response = connection.getresponse()
            payload, status = response.read(), response.status
            if held:
                with lock:
                    state["waiting"] += 1
                release.wait(25)
                with lock:
                    state["waiting"] -= 1
            self.respond(status, payload)
        except (OSError, http.client.HTTPException) as error:
            self.respond(502, json.dumps({"error": {"code": "test_upstream_unavailable", "path": "", "message": str(error)}}).encode())
        finally:
            connection.close()

    do_GET = dispatch
    do_POST = dispatch
    do_OPTIONS = dispatch


server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
print(f"Regression proxy: http://127.0.0.1:{args.port}; upstream port {args.upstream_port}", flush=True)
try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
finally:
    release.set()
    server.server_close()
