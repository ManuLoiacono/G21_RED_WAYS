"""Cached HTTP download helper. Every network access of the ML pipeline goes through here."""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path

import requests
import truststore

# Validate TLS against the OS trust store (needed behind TLS-inspecting antivirus; keeps verification on).
truststore.inject_into_ssl()

log = logging.getLogger(__name__)

USER_AGENT = "g21-red-ways-ml/0.1 (research hindcast)"


def fetch_cached(url: str, dest: Path, timeout_s: float = 120.0, params: dict | None = None,
                 secret_params: dict | None = None) -> Path:
    """Download `url` to `dest` unless it already exists. Writes `<dest>.meta.json` with provenance.

    The URL stored in the metadata must never contain secrets (callers pass key-free URLs).
    """
    if dest.exists() and dest.stat().st_size > 0:
        log.info("cache hit: %s", dest.name)
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    log.info("downloading %s", url)
    query = {**(params or {}), **(secret_params or {})}
    try:
        resp = requests.get(url, params=query or None, timeout=timeout_s, headers={"User-Agent": USER_AGENT})
    except requests.RequestException as exc:
        # Never propagate messages that may contain secret query parameters.
        raise RuntimeError(f"request failed for {url} ({type(exc).__name__})") from None
    if not resp.ok:
        raise RuntimeError(f"HTTP {resp.status_code} for {url} params={params}")
    tmp = dest.with_suffix(dest.suffix + ".part")
    tmp.write_bytes(resp.content)
    tmp.replace(dest)
    meta = {
        "url": url,
        "params": params or {},
        "fetched_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "bytes": len(resp.content),
        "content_type": resp.headers.get("Content-Type"),
    }
    dest.with_name(dest.name + ".meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return dest


def read_meta(dest: Path) -> dict:
    meta_path = dest.with_name(dest.name + ".meta.json")
    if meta_path.exists():
        return json.loads(meta_path.read_text(encoding="utf-8"))
    return {}
