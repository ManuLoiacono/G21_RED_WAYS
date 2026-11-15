#!/usr/bin/env python3
"""Collect Curiosity Navcam 360-degree panoramas taken inside the analysis parcel.

NASA publishes most rover stops as a "Sol N: Right Navigation Camera, Cylindrical Projection"
page on science.nasa.gov. Each page gives the image URL, the number of frames, the azimuth at the
center of the mosaic (clockwise from north), the local mean solar time and the site/drive where the
rover was. The site/drive pair matches MSL_waypoints.json, which gives the rover position.

Steps:
  1. List every such page through the site's search API.
  2. Read each page and parse its fields.
  3. Locate it with MSL_waypoints (exact site/drive; otherwise the last position at or before the sol).
  4. Keep the ones inside the parcel and pick a well-spaced subset for the map.

Outputs:
  data/cache/navcam_panoramas_all.json       every panorama found inside the parcel (backup, provenance)
  app/src/panoramas/navcam_panoramas.json    the subset drawn by the app

Usage (Python 3.10+, standard library only):
  python3 scripts/build_rover_panoramas.py [--spacing-m 80]
  python3 scripts/build_rover_panoramas.py --from-cache --spacing-m 80   # re-pick, no network

Limitations: the search API is relevance-based, so a page could be missed; pages whose text does not
follow NASA's template are skipped and reported. Positions are the rover's (MSL_waypoints frame).
"""

from __future__ import annotations

import argparse
import html
import json
import math
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_ALL = ROOT / "data" / "cache" / "navcam_panoramas_all.json"
OUT_APP = ROOT / "app" / "src" / "panoramas" / "navcam_panoramas.json"

SEARCH_URL = "https://science.nasa.gov/wp-json/wp/v2/search"
SEARCH_TERM = "Right Navigation Camera Cylindrical Projection"
WAYPOINTS_URL = "https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json"
USER_AGENT = "Mozilla/5.0 (compatible; marswalk-data-prep)"

# Parcel extent in DTM coordinates (app/src/terrain/parcel.ts). Rover positions sit ~40 m off the
# DTM frame; that is far below the spacing used here, so the extent is used as is.
PARCEL = {"west": 137.36, "south": -4.85, "east": 137.41, "north": -4.80}
# The Mastcam color panorama already on the map (pano_nevado_sajama); keep Navcam picks away from it.
EXISTING = [(137.3810041, -4.80800755)]
R_MARS = 3_396_190.0

TITLE_RE = re.compile(r"^Sol (\d+): Right Navigation Camera, Cylindrical Projection", re.I)


def fetch(url: str, retries: int = 3) -> bytes:
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=60) as res:
                return res.read()
        except Exception as exc:  # network hiccups: retry, then give up loudly
            if attempt == retries - 1:
                raise RuntimeError(f"Could not fetch {url}: {exc}") from exc
            time.sleep(2 * (attempt + 1))
    raise AssertionError("unreachable")


def list_pages() -> dict[str, str]:
    """Returns {page_url: title} for every Navcam cylindrical-projection page."""
    pages: dict[str, str] = {}
    page = 1
    while True:
        query = urllib.parse.urlencode({"search": SEARCH_TERM, "per_page": 100, "page": page})
        try:
            items = json.loads(fetch(f"{SEARCH_URL}?{query}"))
        except RuntimeError as exc:
            if "400" in str(exc):  # past the last page
                break
            raise
        if not items:
            break
        for item in items:
            title = html.unescape(item.get("title", ""))
            if TITLE_RE.match(title):
                pages[item["url"]] = title
        print(f"  search page {page}: {len(pages)} matching pages so far", file=sys.stderr)
        page += 1
        time.sleep(0.3)
    return pages


def page_text(raw: bytes) -> str:
    s = raw.decode("utf-8", errors="ignore")
    return html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s)))


