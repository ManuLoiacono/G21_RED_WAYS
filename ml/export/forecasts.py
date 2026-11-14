"""ML-06: one hindcast forecast JSON per issue sol of the test window -> data/processed/ml/forecasts/sol_NNNN.json.

For every issue sol in the window and every lead, the forecast comes from the candidate selected by CV
(ml/artifacts/<model>/metrics.json). Models and climatology are frozen at the cutoff; inputs are REMS
observations up to the issue sol. `observed` is the REMS value of the target sol (null if missing).
`skill_summary` holds the final-window metrics (targets inside the window) of the selected candidates.
Also writes the draft contract example contracts/forecast.example.json (schema_version 0).
"""
from __future__ import annotations

import json
import logging
import shutil

import pandas as pd

from ml import config
from ml.sources import rems
from ml.sources._cache import read_meta

log = logging.getLogger(__name__)
SCHEMA_VERSION = 0
EXAMPLE_SOL = 4705
MODEL_VERSION = "v1"


def _round(x, nd=2):
    return None if x is None or pd.isna(x) else round(float(x), nd)


def _load_model(model_dir: str):
    metrics = json.loads((config.ARTIFACTS_DIR / model_dir / "metrics.json").read_text(encoding="utf-8"))
    preds = pd.read_parquet(config.ARTIFACTS_DIR / model_dir / "predictions_final.parquet")
    return metrics, preds


def collect() -> tuple[pd.DataFrame, dict]:
    """Long table of selected forecasts for issue sols in the window, plus the skill summary."""
    rows, skill = [], {}
    a1_metrics, a1_preds = _load_model("A1_pressure")
    a2_metrics, a2_preds = _load_model("A2_temperature")
    a1_preds["variable"] = "pressure_pa"
    specs = [("pressure_pa", "A1", a1_metrics, a1_preds, a1_metrics["climatology_reference"])]
    for var in a2_metrics["variables"]:
        specs.append((var, "A2", dict(a2_metrics["results"][var]), a2_preds[a2_preds["variable"] == var],
                      a2_metrics["climatology_reference"]))

    window_sols = range(config_window()[0], config_window()[1] + 1)
    for var, family, metrics, preds, clim_ref in specs:
        selected = {int(k): v for k, v in metrics["selected_by_cv"].items()}
        skill[var] = {"evaluated_on": "final_window_targets", "climatology_reference": clim_ref, "by_lead": {}}
        for lead, cand in selected.items():
            sub = preds[preds["lead_sols"] == lead].set_index("issue_sol")
            sel = sub[sub["candidate"] == cand]
            clim = sub[sub["candidate"] == clim_ref]["p50"]
            pers = sub[sub["candidate"] == "persistence"]["p50"]
            for issue_sol in window_sols:
                if issue_sol not in sel.index:
                    continue
                r = sel.loc[issue_sol]
                rows.append({
                    "variable": var, "issued_for_sol": issue_sol, "target_sol": int(r["target_sol"]),
                    "lead_sols": lead, "p10": r["p10"], "p50": r["p50"], "p90": r["p90"], "observed": r["y"],
                    "baseline_climatology": clim.get(issue_sol), "baseline_persistence": pers.get(issue_sol),
                    "model_id": f"{family}_{cand}_{MODEL_VERSION}", "interval_method": r["interval_method"],
                })
            m = metrics["metrics"]["final"][cand][str(lead)]
            skill[var]["by_lead"][str(lead)] = {
                "model_id": f"{family}_{cand}_{MODEL_VERSION}",
                "mae": m["mae"], "mae_climatology": m["mae_climatology"], "skill": m["skill_vs_climatology"],
                "mae_persistence": m["mae_persistence"], "skill_vs_persistence": m["skill_vs_persistence"],
                "coverage_p10_p90": m.get("coverage_p10_p90"), "n": m["n"],
            }
    return pd.DataFrame(rows), skill


def config_window() -> tuple[int, int]:
    summary = json.loads((config.PROCESSED_DIR / "daily_weather_summary.json").read_text(encoding="utf-8"))
    return summary["test_window"]["sol_min"], summary["test_window"]["sol_max"]


def build_documents(table: pd.DataFrame, skill: dict) -> dict[int, dict]:
    daily = pd.read_parquet(config.PROCESSED_DIR / "daily_weather.parquet").set_index("sol")
    meta = read_meta(rems.RAW_PATH)
    provenance = {
        "class": "atmosferica", "mission": "MSL", "instrument": "REMS", "kind": "modelado", "origin": "cache",
        "url": meta.get("url", config.REMS_URL), "fetched_at": meta.get("fetched_at"),
    }
    docs = {}
    for issue_sol, g in table.groupby("issued_for_sol"):
        forecasts = []
        for _, r in g.sort_values(["variable", "lead_sols"]).iterrows():
            forecasts.append({
                "variable": r["variable"],
                "target_sol": int(r["target_sol"]),
                "target_date_utc": daily.loc[int(r["target_sol"]), "date_utc"].strftime("%Y-%m-%d"),
                "lead_sols": int(r["lead_sols"]),
                "p10": _round(r["p10"]), "p50": _round(r["p50"]), "p90": _round(r["p90"]),
                "observed": _round(r["observed"]),
                "baseline_climatology": _round(r["baseline_climatology"]),
                "baseline_persistence": _round(r["baseline_persistence"]),
                "model_id": r["model_id"],
                "interval_method": r["interval_method"],
                "provenance": {**provenance, "product": f"ml/{r['model_id'].split('_')[0]}"},
            })
        docs[int(issue_sol)] = {
            "schema_version": SCHEMA_VERSION,
            "fixture": False,
            "mode": "hindcast",
            "cutoff_utc": config.CUTOFF_UTC.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "issued_for_sol": int(issue_sol),
            "issued_for_date_utc": daily.loc[int(issue_sol), "date_utc"].strftime("%Y-%m-%d"),
            "inputs": "REMS observations up to issued_for_sol; models and climatology frozen at cutoff_utc",
            "forecasts": forecasts,
            "skill_summary": skill,
        }
    return docs


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    table, skill = collect()
    docs = build_documents(table, skill)
    if config.FORECASTS_DIR.exists():
        shutil.rmtree(config.FORECASTS_DIR)
    config.FORECASTS_DIR.mkdir(parents=True)
    for sol, doc in docs.items():
        (config.FORECASTS_DIR / f"sol_{sol:04d}.json").write_text(json.dumps(doc, indent=2, ensure_ascii=False),
                                                                    encoding="utf-8")
    # Draft contract example: a real file reduced to lead 1 of each variable.
    ex = json.loads(json.dumps(docs[EXAMPLE_SOL]))
    ex["forecasts"] = [f for f in ex["forecasts"] if f["lead_sols"] == 1]
    ex["notes"] = (
        "Draft v0 (to agree with P1 and P2). Extracted from data/processed/ml/forecasts/sol_4705.json, "
        "reduced to lead_sols = 1. One file per issue sol of the hindcast window. Units in key names "
        "(_pa, _c). observed = REMS value of target_sol (null if missing). kind 'modelado': show as "
        "'prediccion del modelo (simulacion historica)', never as current weather. Every metric carries n."
    )
    (config.CONTRACTS_DIR / "forecast.example.json").write_text(json.dumps(ex, indent=2, ensure_ascii=False) + "\n",
                                                                 encoding="utf-8")
    log.info("wrote %d forecast files (%d forecasts) and contracts/forecast.example.json", len(docs), len(table))


if __name__ == "__main__":
    main()
