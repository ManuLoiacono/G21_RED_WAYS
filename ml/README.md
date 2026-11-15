# ml/ — Modelos predictivos (hindcast) de clima en Gale

Plan y reglas: [`docs/ML_PREDICCION.md`](../docs/ML_PREDICCION.md). Resultados: [`docs/ML_RESULTADOS.md`](../docs/ML_RESULTADOS.md).

## Entorno

Desde la raíz del repo:

```bash
python -m venv .venv
.venv/Scripts/pip install -r ml/requirements.txt      # Windows
# .venv/bin/pip install -r ml/requirements.txt        # Linux/macOS
```

`truststore` hace que la verificación TLS use el almacén de certificados del sistema operativo. Hace falta, por ejemplo, detrás de antivirus que inspeccionan TLS, como AVG. La verificación sigue activa.

## De punta a punta

Todos los comandos se corren desde la raíz con el Python del venv (`.venv/Scripts/python` en Windows):

```bash
python -m ml.run_all          # ML-01 a ML-08 en orden (+ reporte)
```

O paso a paso:

| Paso | Comando | Salida |
|---|---|---|
| ML-01 | `python -m ml.sources.rems` · `python -m ml.sources.waypoints` | `data/raw/ml/{rems,waypoints}/` (caché, no se versiona) |
| ML-02 | `python -m ml.datasets.build_daily_weather` | `data/processed/ml/daily_weather.parquet` + `daily_weather_summary.json` |
| ML-03 | `python -m ml.evaluation.baselines` | `ml/artifacts/baselines/metrics.json` |
| ML-04 | `python -m ml.models.a1_pressure` | `ml/artifacts/A1_pressure/metrics.json` + predicciones |
| ML-05 | `python -m ml.models.a2_temperature` | `ml/artifacts/A2_temperature/metrics.json` + predicciones |
| ML-07 | `python -m ml.evaluation.inspect_rad` | `data/processed/ml/rad_inspection.json` (muestra de un CDF por año) |
| ML-08 | `python -m ml.sources.sunspots` · `python -c "from ml.sources import rad; rad.fetch_all_dose(range(2012, 2027))"` | `data/raw/ml/{sunspots,rad/dose}/` (~4900 días, ~60 MB, 15–20 min la primera vez) |
| ML-08 | `python -m ml.datasets.build_rad_daily` | `data/processed/ml/rad_daily.parquet`, `sunspots_daily.parquet`, `rad_daily_summary.json` |
| ML-08 | `python -m ml.models.b1_dose` | `ml/artifacts/B1_dose/metrics.json` + predicciones |
| ML-06 | `python -m ml.export.forecasts` | `data/processed/ml/forecasts/sol_NNNN.json` (clima y, si existe B1, dosis) |

**Red:** todo acceso pasa por `ml/sources/` y queda en `data/raw/ml/`. De RAD se guarda solo la serie de dosis por observación (parquet por día); el CDF completo se conserva solo para los días de la ventana final. Si el archivo ya existe, no se vuelve a bajar. Para refrescar una fuente, borrar su archivo crudo.

**Claves:** `NASA_API_KEY` se lee del entorno; solo la usa DONKI (ML-09). Nunca se escribe en archivos ni en logs.

## Fechas

- Corte: `2025-10-25T00:00Z`. Solo se entrena con soles de fecha anterior.
- Ventana de prueba final: del 25/10/2025 al 05/12/2025 (UTC), soles **4699–4739**. Se calcula desde REMS en `daily_weather_summary.json`.

## Limitaciones conocidas

Ver `docs/ML_RESULTADOS.md`.
