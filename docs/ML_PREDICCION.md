# ML — Modelos predictivos de clima y radiación (Gale)

Versión 0.1 — 14/11/2026, ~15:30 ART. Documento de trabajo para Claude Code y para el equipo.
Va en `docs/ML_PREDICCION.md`. Complementa a `CLAUDE.md` (que manda en convenciones, idioma y honestidad).

**Marcas:** ✅ verificado el 14/11 con una consulta real · ⚠️ supuesto o sin verificar · ⏳ pendiente.

---

## 1. Objetivo

Agregar a la POC un **modo de simulación histórica ("hindcast")**: se fija una fecha de corte, los modelos predicen las próximas horas o días con información anterior a ese corte, y la app compara lo predicho con lo que efectivamente midieron las misiones. El resultado es un **grado de precisión medible**, que se puede mostrar en el video.

Esto alimenta el panel "Parte de EVA" (luz, clima, clima espacial, comunicación) con datos `kind: "modelado"`.

**Fuera de alcance:** clima en vivo (no existe), polvo local diario (no hay datos), redes neuronales grandes (no hay datos ni tiempo).

---

## 2. Decisiones ya tomadas

| Tema | Decisión |
|---|---|
| Ventana de prueba final | **25/10/2025 al 05/12/2025** (UTC). Rango exacto calculado desde REMS: **soles 4699–4739** (41 soles, todos con registro) ✅ 14/11 |
| Fecha de corte | Los modelos se entrenan **solo con datos anteriores al 25/10/2025**. La ventana de prueba no se usa para elegir hiperparámetros ni variables |
| Selección de modelos | Validación cruzada **por año marciano** (sección 7) |
| Técnica | Modelos chicos y tabulares (climatología + regresión, LightGBM, regresión logística). Nada de LSTM ni transformers salvo como comparación opcional |
| Combinación | Modelos chicos encadenados + una capa de reglas (no un modelo gigante) |
| Predicho vs. medido | "Predicción" = próximas horas o días desde el corte. "Medido" = el dato real de ese instante simulado |

---

## 3. Dónde va cada cosa en el repo (sin pisar a nadie)

```text
ml/                          # NUEVO. Dueño: quien tome ML (rama ml/...)
├── README.md                # cómo correr todo, de punta a punta
├── requirements.txt         # dependencias propias (no tocar las del servicio)
├── config.py                # rutas, fechas de corte, ventana de prueba, constantes de Gale
├── sources/                 # descarga cruda con caché local (una función por fuente)
│   ├── rems.py  waypoints.py  rad.py  donki.py  maven_sep.py  sunspots.py
├── datasets/                # construye tablas limpias por sol (una por enfoque)
│   ├── build_daily_weather.py   build_rad_daily.py   build_space_weather.py
├── models/                  # A1 presión, A2 temperatura, B1 dosis, B2 eventos, C1 evaluación DONKI
├── evaluation/              # baselines, métricas, validación por año marciano, reportes
├── export/                  # genera los JSON de predicción que consume el servicio
└── artifacts/               # modelos entrenados (chicos) + metrics.json por modelo

data/raw/ml/                 # descargas crudas (YA está en .gitignore: no se versiona)
data/processed/ml/           # tablas limpias chicas (CSV/Parquet) — SÍ se versionan si pesan < ~5 MB
data/processed/ml/forecasts/ # predicciones del hindcast, una por sol de la ventana (JSON)
contracts/forecast.example.json   # NUEVO borrador v0 (cambio de contrato: acordar con P1 y P2)
docs/ML_PREDICCION.md        # este documento
docs/ML_RESULTADOS.md        # resultados y métricas (lo genera evaluation/)
```

**Reglas de convivencia:**
- Rama propia: `ml/<tarea>` (por ejemplo `ml/a1-pressure`). Merge a `main` con revisión rápida.
- **No tocar** `app/`, `engine/`, `service/`, `scripts/` ni los contratos existentes. Lo nuevo de `contracts/` es un borrador y se acuerda con P1 y P2 antes de pasarlo a v1.
- La integración con la app es **por archivos**: el servicio solo lee `data/processed/ml/forecasts/*.json`. El servicio **no entrena ni corre modelos** al pedir un plan (D5: "calcular" no consulta nada externo).
- Código en inglés (identificadores, comentarios, logs). Documentación en español.
- Python 3.10+. Entorno propio: `python -m venv .venv && .venv/bin/pip install -r ml/requirements.txt`.

---

## 4. Fuentes de datos