def parse_page(url: str, title: str, raw: bytes) -> dict | None:
    s = raw.decode("utf-8", errors="ignore")
    text = page_text(raw)
    images = re.findall(
        r"https://assets\.science\.nasa\.gov/content/dam/science/missions/msl/[^\"' )]+?\.(?:png|jpe?g)", s, re.I
    )
    m_frames = re.search(r"took (\d+) images", text)
    m_az = re.search(r"centered at (\d+(?:\.\d+)?) degrees azimuth", text)
    m_site = re.search(r"drive (\d+), site number (\d+)", text)
    m_date = re.search(r"took the images on ([A-Z][a-z]+ \d{1,2}, \d{4})", text)
    m_sols = re.search(r"Sols? ([\d]+(?:\s*[-–]\s*\d+)?) of the Mars Science Laboratory", text)
    m_lmst = re.search(r"local mean solar time for the image exposures was ([^.]+)\.", text)
    m_size = re.search(r"\b(PNG|JPE?G) \((\d+(?:\.\d+)?) MB\)", text)
    if not (images and m_az and m_site):
        return None
    sol = int(TITLE_RE.match(title).group(1))  # type: ignore[union-attr]
    sols = [int(x) for x in re.findall(r"\d+", m_sols.group(1))] if m_sols else [sol]
    return {
        "sol": sol,
        "sol_start": min(sols),
        "sol_end": max(sols),
        "date": datetime.strptime(m_date.group(1), "%B %d, %Y").date().isoformat() if m_date else None,
        "site": int(m_site.group(2)),
        "drive": int(m_site.group(1)),
        "azimuth_center_deg": float(m_az.group(1)),
        "frames": int(m_frames.group(1)) if m_frames else None,
        "lmst": m_lmst.group(1).strip() if m_lmst else None,
        "image_url": images[0],
        "image_mb": float(m_size.group(2)) if m_size else None,
        "page_url": url,
    }


def load_waypoints() -> list[dict]:
    print("Reading rover waypoints…", file=sys.stderr)
    wp_raw = json.loads(fetch(WAYPOINTS_URL))
    return [
        {
            "sol": f["properties"]["sol"],
            "site": f["properties"]["site"],
            "drive": f["properties"]["drive"],
            "lonlat": f["geometry"]["coordinates"][:2],
            "elev_geoid_m": f["properties"]["elev_geoid"],
        }
        for f in wp_raw["features"]
    ]


def locate(p: dict, waypoints: list[dict]) -> tuple[dict, str] | None:
    """Waypoint where the panorama was taken, and how it was matched."""
    exact = [w for w in waypoints if w["site"] == p["site"] and w["drive"] == p["drive"]]
    if exact:
        return exact[-1], "waypoint_site_drive"
    before = [w for w in waypoints if w["sol"] <= p["sol"]]
    if before:
        return max(before, key=lambda w: w["sol"]), "waypoint_last_before_sol"
    return None


def place(p: dict, waypoints: list[dict]) -> bool:
    """Sets lonlat, elevation (rover's elev_geoid, used by the app to draw) and match method."""
    where = locate(p, waypoints)
    if not where:
        return False
    w, method = where
    p["lonlat"], p["elev_geoid_m"], p["location_method"] = w["lonlat"], w["elev_geoid_m"], method
    return True


def inside(lonlat: list[float]) -> bool:
    lon, lat = lonlat
    return PARCEL["west"] <= lon <= PARCEL["east"] and PARCEL["south"] <= lat <= PARCEL["north"]


def dist_m(a: tuple[float, float] | list[float], b: tuple[float, float] | list[float]) -> float:
    lat0 = math.radians((a[1] + b[1]) / 2)
    dx = math.radians(a[0] - b[0]) * math.cos(lat0)
    dy = math.radians(a[1] - b[1])
    return R_MARS * math.hypot(dx, dy)


