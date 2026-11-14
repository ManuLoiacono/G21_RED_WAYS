# ML — Resultados (hindcast de clima en Gale)

Documento generado por `python -m ml.evaluation.report` a partir de `ml/artifacts/*/metrics.json`. No editar a mano: regenerar.

## Protocolo

- Corte: 2025-10-25 (UTC). Solo se entrena con soles anteriores (último sol de entrenamiento: 4698).
- Ventana final: 2025-10-25 a 2025-12-05 (UTC) = **soles 4699–4739** (41 soles, todos con registro REMS; año marciano 38, Ls 160.85°–183.39°). Se evaluó una sola vez.
- Validación: un año marciano afuera por vez (años 31–38, solo soles anteriores al corte). La selección de modelo, variante de presión y `alpha` se hizo **solo con la validación**.
- Simulación histórica con origen móvil: modelos y climatología congelados al corte; las entradas son las observaciones REMS hasta el sol de emisión.
- Climatología = media (y p10/p90) de los **otros** años marcianos del conjunto de entrenamiento, en ±5° de Ls del sol objetivo.
- Persistencia = último valor observado en el sol de emisión (se arrastra como máximo 3 soles).
- Mejora = `1 − MAE_modelo / MAE_referencia` (0 = igual; negativo = peor). Cobertura esperada del p10–p90: 0,80.
- Todos los candidatos se evalúan sobre **los mismos casos** (`n`) para cada horizonte.

## A1 — Presión (`pressure_pa`)

Referencia de climatología elegida por validación: `clim_elev` (climatología de la presión normalizada por altura, devuelta a la elevación del rover en el sol de emisión). Elegido por validación, por horizonte: 1 sol → `lgbm_norm`, 3 sol → `lgbm_norm`, 5 sol → `lgbm_norm`, 10 sol → `ridge_norm_a100`.

| Candidato | Parte | Horizonte (soles) | n | MAE (Pa) | Mejora vs. climatología | Mejora vs. persistencia | Cobertura p10–p90 |
|---|---|---|---|---|---|---|---|
| persistence | validación | 1 | 4405 | 1.49 | 0.26 | -0.00 | 0.87 |
| persistence | validación | 3 | 4367 | 2.81 | -0.40 | 0.00 | 0.85 |
| persistence | validación | 5 | 4343 | 4.10 | -1.04 | 0.00 | 0.85 |
| persistence | validación | 10 | 4320 | 7.63 | -2.77 | 0.00 | 0.84 |
| clim_raw | validación | 1 | 4405 | 20.29 | -9.11 | -12.58 | 0.70 |
| clim_raw | validación | 3 | 4367 | 20.26 | -9.09 | -6.21 | 0.71 |
| clim_raw | validación | 5 | 4343 | 20.26 | -9.08 | -3.94 | 0.71 |
| clim_raw | validación | 10 | 4320 | 20.26 | -9.03 | -1.66 | 0.71 |
| clim_elev | validación | 1 | 4405 | 2.01 | -0.00 | -0.34 | 0.91 |
| clim_elev | validación | 3 | 4367 | 2.01 | 0.00 | 0.29 | 0.91 |
| clim_elev | validación | 5 | 4343 | 2.01 | 0.00 | 0.51 | 0.91 |
| clim_elev | validación | 10 | 4320 | 2.02 | -0.00 | 0.73 | 0.91 |
| lgbm_norm | validación | 1 | 4405 | 1.14 | 0.43 | 0.24 | 0.80 |
| lgbm_norm | validación | 3 | 4367 | 1.36 | 0.32 | 0.52 | 0.80 |
| lgbm_norm | validación | 5 | 4343 | 1.45 | 0.28 | 0.65 | 0.80 |
| lgbm_norm | validación | 10 | 4320 | 1.65 | 0.18 | 0.78 | 0.80 |
| ridge_norm_a100 | validación | 1 | 4405 | 1.32 | 0.34 | 0.12 | 0.80 |
| ridge_norm_a100 | validación | 3 | 4367 | 1.49 | 0.26 | 0.47 | 0.79 |
| ridge_norm_a100 | validación | 5 | 4343 | 1.52 | 0.24 | 0.63 | 0.79 |
| ridge_norm_a100 | validación | 10 | 4320 | 1.64 | 0.19 | 0.79 | 0.80 |
| persistence | ventana final | 1 | 41 | 0.88 | 0.68 | 0.00 | 0.95 |
| persistence | ventana final | 3 | 41 | 2.17 | 0.20 | 0.00 | 0.93 |
| persistence | ventana final | 5 | 41 | 3.12 | -0.15 | -0.00 | 1.00 |
| persistence | ventana final | 10 | 41 | 5.54 | -1.06 | -0.00 | 1.00 |
| clim_raw | ventana final | 1 | 41 | 35.54 | -12.04 | -39.48 | 0.00 |
| clim_raw | ventana final | 3 | 41 | 35.54 | -12.08 | -15.37 | 0.00 |
| clim_raw | ventana final | 5 | 41 | 35.54 | -12.12 | -10.38 | 0.00 |
| clim_raw | ventana final | 10 | 41 | 35.54 | -12.22 | -5.42 | 0.00 |
| clim_elev | ventana final | 1 | 41 | 2.73 | -0.00 | -2.10 | 0.80 |
| clim_elev | ventana final | 3 | 41 | 2.72 | -0.00 | -0.25 | 0.80 |
| clim_elev | ventana final | 5 | 41 | 2.71 | -0.00 | 0.13 | 0.80 |
| clim_elev | ventana final | 10 | 41 | 2.69 | -0.00 | 0.51 | 0.80 |
| lgbm_norm | ventana final | 1 | 41 | 0.83 | 0.70 | 0.06 | 0.90 |
| lgbm_norm | ventana final | 3 | 41 | 0.82 | 0.70 | 0.62 | 0.95 |
| lgbm_norm | ventana final | 5 | 41 | 0.86 | 0.68 | 0.72 | 0.93 |
| lgbm_norm | ventana final | 10 | 41 | 0.87 | 0.68 | 0.84 | 1.00 |
| ridge_norm_a100 | ventana final | 1 | 41 | 1.01 | 0.63 | -0.15 | 0.85 |
| ridge_norm_a100 | ventana final | 3 | 41 | 1.07 | 0.60 | 0.51 | 0.88 |
| ridge_norm_a100 | ventana final | 5 | 41 | 1.07 | 0.61 | 0.66 | 0.88 |
| ridge_norm_a100 | ventana final | 10 | 41 | 1.13 | 0.58 | 0.80 | 0.90 |

