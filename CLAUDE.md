# CLAUDE.md — G21 RED WAYS (Marswalk, NASA Space Apps 2026)

Contexto para Claude Code y para el equipo. Leer completo antes de programar. Tareas detalladas: [`docs/TAREAS.md`](docs/TAREAS.md).

## 1. Qué estamos construyendo

**Desafío (NASA Space Apps, "Marswalk"):** *"create a layered, integrated view of a location or route on the Martian surface that pulls together data from multiple NASA science missions and could help a human explorer plan and carry out a successful Marswalk while conducting new and exciting science along the way."* La consigna sugiere *"at least three kinds of data… layered or combined in a way that provides helpful context for navigating"*.

**Nuestra POC:** una app web que muestra en 3D una parcela real del cráter **Gale** (zona de Curiosity, monte Sharp). Permite preparar una expedición humana a pie (o con robot de apoyo), compara rutas de ida, tarea y regreso, y explica por qué cada opción es viable, condicionada, incompatible o no evaluable. Los motivos salen de terreno, luz diurna, ambiente y comunicación.

**Recorrido de la demo:**
1. Explorar la parcela real y sus capas.
2. Elegir una familia de misión (4 plantillas), un destino y la preparación inicial.
3. Modificar parámetros y preferencias.
4. Comparar alternativas con ida, tareas, regreso y reserva.
5. Entender por qué una opción es aceptable, condicionada, incompatible o insuficientemente evaluable.
6. (P1) Simular el avance y un evento que obligue a reevaluar.

**Equipo y plazos:** 3 personas. Entrega: **domingo 15/11/2026 23:59 (ART)**. Entregables: código + video de hasta 3 min. **Domingo 14:00: cierre de funciones nuevas**; después, solo correcciones, video y entrega.

## 2. Decisiones cerradas (no reabrir sin una prueba que muestre un problema)

| # | Decisión |
| --- | --- |
| D1 | Visualización con **CesiumJS + Cesium Mars** (Cesium ion, asset `3644333`). **Sin `scene.verticalExaggeration`**: rompe la carga de teselas de este tileset |
| D2 | Cálculo sobre el **DTM HiRISE de 1 m** en su grilla nativa (metros). Las rutas se dibujan sobre Cesium con `clampToGround`. Cesium es solo visual |
| D3 | App web para navegador de escritorio, con vista adaptable tipo tablet. Sin app nativa |
| D4 | **Internet permitido.** APIs consultadas en vivo **con respaldo** (última respuesta válida guardada). Cada dato guarda su procedencia |
| D5 | **Servicio Python**: motor de rutas + intermediario para APIs sin CORS + caché |
| D6 | Motor: grafo dirigido de 8 vecinos + `scipy.sparse.csgraph.dijkstra`. Celda de búsqueda de 2 m (parcela ≤ ~3 km) o 4 m. Pendiente calculada a 1 m y resumida por bloque (máximo o p90) |
| D7 | Tres clases de datos en P0, cada una con un papel en la evaluación (topográfica, óptica, atmosférica), más una térmica en P1 (sección 6) |
| D8 | La procedencia de los datos se ve **solo si se pide** (botón ⓘ / panel «Fuentes» plegable). Nada técnico permanente sobre la escena |

## 3. Arquitectura y carpetas

```text
Navegador: app/ (persona 1)                  Servicio Python: service/ + engine/ (persona 2)
├─ CesiumJS + Cesium Mars (streaming ion)    ├─ POST /plan     motor sobre la grilla en memoria
├─ Preparación de misión / comparación       ├─ GET  /parcel   manifiesto + derivados de la parcela
└─ Lecturas directas (CORS OK)               ├─ GET  /env      REMS + posición del rover por sol
                                             ├─ GET  /proxy/*  PDS, PLACES, Horizons (sin CORS)
Datos: scripts/ + data/ (persona 3)          └─ caché: data/cache/ (última respuesta válida)
```

