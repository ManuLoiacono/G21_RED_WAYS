"""Send an actual HTTP planning request; never substitute a local response."""

import argparse
import json
import math
from pathlib import Path
import sys
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from .example import example_requests
from .http_server import MAX_RESPONSE_BYTES, local_origin
from .validation import canonical, loads_strict


def request_plan(url, payload, timeout):
    request = Request(url + "/plan", data=canonical(payload).encode("utf-8"),
                      headers={"Content-Type": "application/json"}, method="POST")
    try:
        response = urlopen(request, timeout=timeout)
    except HTTPError as exc:
        response = exc
    with response:
        body = response.read(MAX_RESPONSE_BYTES + 1)
        if len(body) > MAX_RESPONSE_BYTES:
            raise ValueError("HTTP response exceeds the local output limit.")
        return response.getcode(), loads_strict(body.decode("utf-8"))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", type=local_origin, default="http://127.0.0.1:8000", help="Loopback service origin.")
    parser.add_argument("--timeout", type=float, default=30, help="Socket I/O timeout in seconds; does not cancel the engine.")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--case", choices=tuple(example_requests()), help="Send a supplied example request (default: baseline).")
    group.add_argument("--request", type=Path, help="Read a strict draft request JSON file.")
    args = parser.parse_args(argv)
    if not math.isfinite(args.timeout) or args.timeout <= 0:
        parser.error("Timeout must be finite and positive.")
    try:
        payload = (loads_strict(args.request.read_text(encoding="utf-8")) if args.request
                   else example_requests()[args.case or "baseline"])
        status, result = request_plan(args.url, payload, args.timeout)
    except (OSError, ValueError) as exc:
        print(f"HTTP planning request failed: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(result, indent=2, allow_nan=False))
    if status != 200:
        print(f"HTTP {status}; no successful plan was returned.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