| Id | Fuente | Acceso | Estado | Cuidado |
|---|---|---|---|---|
| S1 | **REMS resumen diario** | `https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json` (JSON, sin key) | ✅ 4.745 soles, sol 1 a 4995 (07/08/2012–25/08/2026) | Faltantes como `"--"` → `NaN`, nunca 0. `wind_speed` y `abs_humidity` vacíos. `atmo_opacity` siempre "Sunny": **no usar**. La lista viene del más nuevo al más viejo. Hay atípicos (mín −98 °C el 12/02/2026). `sunrise`/`sunset` en hora media solar local |
| S2 | **Posiciones de Curiosity** | `https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json` | ✅ 1.389 puntos hasta el sol 5073 | **No hay un punto por sol**: llevar la elevación hacia adelante (`ffill`) por sol. `elev_geoid` en metros. Es un endpoint sin contrato: guardar copia |
| S3 | **RAD (radiación en superficie)** | `https://cdaweb.gsfc.nasa.gov/sp_phys/data/msl/rad/cdf/obs-l2/{AAAA}/msl_rad_obs-l2_{AAAA}{DDD}_v{NN}.cdf` | ✅ archivos casi diarios 2013–2026 (2026 hasta el día 315) | ✅ 14/11 (ML-07): dosis en `DOSIMETRY_TOTAL`, **µGy/día**, columnas `Total Dose B`, `RTG Corrected Dose B`, `Total Dose E`; marca `FLAGGED_DATA` (`Cmds`, `DAN`) a descartar. Usar `cdflib`. Varias versiones por día: la mayor `vNN`. Los últimos días son preliminares. Detalle en `docs/ML_RESULTADOS.md` |
| S4 | **DONKI** | `https://api.nasa.gov/DONKI/{WSAEnlilSimulations,CME,FLR,SEP}?startDate=&endDate=&api_key=` | ✅ | **Máx. 60 días por consulta** (error 400). Key en variable de entorno `NASA_API_KEY` (nunca en el repo). Con `DEMO_KEY` da 429 enseguida | ⚠️ 14/11: `FLR` responde 404 en todos los rangos probados; CME, SEP y WSAEnlilSimulations OK (2013–2025 bajados).
| S5 | **MAVEN SEP** | HAPI: `https://cdaweb.gsfc.nasa.gov/hapi/data?id=MVN_SEP_L2_S1-CAL-SVY-FULL&time.min=&time.max=&parameters=f_ion_flux_tot&format=csv` | ✅ 22/09/2014–06/12/2025 | **Una medición cada 2 s: no bajar años enteros.** Primero buscar en `https://cdaweb.gsfc.nasa.gov/hapi/catalog` un producto de menor cadencia; si no hay, bajar por día y agregar por hora. Unidades sin verificar. Órbita de ~4,5 h: la medición depende de la posición de la nave | ✅ 14/11: el catálogo HAPI no tiene producto de menor cadencia; se bajan solo los días a ±3 días de cada alerta y se guardan agregados por hora (~12 MB). Hay marcas de tiempo de relleno (9999-12-31).
| S6 | **Manchas solares (SILSO)** | `https://www.sidc.be/SILSO/DATA/SN_d_tot_V2.0.csv` | ✅ 14/11: diario hasta 31/10/2026; `;` sin encabezado; `SN = -1` faltante; última columna 1 = definitivo, 0 = provisorio | Proxy de la actividad solar para la dosis de fondo. Alternativa: monitores de neutrones (Oulu) |
| S7 | **Tiempo marciano** | paquete `marstime` (pip) | ✅ amanecer/atardecer vs. REMS: error medio ~0,5 min | Para Ls, hora local y geometría solar. Ver la función de referencia en la sección 10 |
| S8 | **Polvo por estación** | MDAD, Zenodo 7480334 | ⏳ | Solo estadística por Ls (años marcianos 24–32). Opcional |

Ya existe una descarga de DONKI WSA-ENLIL para la ventana de prueba (`NASA_API_TEST.txt`, 207 simulaciones, 29 con llegada a Marte). Copiarla a `data/raw/ml/donki/` como respaldo; el pipeline igual debe poder rehacerla.

**Todo acceso a red pasa por `ml/sources/` con caché en `data/raw/ml/`:** si el archivo ya está, no se vuelve a bajar. Así se puede trabajar y repetir sin red.

---

## 5. Datasets a construir

