"""Launch Vite with an optional existing private token file; never copy or print credentials."""

import argparse
import os
from pathlib import Path
import shutil
import subprocess


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--token-env-file", type=Path, help="Read only VITE_CESIUM_ION_TOKEN from an existing private file.")
    parser.add_argument("--node", default=shutil.which("node"), help="Verified Node executable; defaults to PATH discovery.")
    parser.add_argument("--port", type=int, default=5173)
    args = parser.parse_args()
    if not args.node:
        parser.error("Node is unavailable. Supply --node with the installed executable path.")
    env = os.environ.copy()
    if args.token_env_file:
        for line in args.token_env_file.read_text(encoding="utf-8-sig").splitlines():
            key, separator, value = line.partition("=")
            if separator and key.strip() == "VITE_CESIUM_ION_TOKEN":
                env[key.strip()] = value.strip().strip("\"'")
    app = Path(__file__).resolve().parent.parent / "app"
    raise SystemExit(subprocess.call([args.node, str(app / "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", str(args.port), "--strictPort"], cwd=app, env=env))


if __name__ == "__main__":
    main()
