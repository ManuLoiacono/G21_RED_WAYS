"""Write docs/ML_RESULTADOS.md from the metrics.json artifacts (documentation text in Spanish, per CLAUDE.md)."""
from __future__ import annotations

import json

from ml import config

OUT_PATH = config.DOCS_DIR / "ML_RESULTADOS.md"


def _load(name: str) -> dict:
    return json.loads((config.ARTIFACTS_DIR / name / "metrics.json").read_text(encoding="utf-8"))


def _fmt(x, nd=2):
    return "—" if x is None else f"{x:.{nd}f}"


def _table(metrics: dict, cands: list[str], unit: str, labels: dict[str, str]) -> list[str]:
    lines = [
        f"| Candidato | Parte | Horizonte (soles) | n | MAE ({unit}) | Mejora vs. climatología | Mejora vs. persistencia | Cobertura p10–p90 |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for part, part_label in (("cv", "validación"), ("final", "ventana final")):
        for cand in cands:
            for lead, m in metrics[part][cand].items():
                lines.append(
                    f"| {labels.get(cand, cand)} | {part_label} | {lead} | {m['n']} | {_fmt(m['mae'])} | "
                    f"{_fmt(m.get('skill_vs_climatology'))} | {_fmt(m.get('skill_vs_persistence'))} | "
                    f"{_fmt(m.get('coverage_p10_p90'))} |"
                )
    return lines


def build() -> str:
    summary = json.loads((config.PROCESSED_DIR / "daily_weather_summary.json").read_text(encoding="utf-8"))
    a1, a2 = _load("A1_pressure"), _load("A2_temperature")
    win = summary["test_window"]
    out = [
        "# ML — Resultados (hindcast de clima en Gale)",
        "",
        "Documento generado por `python -m ml.evaluation.report` a partir de `ml/artifacts/*/metrics.json`. No editar a mano: regenerar.",
        "",
        "## Protocolo",
        "",
        f"- Corte: {config.CUTOFF_UTC:%Y-%m-%d} (UTC). Solo se entrena con soles anteriores (último sol de entrenamiento: {summary['last_sol_before_cutoff']}).",
        f"- Ventana final: {win['dates_utc'][0]} a {win['dates_utc'][1]} (UTC) = **soles {win['sol_min']}–{win['sol_max']}** ({win['n_sols']} soles, todos con registro REMS; año marciano {win['mars_year'][0]}, Ls {win['ls_range_deg'][0]}°–{win['ls_range_deg'][1]}°). Se evaluó una sola vez.",
        "- Validación: un año marciano afuera por vez (años 31–38, solo soles anteriores al corte). La selección de modelo, variante de presión y `alpha` se hizo **solo con la validación**.",
        "- Simulación histórica con origen móvil: modelos y climatología congelados al corte; las entradas son las observaciones REMS hasta el sol de emisión.",
        "- Climatología = media (y p10/p90) de los **otros** años marcianos del conjunto de entrenamiento, en ±5° de Ls del sol objetivo.",
        "- Persistencia = último valor observado en el sol de emisión (se arrastra como máximo 3 soles).",
        "- Mejora = `1 − MAE_modelo / MAE_referencia` (0 = igual; negativo = peor). Cobertura esperada del p10–p90: 0,80.",
        "- Todos los candidatos se evalúan sobre **los mismos casos** (`n`) para cada horizonte.",
        "",
        "## A1 — Presión (`pressure_pa`)",
        "",
        f"Referencia de climatología elegida por validación: `{a1['climatology_reference']}` (climatología de la presión normalizada por altura, devuelta a la elevación del rover en el sol de emisión). Elegido por validación, por horizonte: {', '.join(f'{k} sol → `{v}`' for k, v in a1['selected_by_cv'].items())}.",
        "",
    ]
    a1_cands = ["persistence", "clim_raw", "clim_elev", *sorted(set(a1["selected_by_cv"].values()) - {"persistence", "clim_raw", "clim_elev"})]
    out += _table(a1["metrics"], a1_cands, "Pa", {})
    for var in a2["variables"]:
        r = a2["results"][var]
        cands = ["persistence", "climatology", *sorted(set(r["selected_by_cv"].values()) - {"persistence", "climatology"})]
        out += ["", f"## A2 — `{var}`", "",
                f"Elegido por validación, por horizonte: {', '.join(f'{k} sol → `{v}`' for k, v in r['selected_by_cv'].items())}.", ""]
        out += _table(r["metrics"], cands, "°C", {})
    out += [
        "",
        "## Limitaciones",
        "",
        "- **REMS es un resumen diario de divulgación** (CAB): valores enteros en °C y Pa, sin flags de calidad. Hay mínimas atípicas de −99/−100 °C (p. ej., soles 2803 y 2805) que se dejaron como están.",
        "- **Ventana final chica y tranquila:** 41 casos por horizonte, todos del mismo tramo estacional (Ls ~161°–183°, año 38) y autocorrelacionados. No es representativa de la temporada de polvo. Los números de validación (~4300–4400 casos por horizonte) son la estimación más general.",
        "- **Corrección por altura:** `H = 11 000 m` es un valor aproximado (supuesto) y `ELEV_REF_M` es la elevación del primer waypoint (sol 3). La elevación se arrastra hacia adelante entre waypoints, que no son diarios.",
        "- **Ls y año marciano** salen de `marstime` a las 12:00 UTC de la fecha terrestre de REMS. Contra el `ls` entero de REMS, la diferencia media es "
        f"{summary['ls_vs_rems']['abs_diff_mean_deg']}° (máx. {summary['ls_vs_rems']['abs_diff_max_deg']}°). A los soles sin registro REMS se les interpola la fecha.",
        "- **Intervalos:** los modelos puntuales (Ridge y persistencia) usan cuantiles de residuos de los otros años. **LightGBM por cuantiles subcubre en validación** (p10–p90 cubre ~0,65–0,69 en lugar de 0,80 en `min_temp_c`). No se recalibró después de mirar la ventana final; una calibración conformal elegida solo por validación queda como mejora pendiente.",
        "- Los hiperparámetros de LightGBM son fijos (no se ajustaron); `alpha` de Ridge sale de una grilla chica elegida por validación.",
        "- Son predicciones de un **modelo sobre datos históricos** (`kind: modelado`), no un pronóstico operativo ni clima actual.",
        "",
    ]
    return "\n".join(out)


def main() -> None:
    OUT_PATH.write_text(build(), encoding="utf-8")
    print(f"wrote {OUT_PATH}")


if __name__ == "__main__":
    main()
