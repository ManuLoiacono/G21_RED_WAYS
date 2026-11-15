"""ML-07: read a sample of RAD CDFs (one day per year) and report variables, units, labels and quality flags.

Output: data/processed/ml/rad_inspection.json (summarised in docs/ML_RESULTADOS.md by ml.evaluation.report).
"""
from __future__ import annotations

import collections
import logging

import cdflib
import numpy as np

from ml import config
from ml.evaluation.common import write_json
from ml.sources import rad

log = logging.getLogger(__name__)
OUT_PATH = config.PROCESSED_DIR / "rad_inspection.json"
SAMPLE_DOY = 298  # 25 Oct: first day of the hindcast window in 2025
YEARS = range(2012, 2027)
DOSE_VAR = "DOSIMETRY_TOTAL"


def inspect_file(path) -> dict:
    c = cdflib.CDF(str(path))
    info = c.cdf_info()
    variables = {}
    for v in info.zVariables + info.rVariables:
        vi, va = c.varinq(v), c.varattsget(v)
        variables[v] = {"dims": list(vi.Dim_Sizes), "units": str(va.get("UNITS")), "var_type": str(va.get("VAR_TYPE"))}
    epoch = cdflib.cdfepoch.to_datetime(c.varget("EPOCH"))
    dose = np.asarray(c.varget(DOSE_VAR), dtype=float)
    fill = float(c.varattsget(DOSE_VAR)["FILLVAL"])
    dose[(dose == fill) | (dose < 0)] = np.nan
    flags = np.asarray(c.varget("FLAGGED_DATA")).astype(str)
    clean = flags == ""
    labels = [str(x) for x in np.asarray(c.varget("DOSIMETRY_OBS_LABEL")).ravel()]
    spacing = np.diff(epoch).astype("timedelta64[s]").astype(int)
    return {
        "file": path.name,
        "data_version": str(c.globalattsget().get("Data_version")),
        "generation_date": str(c.globalattsget().get("Generation_date")),
        "n_obs": int(len(epoch)),
        "first_obs_utc": str(epoch[0]),
        "last_obs_utc": str(epoch[-1]),
        "spacing_s_median": float(np.median(spacing)) if spacing.size else None,
        "dose_units": str(c.varattsget(DOSE_VAR).get("UNITS")),
        "dose_labels": labels,
        "flags": dict(collections.Counter(flags.tolist())),
        "dose_median_clean": dict(zip(labels, np.round(np.nanmedian(dose[clean], axis=0), 2).tolist())),
        "dose_median_flagged": (dict(zip(labels, np.round(np.nanmedian(dose[~clean], axis=0), 2).tolist()))
                                if (~clean).any() else None),
        "n_nan_dose": int(np.isnan(dose).any(axis=1).sum()),
        "alive_time_s_median": float(np.median(c.varget("ALIVE_TIME"))),
        "variables": variables,
    }


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    samples, coverage = [], {}
    for year in YEARS:
        files = rad.list_year(year)
        versions = collections.Counter(int(n[-6:-4]) for n in files.values())
        coverage[str(year)] = {"n_days": len(files), "first_doy": min(files), "last_doy": max(files),
                               "versions": {f"v{k:02d}": v for k, v in sorted(versions.items())}}
        doy = SAMPLE_DOY if SAMPLE_DOY in files else max(files)
        samples.append(inspect_file(rad.fetch_file(year, files[doy])))
    ref_vars = samples[-2]["variables"]
    same = {s["file"]: s["variables"] == ref_vars for s in samples}
    write_json(OUT_PATH, {"coverage_by_year": coverage, "variables_identical_to_2025": same, "samples": samples})
    for s in samples:
        print(s["file"], s["data_version"], s["n_obs"], s["spacing_s_median"], s["dose_labels"], s["flags"],
              s["dose_median_clean"], s["dose_median_flagged"], "same_vars" if same[s["file"]] else "DIFFERENT VARS")
    for y, cov in coverage.items():
        print(y, cov)


if __name__ == "__main__":
    main()