| Id | Tabla | Una fila por | Columnas principales |
|---|---|---|---|
| **DS-W** | `daily_weather.parquet` | sol | `sol`, `date_utc`, `ls_deg`, `mars_year`, `pressure_pa`, `min_temp_c`, `max_temp_c`, `dtr_c` (= máx − mín), `uv_category`, `sunrise_lmst`, `sunset_lmst`, `rover_elev_m`, `pressure_norm_pa` (corregida por altura) |
| **DS-R** | `rad_daily.parquet` | día UTC (y sol) | dosis diaria de fondo de cada detector (nombres a definir tras leer el CDF), máximo horario, cantidad de muestras válidas, versión del archivo |
| **DS-S** | `space_weather_events.parquet` | evento | tipo (CME, llamarada, SEP, llegada ENLIL a Marte), hora, velocidad, clase, longitud de origen, llegada predicha a Marte, "rasante"/"menor" |
| **DS-M** | `maven_sep_hourly.parquet` | hora | flujo total de iones (mediana y máximo horario) |
| **DS-X** | `sunspots_daily.parquet` | día | número de manchas diario y media móvil de 27 días |

**Corrección de presión por altura (importante):** Curiosity viene subiendo el Monte Sharp; a más altura, menos presión. Sin corregir, el modelo confunde la subida con un cambio de clima.
`pressure_norm_pa = pressure_pa * exp((rover_elev_m - ELEV_REF_M) / H)`, con `H ≈ 11.000 m` (escala de altura típica; ⚠️ valor aproximado, documentarlo) y `ELEV_REF_M` = elevación del rover al llegar. Probar las dos versiones (con y sin corrección) y quedarse con la que mejor valide.

**Año marciano y Ls:** calcular con `marstime` para cada fecha, y comparar contra la columna `ls` de REMS (diferencias de hasta ~1,5° esperables).

---

## 6. Modelos

### Enfoque A — Clima de superficie (prioridad 1)

| Id | Objetivo | Horizontes | Variables | Técnica | Referencia a superar |
|---|---|---|---|---|---|
| **A1** | `pressure_pa` diaria | 1, 3, 5, 10 soles | `sin/cos(Ls)`, presión de los últimos 1–5 soles, anomalía respecto de la climatología, `rover_elev_m` | Climatología por Ls + regresión de la anomalía (Ridge) y LightGBM para comparar | Climatología y persistencia |
| **A2** | `min_temp_c` y `max_temp_c` con rango (p10, p50, p90) | 1, 3, 5 soles | las de A1 + temperaturas y `dtr_c` de los últimos soles | LightGBM con pérdida por cuantiles (un modelo por cuantil) | Climatología (con su p10–p90 histórico) y persistencia |
| A3 (opcional) | `uv_category` | 1 sol | Ls, presión, `dtr_c` | Clasificador ordinal o LightGBM | Clase más frecuente por Ls |

**Climatología por Ls** = promedio (y percentiles) de los años marcianos anteriores en una ventana de ±5° de Ls. Se calcula **solo con datos anteriores al corte**.

### Enfoque B — Radiación (prioridad 2)

| Id | Objetivo | Variables | Técnica | Referencia |
|---|---|---|---|---|
| **B1** | Dosis diaria de fondo en Gale | presión (o la predicha por A1), número de manchas con retraso (27–90 días), Ls | Regresión lineal con base física (más presión → menos dosis) + LightGBM para comparar | Media móvil de 27 días |
| B2 (si sobra tiempo) | ¿Pico de partículas en las próximas 24–72 h? (sí/no) | llamaradas (clase, longitud de origen), CME (velocidad, ancho), llegada ENLIL a Marte, MAVEN (hasta 2025) | Regresión logística con pesos de clase; LightGBM si hay casos suficientes | "Alarma si DONKI predice llegada" |

**Etiquetas de B2:** no vienen hechas. Un día/hora es "evento" si la dosis de RAD supera el fondo de B1 por un umbral (por ejemplo, 3 desviaciones). Documentar el umbral. Son pocos casos: reportar la cantidad.

### Enfoque C — Evaluar las alertas de clima espacial (prioridad 3)

| Id | Qué hace | Técnica |
|---|---|---|
| **C1** | Empareja cada llegada a Marte predicha por DONKI con lo medido (MAVEN y RAD): acierto, falsa alarma, evento no avisado, error en horas | Emparejamiento por ventana de tiempo (±24 h, documentar). **No es ML**, pero da el grado de precisión |
| C2 (si sobra tiempo) | Predice el error de la hora de llegada | Regresión simple; solo si C1 junta decenas de casos |

Primer caso ya observado (✅ con reservas): MAVEN muestra partículas >5× lo normal del 29/10/2025 19:00 al 30/10 02:00 UTC, una hora después de la llegada predicha para la CME del 26/10 (29/10 17:51–18:18). Hubo otras llegadas predichas esos días sin suba visible. No es todavía un "acierto" demostrado.

