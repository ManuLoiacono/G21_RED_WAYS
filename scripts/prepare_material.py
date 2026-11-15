"""Version the existing small THEMIS display crop for backend route context."""

import json
from pathlib import Path
from service.validation import identity

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "app/src/thermal/themis_nir_parcel.json"
OUTPUT = ROOT / "data/processed/gale/material/themis.json"


def prepare(source=SOURCE, output=OUTPUT):
    raw = json.loads(Path(source).read_text(encoding="utf-8"))
    result = {"format": "qualitative-themis-route-1", "source_canonical_sha256": identity(raw),
        "radius_m": 3396190, "method": "exact-grid-segment-intersections-v1", "source": raw["source"],
        **{key: raw[key] for key in ("frame", "bbox_lonlat", "pixel_m", "width", "height", "nodata", "stretch", "dn")},
        "interpretation": "Existing relative night-IR brightness bands; not strength, thermal inertia, risk probability or cutoff-safe 2025 observation."}
    from service.material import validate_material
    validate_material(result)
    result["content_id"] = identity(result)
    output = Path(output); output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2, ensure_ascii=False, allow_nan=False) + "\n", encoding="utf-8")
    return result


if __name__ == "__main__":
    result = prepare()
    print(f'Prepared qualitative THEMIS crop {result["content_id"]}; no traversal effect.')