| Carpeta | Responsable | Contenido |
| --- | --- | --- |
| `contracts/` | Compartido; cada cambio se acuerda | Esquemas y ejemplos JSON de intercambio |
| `app/` | Persona 1 | Vite + TypeScript + CesiumJS. Ya funciona: `npm install && npm run dev` (ver `app/README.md`) |
| `engine/` | Persona 2 | Funciones puras: perfiles, grafo, búsqueda, evaluación |
| `service/` | Persona 2 | API HTTP local (framework a elección del equipo) |
| `scripts/` | Persona 3 | Preparación reproducible de datos (rasterio/numpy) |
| `data/fixtures/` | Persona 3 | Datos sintéticos para desarrollar (siempre marcados como fixture) |
| `data/processed/gale/` | Persona 3 | Paquete real reducido + manifiesto |
| `data/cache/` | Persona 3 | Respaldos de las APIs. No versionar archivos grandes |
| `docs/` | Compartido | Plan, cruce de recursos, brainstorming, tareas, fuentes, guion del video |

**Reglas de trabajo en paralelo:**
- Cada uno trabaja en su carpeta, en ramas cortas. `main` siempre arranca.
- Integración cada 60–90 min.
- El motor corre sin navegador; la app funciona sin el motor (con fixtures que respetan el contrato); los datos se pueden inspeccionar sin abrir la app.
- Una entrega está terminada cuando su consumidor la pudo usar, no cuando corre en la máquina del autor.

## 4. Datos y fuentes verificadas (14/11/2026)

### Terreno (topográfico, analítico)
- STAC USGS: `https://stac.astrogeology.usgs.gov/api/` (colección `mro_hirise_socet_dtms`). CORS OK.
- **DTM candidato de Gale** (cubre la última posición de Curiosity, sol 5073, en 137,3889°E −4,8260°): `https://astrogeo-ard.s3-us-west-2.amazonaws.com/mars/mro/hirise/controlled/dtm/ESP_019698_1750_ESP_019988_1750/DTEEC_019698_1750_019988_1750_U01.tif`
  - COG, 266 MB, 7426×18270, float32, teselas 512, DEFLATE con **predictor 2**, 6 overviews.
  - Esfera Mars 2015, equirectangular, `clon = 0`, R = 3 396 190 m, 1,0117 m/px.
  - Nodata `-3.40282265508890445e+38`.
  - Esquina superior izquierda: x 8 139 139,29, y −280 315,58. Cobertura aproximada: 137,312–137,439°E y −4,729 a −5,041°.
- DTM alternativo que también cubre a Curiosity: `DTEEC_009149_1750_009294_1750_U01`.
- **Ortoimágenes:** el asset principal de `DTEEC_019698` es `IRB` (falso color; franja angosta). Para control de puntos usar la imagen **RED** (escala de grises) si existe en los assets del ítem: **verificar en el STAC**. La visual la pone Cesium.
- **Longitud este positiva**, latitud planetocéntrica. Distorsión E–O en Gale ≈ 0,35 %: declararla, no reproyectar.

### Visual
- Cesium Mars: asset ion `3644333` (3D Tiles). En Gale carga hasta un error geométrico de ~2,5 m.
- **Desfase vertical:** alturas de Cesium ≈ `elev_geoid` + ~71 m (medido: +70,2 a +71,5 m; el 14/11, 71,2 ± 0,3 m en 20 posiciones de Curiosity). No mezclar alturas sin corregir. Para dibujar, usar `clampToGround` (sirve para polilíneas; con el globo oculto no sirve para puntos ni etiquetas).
- **Registro DTM ↔ Cesium Mars ↔ Curiosity (medido el 14/11 en la parcela):** no coinciden en planta.
  - Cesium Mars ≈ DTM movido −25 m E, +35 m N y +56,2 m en altura (144 puntos, residuo 0,9 m).
  - Posiciones de Curiosity ≈ DTM movido ~−43 m E, +33 m N; `elev_geoid` ≈ DTM − 17,9 m (563 puntos).
  - Lo que esté en coordenadas del DTM (rutas del motor) debe moverse igual para dibujarse sobre la escena. Ver `scripts/README.md`.