### Enfoque D — Polvo (opcional)

- **D-stat:** probabilidad de tormenta por Ls (MDAD). Estadística, no ML.
- **D-proxy (hipótesis):** con polvo, la amplitud térmica diaria (`dtr_c`) se achica. Un detector de anomalías sobre `dtr_c` podría marcar episodios de polvo. Validarlo con la tormenta global de 2018 (soles ~2080–2170, ⚠️ aproximado). Si funciona, sumar la variable a A2.

### Cómo se combinan

1. **A1 → B1:** la presión predicha entra al modelo de dosis.
2. **D-proxy → A2:** si existe, la anomalía de amplitud térmica entra a temperatura.
3. **B1 + B2:** dosis esperada = fondo + probabilidad de pico.
4. **Capa de reglas (en el servicio, no ML):** las salidas alimentan el "Parte de EVA" con umbrales explicables (verde, amarillo, rojo). Los umbrales son supuestos editables y citados.

---

## 7. Cómo se evalúa (explicado simple)

**La idea:** un modelo vale la pena solo si predice mejor que dos "trucos" que no necesitan ML.

- **Persistencia:** "mañana va a ser igual que hoy".
- **Climatología:** "mañana va a ser como fue en esta misma época del año marciano, en los años anteriores".

En Marte el clima es muy repetitivo, así que esos trucos ya aciertan bastante. Si el modelo no les gana, se usa el truco y se dice.

**Paso 1 — elegir el modelo (sin tocar la ventana final).** Validación cruzada por año marciano: se entrena con todos los años anteriores al corte menos uno, se prueba en ese año, y se repite con cada año. No se mezclan días del mismo año entre entrenamiento y prueba (los días vecinos se parecen demasiado y la nota saldría inflada).

**Paso 2 — examen final, una sola vez.** Con el modelo elegido se predice la ventana del 25/10 al 05/12/2025 y se compara con lo medido. Ese número es el que va al video.

**Métricas:**

| Para | Métrica | Qué significa |
|---|---|---|
| Valores (presión, temperatura, dosis) | **MAE** (error medio absoluto) | "En promedio le erramos por X °C / X Pa" |
| Valores | **Mejora sobre la climatología** = `1 − MAE_modelo / MAE_climatología` | 0 = igual que el truco; 0,2 = 20 % mejor; negativo = peor |
| Rangos (p10–p90) | **Cobertura** | Si decimos "80 % de probabilidad de que esté entre A y B", ~80 % de los días reales tienen que caer adentro |
| Alertas (B2, C1) | **Aciertos, falsas alarmas, no avisados, anticipación en horas** | Tabla simple de conteo, sin porcentajes engañosos si hay pocos casos |

Todo se guarda en `ml/artifacts/<modelo>/metrics.json` y se resume en `docs/ML_RESULTADOS.md` con la cantidad de casos de cada número.

---

## 8. Salida para la app (borrador de contrato)

Archivo por sol de la ventana: `data/processed/ml/forecasts/sol_<NNNN>.json`. Borrador en `contracts/forecast.example.json` (**v0, a acordar con P1 y P2**):

```json
{
  "schema_version": 0,
  "fixture": false,
  "mode": "hindcast",
  "cutoff_utc": "2025-10-25T00:00:00Z",
  "issued_for_sol": 4705,
  "forecasts": [
    {
      "variable": "pressure_pa",
      "target_sol": 4706,
      "lead_sols": 1,
      "p10": 870.1, "p50": 874.3, "p90": 878.0,
      "observed": 875.0,
      "baseline_climatology": 872.0,
      "model_id": "A1_ridge_v1",
      "provenance": { "class": "atmosferica", "mission": "MSL", "instrument": "REMS", "kind": "modelado", "origin": "cache", "product": "ml/A1", "fetched_at": "2026-11-14T00:00:00Z" }
    }
  ],
  "skill_summary": { "pressure_pa": { "mae": 2.1, "mae_climatology": 3.4, "skill": 0.38, "n": 40 } }
}
```

Los valores del ejemplo son inventados (por eso es `example`). `observed` va `null` si no hay medición. Nombres de variables en SI con la unidad en la clave (`_pa`, `_c`, `_mgy`).

---

## 9. Honestidad (ajuste a la regla 7 de `CLAUDE.md`)

La regla actual dice que REMS nunca se presenta como "pronóstico". Se propone este agregado (⚠️ **lo confirma el equipo**):

