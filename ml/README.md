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
python -m ml.run_all          # ML-01 a ML-06 en orden
```

O paso a paso:

| Paso | Comando | Salida |
|---|---|---|
| ML-01 | `python -m ml.sources.rems` · `python -m ml.sources.waypoints` | `data/raw/ml/{rems,waypoints}/` (caché, no se versiona) |
| ML-02 | `python -m ml.datasets.build_daily_weather` | `data/processed/ml/daily_weather.parquet` + `daily_weather_summary.json` |
| ML-03 | `python -m ml.evaluation.baselines` | `ml/artifacts/baselines/metrics.json` |
| ML-04 | `python -m ml.models.a1_pressure` | `ml/artifacts/A1_pressure/metrics.json` + predicciones |
| ML-05 | `python -m ml.models.a2_temperature` | `ml/artifacts/A2_temperature/metrics.json` + predicciones |
| ML-06 | `python -m ml.export.forecasts` | `data/processed/ml/forecasts/sol_NNNN.json` |

**Red:** todo acceso pasa por `ml/sources/` y queda en `data/raw/ml/`. Si el archivo ya existe, no se vuelve a bajar. Para refrescar una fuente, borrar su archivo crudo.

**Claves:** `NASA_API_KEY` se lee del entorno; solo la usa DONKI (ML-09). Nunca se escribe en archivos ni en logs.

## Fechas

- Corte: `2025-10-25T00:00Z`. Solo se entrena con soles de fecha anterior.
- Ventana de prueba final: del 25/10/2025 al 05/12/2025 (UTC), soles **4699–4739**. Se calcula desde REMS en `daily_weather_summary.json`.

## Limitaciones conocidas

Ver `docs/ML_RESULTADOS.md`.