- **Latitudes en Cesium:** `Ellipsoid.MARS` es achatado, pero `fromDegrees(lon, lat, h, Ellipsoid.MARS)` con la latitud tal como viene en los datos cae en el lugar correcto del tileset (verificado con las posiciones de Curiosity). **No convertir** de planetocéntrica a geodésica: correría todo ~3,3 km.
- Ajustes de calidad medidos en una GTX 1050 Ti a 1600×900, render puro:
  - Liviano: ~3,5 ms por cuadro.
  - Equilibrado (SSE 6, sombras 2048): ~10 ms.
  - Presentación (SSE 4, sombras 4096): ~18 ms.

  Medir de nuevo en la máquina de presentación, con la pestaña visible.

### Ambiente (atmosférico)
- **REMS JSON:** `https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json` (CORS OK).
  - 4745 soles, del 1 al 4995 (del 07/08/2012 al 25/08/2026).
  - Campos útiles: `sol`, `terrestrial_date`, `ls`, `min_temp`, `max_temp`, `pressure`, `local_uv_irradiance_index`, `sunrise`, `sunset`.
  - **`wind_speed` y `abs_humidity` vienen siempre `--`.** **`atmo_opacity` vale siempre `Sunny`: no usarlo como medición.**
  - Faltantes como `--`: no reemplazarlos por cero.
- **Posiciones del rover:** `https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json` (CORS OK). GeoJSON de 1389 puntos hasta el sol 5073, con `sol`, `lon`, `lat`, `elev_geoid`, `roll`, `pitch`, `tilt`, `dist_total_m`, `drive_type`. Endpoint interno sin contrato: guardar copia.
- Unir REMS con las posiciones por `sol` → «medido por Curiosity en (lat, lon), sol X».

### Térmico (P1)
- THEMIS, infrarrojo nocturno, MC-23 Aeolis (Mars Odyssey): `https://astrogeo-ard.s3.us-west-2.amazonaws.com/mars/mo/themis/controlled_mosaics/mc23_aeolis_nir/mc23_aeolis_nir.tif`
  - COG de 459 MB, 26674×17783, 8 bits, 100 m/px, CC0, predictor 2.
  - Origen 135°E, 0°.
  - **Producto cualitativo:** no son unidades de inercia térmica. Más oscuro de noche ≈ material más suelto (solo para advertir).

### Otras (CORS)
- **Directas desde el navegador:** pygeoapi de USGS, ODE REST, Trek WMTS (capa global).
- **Solo vía servicio (sin CORS):** PDS Search API, PLACES (`pds-geosciences.wustl.edu`) y JPL Horizons.
  - Horizons con observador en Marte: `CENTER='coord@499'`, `SITE_COORD='-lonE,lat,alt_km'` (la longitud este va **negativa**; verificado).
- Para archivos de `planetarymaps.usgs.gov`, usar la URL S3 directa (`asc-pds-services.s3.us-west-2.amazonaws.com/...`): la redirección falla por CORS.

## 5. Contratos (borrador v0 en `contracts/`, se acuerdan en I0)

Manifiesto de parcela · Elevación y grilla analítica · Coordenadas · Puntos de interés · Perfil y misión · Escenario ambiental · Pedido de planificación · Respuesta de planificación · Procedencia.

**Semántica fija:**
- **Unidades:** SI (metros, segundos, grados) con nombres explícitos (`slope_deg`, `duration_s`). Convertir a otras unidades solo en pantalla. No mezclar % y grados de pendiente.
- **Estados de evaluación:** `viable_model`, `conditional`, `incompatible`, `insufficient_evidence`. Errores técnicos y `search_inconclusive` van aparte.
- **Restricciones antes que preferencias:** un buen promedio nunca compensa una restricción incumplida. La respuesta distingue «restricción incumplida» de «preferencia desfavorable».
- **Procedencia de cada dato:** `class`, `mission`, `instrument`, `product`, `url`, `origin: live|cache`, `fetched_at`, `kind: observado|derivado|modelado|supuesto`.

## 6. Clases de datos y su papel (respuesta a la consigna)