> Las predicciones de `ml/` se muestran como **"predicción del modelo (simulación histórica)"**, con `kind: "modelado"`, su fecha de corte y su error medido. REMS sigue siendo una observación histórica: nunca "clima actual" ni "tiempo real".

Además:
- Nunca mostrar una métrica sin la cantidad de casos (`n`).
- Si un modelo no supera la climatología, se muestra la climatología y se dice.
- El caso DONKI–MAVEN del 29/10/2025 no es una prueba de que el sistema "acierta".
- No usar `atmo_opacity` como polvo; no inventar viento ni humedad.

---

## 10. Referencia: amanecer y atardecer con `marstime` (validado)

```python
import math
import marstime

GALE_LAT_DEG = -4.59

def sun_times_lmst_min(utc_noon_ms: float, h0_deg: float = 0.0):
    """Sunrise/sunset in local mean solar minutes since midnight (Gale). Error vs REMS ~0.5 min."""
    ott = marstime.j2000_offset_tt(marstime.julian_tt(marstime.julian(utc_noon_ms)))
    ls = marstime.Mars_Ls(ott)
    decl = math.radians(marstime.solar_declination(ls))
    eot_deg = marstime.equation_of_time(ott)  # degrees; 15 deg = 1 h
    phi = math.radians(GALE_LAT_DEG)
    cos_h = (math.sin(math.radians(h0_deg)) - math.sin(phi) * math.sin(decl)) / (math.cos(phi) * math.cos(decl))
    h = math.degrees(math.acos(cos_h)) / 15.0
    return (12 - h - eot_deg / 15.0) * 60, (12 + h - eot_deg / 15.0) * 60
```

---

## 11. Tareas (para agregar a `docs/TAREAS.md` como sección ML)

Prioridad y orden. Cierre de funciones nuevas: **domingo 14:00**.

| ID | Prio | Tarea | Cierre |
|---|---|---|---|
| ML-00 | P0 | Estructura `ml/`, `requirements.txt`, `config.py`, README | `python -m ml.<algo>` corre desde la raíz |
| ML-01 | P0 | `sources/rems.py` + `sources/waypoints.py` con caché | Los dos crudos en `data/raw/ml/` |
| ML-02 | P0 | **DS-W** (`daily_weather.parquet`) con Ls, año marciano, `dtr_c`, elevación y presión corregida | Tabla con conteo de faltantes por columna; rango exacto de soles de la ventana de prueba |
| ML-03 | P0 | Baselines (persistencia y climatología por Ls) + validación por año marciano + métricas | `metrics.json` de los baselines |
| ML-04 | P0 | **A1 presión** | Métricas vs. baselines en validación y en la ventana final |
| ML-05 | P0 | **A2 temperatura con cuantiles** | Métricas + cobertura del p10–p90 |
| ML-06 | P0 | `export/` + `contracts/forecast.example.json` (borrador) | JSON por sol de la ventana; P1 y P2 avisados |
| ML-07 | P1 | `sources/rad.py`: **leer un CDF y reportar variables, unidades y calidad** antes de seguir | Informe en `docs/ML_RESULTADOS.md` |
| ML-08 | P1 | **DS-R** + **B1 dosis de fondo** (con S6 manchas solares) | Métricas vs. media móvil |
| ML-09 | P1 | **DS-S** (DONKI 2013–2025 en tramos de 60 días) + **C1 evaluación** contra MAVEN (horario) y RAD | Tabla de aciertos, falsas alarmas y error en horas, con `n` |
| ML-10 | P2 | B2 eventos, D-proxy polvo, C2 corrección de DONKI, A3 UV | Solo si ML-00 a ML-09 están cerrados |
| ML-11 | P0 | `docs/ML_RESULTADOS.md`: números finales para el video, con `n` y limitaciones | Revisado por otro integrante |

---

## 12. Riesgos

| Riesgo | Respuesta |
|---|---|
| Los CDF de RAD no traen dosis diaria directa o vienen con muchos flags | Reportarlo (ML-07) y bajar B1 a P2. A1–A2 no dependen de RAD |
| MAVEN pesa demasiado | Bajar solo ±3 días alrededor de cada llegada predicha + algunos días tranquilos como referencia |
| El modelo no le gana a la climatología | Se usa la climatología, se informa. Sigue siendo un resultado honesto y útil |
| La red falla durante la demo | Las predicciones del hindcast están precalculadas en `data/processed/ml/forecasts/` |
| Conflicto con otras ramas | Solo se tocan `ml/`, `data/raw/ml/`, `data/processed/ml/`, `docs/ML_*` y el borrador nuevo de contrato |