## A2 — `min_temp_c`

Elegido por validación, por horizonte: 1 sol → `lgbm_q`, 3 sol → `lgbm_q`, 5 sol → `lgbm_q`.

| Candidato | Parte | Horizonte (soles) | n | MAE (°C) | Mejora vs. climatología | Mejora vs. persistencia | Cobertura p10–p90 |
|---|---|---|---|---|---|---|---|
| persistence | validación | 1 | 4404 | 1.55 | 0.35 | -0.00 | 0.86 |
| persistence | validación | 3 | 4366 | 1.74 | 0.27 | -0.00 | 0.82 |
| persistence | validación | 5 | 4342 | 1.74 | 0.27 | -0.00 | 0.83 |
| climatology | validación | 1 | 4404 | 2.39 | 0.00 | -0.53 | 0.79 |
| climatology | validación | 3 | 4366 | 2.39 | -0.00 | -0.38 | 0.79 |
| climatology | validación | 5 | 4342 | 2.39 | -0.00 | -0.38 | 0.79 |
| lgbm_q | validación | 1 | 4404 | 1.35 | 0.43 | 0.13 | 0.69 |
| lgbm_q | validación | 3 | 4366 | 1.46 | 0.39 | 0.16 | 0.66 |
| lgbm_q | validación | 5 | 4342 | 1.54 | 0.36 | 0.11 | 0.65 |
| persistence | ventana final | 1 | 41 | 0.73 | 0.26 | 0.00 | 1.00 |
| persistence | ventana final | 3 | 41 | 0.76 | 0.23 | -0.00 | 1.00 |
| persistence | ventana final | 5 | 41 | 0.85 | 0.14 | -0.00 | 0.98 |
| climatology | ventana final | 1 | 41 | 0.99 | -0.00 | -0.35 | 1.00 |
| climatology | ventana final | 3 | 41 | 0.99 | -0.00 | -0.31 | 1.00 |
| climatology | ventana final | 5 | 41 | 0.99 | -0.00 | -0.16 | 1.00 |
| lgbm_q | ventana final | 1 | 41 | 0.72 | 0.27 | 0.02 | 0.90 |
| lgbm_q | ventana final | 3 | 41 | 0.81 | 0.18 | -0.07 | 0.93 |
| lgbm_q | ventana final | 5 | 41 | 0.72 | 0.28 | 0.16 | 0.88 |