| Clase | Fuente | Papel en la evaluación | Prio |
| --- | --- | --- | --- |
| Topográfica | DTM HiRISE (MRO) | Costes, pendientes, restricciones, visibilidad, ida/vuelta | P0 |
| Óptica | HiRISE RED (MRO) + imagen Cesium; fotos de Curiosity (MSL) | Destinos, puntos de control, foto de destino | P0 |
| Atmosférica | REMS (MSL) | **Regla de luz diurna:** salida + ida + tareas + vuelta + reserva ≤ atardecer del sol elegido. Temperaturas como condición de escenario (P1) | P0 |
| Térmica | THEMIS nocturno (Mars Odyssey) | Advertencia cualitativa de material suelto | P1 |
| Radiación / espectral | RAD (MSL) / CRISM (MRO) | Contexto de dosis / justificación científica | P2 |

## 7. Reglas de honestidad (obligatorias en código, UI y video)

- Etiquetar cada valor como **observado, derivado, modelado o supuesto/simulado**. Fixtures y respuestas simuladas se marcan como tales.
- **No mostrar porcentajes de éxito.** Explicar por categorías y motivos concretos.
- REMS es una **observación histórica** del rover: nunca «tiempo real», «clima actual» ni «pronóstico».
- La posición del astronauta es **simulada**. No hay GPS en Marte ni localización real.
- Visibilidad hacia la base: «visibilidad geométrica estimada». No es cobertura de radio.
- Parámetros del perfil humano: valores de referencia de Apollo o de análogos terrestres (gravedad, traje y terreno distintos), editables y citados. No son límites operativos para Marte.
- Un DTM de 1 m no detecta rocas chicas ni garantiza 1 m de precisión. Las trazas del rover no prueban que el paso sea transitable para una persona.
- Si solo hay una alternativa distinta, se muestra una. No fabricar rutas.

## 8. Convenciones

- Git: ramas `p1/...`, `p2/...`, `p3/...`; commits chicos; PR o merge con una revisión rápida de otro integrante; `main` siempre arranca.
- No versionar `.env`, tokens ni archivos multigigabyte (rasters completos). Sí versionar scripts, manifiestos, recortes reducidos y respaldos chicos.
- Token de Cesium ion: en `app/.env` (`VITE_CESIUM_ION_TOKEN`), restringido en ion a `assets:read`, al asset de Cesium Mars y a las URLs permitidas. Las demás claves van en variables de entorno del servicio.
- **Idioma del código: inglés, siempre.** Todo código que se escriba (identificadores, comentarios, docstrings, mensajes de log y de excepción, nombres de archivos y ramas nuevas) va en inglés. La documentación (`docs/`, README, este archivo) puede seguir en español.
  - **Textos de la interfaz:** nunca escritos directo en el código. Van al diccionario de `app/src/i18n/` (`es.ts` es la referencia; `en.ts` debe tener las mismas claves, lo verifica el compilador) y se usan con `t("clave")`. La app se muestra en español o inglés (selector ES | EN del HUD, sin recargar; `?lang=es|en`). Todo módulo nuevo que muestre texto debe volver a dibujarlo con `onLanguageChange`.
  - **Excepción: valores de los contratos.** Los valores que viajan entre app, motor y datos y están definidos en `contracts/` (`observacion_geologica`, `a_pie`, `destino`, `topografica`, `observado`, `menor_tiempo`, ids de tareas…) son datos acordados por el equipo y no se traducen en el código. Pasarlos a inglés es un cambio de contrato: se acuerda entre las tres personas.
- Python 3.10+ (numpy, scipy, rasterio). Node 18+ para la app.
- Cada entrega incluye cómo ejecutarla, un ejemplo de entrada y salida, sus limitaciones y la versión del contrato.

## 9. Documentos de referencia (`docs/`)

- `TAREAS.md`: tareas por persona, prioridades, criterios de cierre y dependencias. **Empezar acá.**
- `PLAN_DESARROLLO_MARSWALK_GALE.md` (v1.1): plan completo, cronograma, integraciones I0–I5 y riesgos.
- `CRUCE_BRAINSTORMING_RECURSOS.md` (v0.3): evidencia de cada fuente (pruebas E1–E21) y bloqueos.
- `BRAINSTORMING.md` (v0.7): definición funcional original.