def pick_spaced(candidates: list[dict], spacing_m: float) -> list[dict]:
    """Greedy pick in sol order: keep a panorama if it is at least spacing_m from every kept one."""
    kept: list[dict] = []
    taken = list(EXISTING)
    for p in sorted(candidates, key=lambda c: c["sol"]):
        if all(dist_m(p["lonlat"], q) >= spacing_m for q in taken):
            kept.append(p)
            taken.append(tuple(p["lonlat"]))
    return kept


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--spacing-m", type=float, default=80, help="minimum distance between picks")
    parser.add_argument("--from-cache", action="store_true", help=f"re-pick from {OUT_ALL.name} without network")
    args = parser.parse_args()

    if args.from_cache:
        cached = json.loads(OUT_ALL.read_text())
        common = {k: cached[k] for k in ("source", "fetched_at", "parcel_extent_dtm", "kind")}
        if any("elev_geoid_m" not in p for p in cached["panoramas"]):  # older cache: add elevations
            waypoints = load_waypoints()
            for p in cached["panoramas"]:
                place(p, waypoints)
            OUT_ALL.write_text(json.dumps(cached, indent=2, ensure_ascii=False) + "\n")
        write_app(common, cached["panoramas"], args.spacing_m)
        return 0

    waypoints = load_waypoints()
    first_sol_inside = min((w["sol"] for w in waypoints if inside(w["lonlat"])), default=0)

    print("Listing NASA Navcam panorama pages…", file=sys.stderr)
    pages = list_pages()
    wanted = {u: t for u, t in pages.items() if int(TITLE_RE.match(t).group(1)) >= first_sol_inside}  # type: ignore[union-attr]
    print(f"  {len(pages)} pages, {len(wanted)} from sol {first_sol_inside} on", file=sys.stderr)

    found, skipped = [], []
    for i, (url, title) in enumerate(sorted(wanted.items(), key=lambda kv: kv[1])):
        parsed = parse_page(url, title, fetch(url))
        time.sleep(0.2)
        if not parsed:
            skipped.append(url)
            continue
        if not place(parsed, waypoints) or not inside(parsed["lonlat"]):
            continue
        found.append(parsed)
        if (i + 1) % 20 == 0:
            print(f"  read {i + 1}/{len(wanted)}", file=sys.stderr)

    # Several pages can share a site/drive (same stop): keep the most recent per stop.
    by_stop: dict[tuple[int, int], dict] = {}
    for p in sorted(found, key=lambda p: p["sol"]):
        by_stop[(p["site"], p["drive"])] = p
    stops = sorted(by_stop.values(), key=lambda p: p["sol"])
    fetched_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    common = {
        "source": "science.nasa.gov 'Right Navigation Camera, Cylindrical Projection' pages + MSL_waypoints.json",
        "fetched_at": fetched_at,
        "parcel_extent_dtm": PARCEL,
        "kind": "observado",
    }
    OUT_ALL.parent.mkdir(parents=True, exist_ok=True)
    OUT_ALL.write_text(
        json.dumps({**common, "skipped_pages": skipped, "panoramas": stops}, indent=2, ensure_ascii=False) + "\n"
    )
    picked = write_app(common, stops, args.spacing_m)
    print(
        f"{len(found)} panoramas inside the parcel, {len(stops)} distinct stops, {len(picked)} picked; "
        f"{len(skipped)} pages skipped (unexpected format).",
        file=sys.stderr,
    )
    return 0


def write_app(common: dict, stops: list[dict], spacing_m: float) -> list[dict]:
    picked = pick_spaced(stops, spacing_m)
    OUT_APP.write_text(
        json.dumps(
            {
                **common,
                "_comment": f"Generated by scripts/build_rover_panoramas.py (spacing {spacing_m:g} m). "
                f"{len(picked)} of {len(stops)} stops inside the parcel; the rest are in data/cache/navcam_panoramas_all.json.",
                "panoramas": picked,
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n"
    )
    print(f"{len(picked)} of {len(stops)} stops written to {OUT_APP.relative_to(ROOT)}", file=sys.stderr)
    return picked


if __name__ == "__main__":
    sys.exit(main())