## A2 — `max_temp_c`

Elegido por validación, por horizonte: 1 sol → `ridge_a100`, 3 sol → `ridge_a100`, 5 sol → `ridge_a100`.

| Candidato | Parte | Horizonte (soles) | n | MAE (°C) | Mejora vs. climatología | Mejora vs. persistencia | Cobertura p10–p90 |
|---|---|---|---|---|---|---|---|
| persistence | validación | 1 | 4404 | 2.71 | 0.30 | 0.00 | 0.83 |
| persistence | validación | 3 | 4366 | 3.44 | 0.10 | -0.00 | 0.81 |
| persistence | validación | 5 | 4342 | 3.48 | 0.09 | -0.00 | 0.81 |
| climatology | validación | 1 | 4404 | 3.85 | 0.00 | -0.42 | 0.79 |
| climatology | validación | 3 | 4366 | 3.84 | -0.00 | -0.11 | 0.79 |
| climatology | validación | 5 | 4342 | 3.84 | 0.00 | -0.10 | 0.79 |
| ridge_a100 | validación | 1 | 4404 | 2.58 | 0.33 | 0.05 | 0.80 |
| ridge_a100 | validación | 3 | 4366 | 2.98 | 0.22 | 0.13 | 0.80 |
| ridge_a100 | validación | 5 | 4342 | 3.13 | 0.19 | 0.10 | 0.80 |
| persistence | ventana final | 1 | 41 | 1.78 | 0.39 | -0.00 | 0.90 |
| persistence | ventana final | 3 | 41 | 2.51 | 0.14 | -0.00 | 0.88 |
| persistence | ventana final | 5 | 41 | 2.15 | 0.27 | 0.00 | 0.88 |
| climatology | ventana final | 1 | 41 | 2.93 | -0.00 | -0.64 | 0.90 |
| climatology | ventana final | 3 | 41 | 2.93 | -0.00 | -0.17 | 0.90 |
| climatology | ventana final | 5 | 41 | 2.93 | -0.00 | -0.36 | 0.90 |
| ridge_a100 | ventana final | 1 | 41 | 1.67 | 0.43 | 0.06 | 0.90 |
| ridge_a100 | ventana final | 3 | 41 | 1.81 | 0.38 | 0.28 | 0.95 |
| ridge_a100 | ventana final | 5 | 41 | 1.91 | 0.35 | 0.11 | 0.93 |

## ML-07 — Lectura de los CDF de RAD

Muestra: un archivo por año (día 298 = 25/10, o el último disponible), de 2012 a 2026. Script: `python -m ml.evaluation.inspect_rad` → `data/processed/ml/rad_inspection.json`.

- **Variables:** las mismas 17 en todos los años muestreados. La de dosis es `DOSIMETRY_TOTAL` (3 columnas) en **uGray/day** (µGy/día; no mGy). También hay `DOSIMETRY_TIMESLICE` (16 subintervalos por observación), histogramas LET y de neutros, `ALIVE_TIME` y `FLAGGED_DATA`.
- **Columnas de dosis:** `Total Dose B`, `RTG Corrected Dose B`, `Total Dose E`. B es silicio; E es plástico equivalente a tejido. Solo la segunda columna dice estar corregida por el MMRTG (fuente nuclear del rover); la diferencia B total − B corregida ronda 57–66 µGy/día en la muestra. **No está documentado si E está corregida por el MMRTG** ⚠️.
- **Cadencia:** una observación cada ~1026 s (~17 min), 84 por día en 2025; `ALIVE_TIME` mediana 933 s. En 2013–2014 la cadencia también es ~1024 s, pero hay días con menos observaciones.
- **Calidad:** `FLAGGED_DATA` vale vacío (dato bueno), `Cmds` (comandos) o `DAN` (actividad del instrumento DAN). Su descripción dice que lo marcado debe quitarse para uso científico; en la muestra las observaciones marcadas dan dosis más bajas. Se descartan. Valores ≤ 0 o iguales a FILLVAL se tratan como faltantes (el archivo de 2012 tiene B total = 0 y B corregida = NaN).
- **Cobertura:** 2012 tiene solo 2 días (puesta en marcha) y la serie útil empieza el 22/03/2013 (día 81). Hay huecos de 1 a 30 días por año. 2026 llega al día 315.
- **Versiones:** conviven v00–v09; se usa la mayor de cada día. Las versiones bajas recientes (v00–v02 en 2026) son preliminares.

| Año | Archivo | Obs. | Marcadas | Mediana B corregida (µGy/día) | Mediana E (µGy/día) |
|---|---|---|---|---|---|
| 2012 | `msl_rad_obs-l2_2012231_v02.cdf` | 25 | 13 | — | 142.08 |
| 2013 | `msl_rad_obs-l2_2013298_v02.cdf` | 39 | 1 | 147.28 | 209.58 |
| 2014 | `msl_rad_obs-l2_2014298_v02.cdf` | 87 | 5 | 135.06 | 199.34 |
| 2015 | `msl_rad_obs-l2_2015298_v04.cdf` | 86 | 8 | 154.91 | 220.96 |
| 2016 | `msl_rad_obs-l2_2016298_v04.cdf` | 87 | 7 | 190.10 | 261.44 |
| 2017 | `msl_rad_obs-l2_2017298_v04.cdf` | 86 | 4 | 194.21 | 274.90 |
| 2018 | `msl_rad_obs-l2_2018298_v04.cdf` | 86 | 3 | 216.86 | 303.14 |
| 2019 | `msl_rad_obs-l2_2019298_v04.cdf` | 84 | 2 | 218.46 | 309.56 |
| 2020 | `msl_rad_obs-l2_2020298_v04.cdf` | 85 | 3 | 218.12 | 313.27 |
| 2021 | `msl_rad_obs-l2_2021298_v04.cdf` | 86 | 5 | 208.03 | 289.73 |
| 2022 | `msl_rad_obs-l2_2022298_v04.cdf` | 85 | 3 | 165.98 | 234.25 |
| 2023 | `msl_rad_obs-l2_2023298_v05.cdf` | 85 | 3 | 125.16 | 178.25 |
| 2024 | `msl_rad_obs-l2_2024298_v03.cdf` | 86 | 3 | 109.24 | 156.55 |
| 2025 | `msl_rad_obs-l2_2025298_v04.cdf` | 84 | 2 | 109.95 | 157.09 |
| 2026 | `msl_rad_obs-l2_2026298_v03.cdf` | 84 | 2 | 129.60 | 184.83 |

La dosis sube hacia 2019–2020 (mínimo solar: más rayos cósmicos galácticos) y baja en 2013–2014 y 2024–2025 (máximos solares). Es lo esperado y respalda usar manchas solares en B1.


## Limitaciones

- **REMS es un resumen diario de divulgación** (CAB): valores enteros en °C y Pa, sin flags de calidad. Hay mínimas atípicas de −99/−100 °C (p. ej., soles 2803 y 2805) que se dejaron como están.
- **Ventana final chica y tranquila:** 41 casos por horizonte, todos del mismo tramo estacional (Ls ~161°–183°, año 38) y autocorrelacionados. No es representativa de la temporada de polvo. Los números de validación (~4300–4400 casos por horizonte) son la estimación más general.
- **Corrección por altura:** `H = 11 000 m` es un valor aproximado (supuesto) y `ELEV_REF_M` es la elevación del primer waypoint (sol 3). La elevación se arrastra hacia adelante entre waypoints, que no son diarios.
- **Ls y año marciano** salen de `marstime` a las 12:00 UTC de la fecha terrestre de REMS. Contra el `ls` entero de REMS, la diferencia media es 0.767° (máx. 1.608°). A los soles sin registro REMS se les interpola la fecha.
- **Intervalos:** los modelos puntuales (Ridge y persistencia) usan cuantiles de residuos de los otros años. **LightGBM por cuantiles subcubre en validación** (p10–p90 cubre ~0,65–0,69 en lugar de 0,80 en `min_temp_c`). No se recalibró después de mirar la ventana final; una calibración conformal elegida solo por validación queda como mejora pendiente.
- Los hiperparámetros de LightGBM son fijos (no se ajustaron); `alpha` de Ridge sale de una grilla chica elegida por validación.
- Son predicciones de un **modelo sobre datos históricos** (`kind: modelado`), no un pronóstico operativo ni clima actual.
