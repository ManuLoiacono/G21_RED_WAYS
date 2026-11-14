# Cruce brainstorming × recursos — NASA Marswalk

Paso 3 del proceso del equipo: revisar viabilidad de cada capacidad del brainstorming contra los recursos disponibles y las pruebas reales hechas.

- Creado: sábado 14 de noviembre de 2026, madrugada (hora de Argentina).
- Base: `BRAINSTORMING.md` v0.7 (§22 como columna vertebral), `CONTEXTO_HACKATON_Y_DATOS_PARA_CLAUDE.md`, `apis-nasa.md`, `apis-marte.md`, `CATALOGO_FUENTES_EXTERNAS_MARTE.md`.
- El brainstorming no se modifica. Este documento no elige región, motor ni alcance: entrega la evidencia para decidirlos en el paso 4.
- Las prioridades son una **propuesta** del asistente para ordenar el paso 4, no decisiones del equipo.

---

## 0. Cómo leer este documento

### Veredicto (¿se puede integrar en esta POC?)

| Veredicto | Significado |
| --- | --- |
| **Viable** | Insumo accesible y comprobado (o entrada declarada del escenario) e integración factible en el fin de semana. |
| **Mejorable** | Se puede hacer, pero con una limitación relevante (resolución, cobertura, actualidad, parámetros de otro contexto). Se indica qué la mejoraría. |
| **No viable (POC)** | Sin dato/modelo accesible o con esfuerzo que excede el plazo. Puede ser viable fuera de la hackatón. |
| **Pendiente** | Depende de una prueba que no se pudo hacer. Se indica cuál. |

### Sustento (¿de dónde sale el valor que muestra el sistema?)

| Sustento | Significado |
| --- | --- |
| **Observado** | Medición o producto de una misión (imagen, DTM, meteorología, posición de un rover). |
| **Derivado** | Calculado a partir de datos observados (pendiente desde DTM, visibilidad desde DTM). |
| **Modelado** | Sale de un modelo publicado (climatología, reanálisis, ecuación metabólica). |
| **Supuesto / simulado** | Entrada del escenario, declarada como tal (posición de antena, posición del astronauta, eventos). |

Una función puede ser **viable** con sustento **simulado**: por ejemplo, el seguimiento con posición simulada es viable, pero no es seguimiento real.

### Prioridad propuesta y dependencia

- **P0**: núcleo de la POC; sin esto no hay demo.
- **P1**: alcance principal si P0 sale a tiempo.
- **P2**: ampliación.
- **Depende de**: IDs de otras filas o bloqueos (B#) que deben resolverse antes.
- **Ev.**: referencia al registro de pruebas (sección 2).

---

## 1. Resumen ejecutivo

1. **Relieve e imagen de 1 m / 25 cm están resueltos en las dos regiones**, con acceso comprobado desde un navegador y valores leídos. Los DTM HiRISE del catálogo STAC de USGS son COG (Cloud Optimized GeoTIFF): se decodificó una tesela real de Jezero y otra de Gale y se calculó la pendiente. Es la base de casi todas las funciones.
2. **La región cambia la calidad de la demo más que su viabilidad.** En la muestra leída, el piso de Jezero es casi plano (pendiente p90 4,4°), mientras que la tesela de Gale es abrupta (p90 27,7°; 13 % de celdas >25°). En terreno plano, las rutas alternativas tienden a coincidir. Es una muestra de una tesela por región: confirma que hay que elegir el recorte por relieve, no que una región sea mejor.
3. **La meteorología observada actualizada solo es viable en Gale.** El JSON de REMS llega hasta el sol 4995 (25/08/2026) con temperatura, presión y UV, pero no trae viento ni humedad, y la opacidad vale siempre "Sunny". En Jezero, el JSON de MEDA termina en abril de 2024 y el servidor de datos de MEDA en PDS no respondió hoy.
4. **El viento, el polvo local y la visibilidad no tienen fuente observada utilizable a escala de caminata.** Si el ambiente debe cambiar la ruta, tendrá que hacerlo con escenarios declarados, apoyados en temperatura, luz solar y climatología.
5. **Comunicación local, seguimiento, reevaluación y perfiles son viables** porque se derivan del DTM o se declaran como supuestos. Su credibilidad depende de etiquetarlos bien.
6. **Los perfiles del astronauta solo tienen respaldo lunar o de análogos terrestres** (Apollo, pruebas con trajes Mark III, la prueba Walkback de 10 km). Sirven como valores iniciales citados, no como límites operativos para Marte.
7. **Arquitectura implícita:** varias fuentes clave (PDS Search API, PLACES y Horizons) no permiten llamadas desde el navegador por CORS. Hace falta un paso de preparación (script) que genere archivos estáticos; el navegador puede leer directamente los COG de S3, el STAC y los JSON de mars.nasa.gov.
8. **Mi propio entorno de ejecución** tiene la salida a internet bloqueada por política. Las pruebas se hicieron desde el navegador integrado de la computadora del equipo, lo que también vale como prueba de CORS realista.

---

## 2. Registro de pruebas (evidencia)

Fecha de todas las pruebas: madrugada del 14/11/2026. Origen: navegador integrado de la app de escritorio en la computadora del usuario, desde una página de origen neutro (`https://example.com`) para probar CORS, salvo que se indique "mismo origen".

> **Qué demuestra cada prueba.** "HTTP 200/206" solo demuestra acceso. Se indica aparte cuándo además se leyeron metadatos o valores. Ninguna prueba equivale a un terreno integrado en la aplicación.

| Ev. | Fuente / solicitud | Resultado | Qué quedó comprobado | Qué NO quedó comprobado |
| --- | --- | --- | --- | --- |
| E1 | Shell del entorno de Claude → todos los hosts | `403 request blocked: no rule allows host` | Límite **del entorno de Claude** (lista de hosts permitidos), no de las fuentes | — |
| E2 | `mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json` | 200, 603 KB, CORS OK | 708 puntos, soles 13→2022; último en 77,2332°E 18,4356°N; `dist_total_m` 45,2 km; campos `pitch`, `roll`, `tilt`, `elev_geoid` e `images` | Endpoint interno sin contrato de API; puede cambiar |
| E3 | `.../MSL/Layers/json/MSL_waypoints.json` | 200, 665 KB, CORS OK | 1389 puntos, último sol 5073 en 137,3889°E −4,8260°; 38,6 km recorridos; no trae `elev_radii` | Ídem |
| E4 | REMS JSON `rss/api/?feed=weather&category=msl` | 200, 1,73 MB, CORS OK | 4745 soles (1→4995; 07/08/2012→25/08/2026). Temperatura mín./máx., presión y UV con datos en unos 4718 soles. **Viento y humedad: siempre `--`. Opacidad: solo `Sunny` o `--`** | Calidad por sensor (está en PDS, no en el JSON) |
| E5 | MEDA JSON `category=mars2020` | 200, CORS OK | Solo 7 soles (1127–1133, abril 2024), con huecos | — |
| E6 | MEDA en PDS (`pds.nasa.gov/.../mars2020_meda-20260407/`) y `atmos.nmsu.edu` | Inventario leído (mismo origen); `atmos.nmsu.edu` falló desde el navegador (timeout, navegación rechazada) y desde la lectura web (robots) | El inventario de derivados lista 6767 productos hasta el sol 1726, de sensores PS, RHS, TIRS y otros | **No se leyó ningún CSV de MEDA.** Puede ser una caída temporal del host; reintentar |
| E7 | PLACES `best_tactical.csv` | Mismo origen: leído. Desde otro origen: **bloqueado por CORS** | 667 filas hasta el sol 1896 (directorio del 30/07/2026); columnas de lat./lon., elevación, roll/pitch/yaw y píxel en mapa y DEM | La columna `planetodetic_latitude` vale 18,346169209 en todas las filas vistas: **leer el SIS antes de usarla**; usar `planetocentric_latitude` |
| E8 | USGS STAC `stac.astrogeology.usgs.gov/api` | 200, CORS OK, búsquedas GET/POST | Hay DTM HiRISE 1 m en el delta de Jezero (2), **0 en la última posición de Perseverance** y 2 en la última posición de Curiosity. Hay DTM CTX 20 m en Jezero (24–30) y observaciones HiRISE (Jezero 148, Gale 154) | En Gale, la colección CTX devolvió 3296 coincidencias para un punto: **filtro espacial anómalo** en esa colección; filtrar del lado del cliente |
| E9 | COG DTM HiRISE Jezero `DTEEC_045994_1985_046060_1985_U01` (S3 `astrogeo-ard`) | 206 con rango, CORS OK | 157 MB; 6864×14175 float32; teselas 512, DEFLATE, predictor 2, 5 overviews; esfera Mars 2015, equirectangular. **Tesela decodificada:** elevación −2580,4 a −2570,4 m; pendiente p50 2,1°, p90 4,4°, p99 7,7°. Ortoimagen de 77 MB, 1,02 m/px, misma grilla | Ortoimagen de 25 cm en este ítem (hay otros assets); calidad en bordes |
| E10 | COG DTM HiRISE Gale `DTEEC_019698_1750_019988_1750_U01` | 206, CORS OK | 266 MB; 7426×18270; mismo formato. **Tesela decodificada:** −3194,4 a −3086,2 m; pendiente p50 10,3°, p90 27,7°; 13 % >25°. Ortoimagen color de 0,253 m/px, 3 bandas de 16 bits, 527 MB, COG | Si la tesela leída coincide con el sector de boxwork |
| E11 | COG DTM CTX (Jezero y Gale) | 206, CORS OK | 18–20 MB; 20 m/px; COG con overviews; cada ítem incluye `intersection_error` y `orthoimage` | El asset `intersection_error` no se leyó |
| E12 | Mosaico TRN Jezero (S3 `asc-pds-services`) | Listado S3 y rango 206, CORS OK | DTM mosaico de 1,84 GB: 21400×21488 float32 **sin teselas ni compresión**. Ortoimagen de 25 cm: 7,36 GB, BigTIFF sin teselas. 7 sub-DTM (C, CR N/S, DL, E, N, W) de 72 a 132 MB; el sub-DTM C (verificado) tiene teselas de 256, LZW, esfera Mars 2000 y nodata −32768 | La ficha USGS advierte calidad en el sector CR; sin revisar |
| E13 | DEM global MOLA–HRSC 200 m | URL S3 directa: 206. URL `planetarymaps.usgs.gov` → redirección que **falla por CORS** | 11,38 GB; 106694×53347 int16; sin compresión, una fila por franja; overviews en archivo `.ovr` externo de 3,8 GB | Recorte con GDAL `/vsicurl/` (no hay GDAL en el entorno de Claude) |
| E14 | JPL Horizons, observador en Marte (mismo origen) | Respuesta completa; **bloqueado por CORS** desde otro origen | `SITE_COORD='-77.45,…'` se interpreta como 282,55° oeste = **77,45°E**: el signo está confirmado. Devuelve azimut y elevación del Sol cada 3 h con marca diurna | Usa elipsoide geodético (3396,19/3376,2 km), distinto de la esfera de los DTM |
| E15 | ODE REST `oderest.rsl.wustl.edu/live2` | 200 JSON, CORS OK | El servicio responde. La consulta con `pt=DTMRDR` devolvió "Invalid IIPT" | Hay que descubrir los códigos válidos con `query=iipt` |
| E16 | PDS Search API `pds.nasa.gov/api/search/1` | Accesible (respuesta opaca), **bloqueada por CORS** | El host responde | Contenido no leído |
| E17 | USGS pygeoapi (Robbins, SIM3292) | 200, CORS OK | Robbins: Jezero mismo (47,5 km) en una caja de 1°; **0 cráteres** en cajas de ~20 km (catálogo ≥1 km). SIM3292: 3–4 unidades regionales por caja (escala 1:20M) | — |
| E18 | Mars Trek WMTS, capa global de sombreado MOLA | 200, CORS OK | GetCapabilities con CRS `EPSG::104905` y plantilla JPG | El nombre de la capa HiRISE de Jezero que se intentó no existía; capa regional sin identificar |
| E20 | Cesium Mars (asset ion 3644333) en Sandcastle, con el token de demostración de Sandcastle y un visor propio inyectado; prueba en Gale | Cargó y se renderizó | Es un tileset 3D Tiles (b3dm), no un *terrain provider*. Cerca de Curiosity (sol 5073) sirve teselas de profundidad 21 con error geométrico ~2,5 m. La traza MSL (300 puntos) se ajusta al terreno con `clampToGround`. `sampleHeightMostDetailed` en 60 puntos tardó 6,3 s. **Alturas Cesium − `elev_geoid` = +70,2 a +71,5 m** (mediana 71,0): offset casi constante, consistente con elipsoide vs. areoide | Detalle de la imagen a 25 cm (panel chico); FPS reales (el panel corría en segundo plano con dos visores: 2 FPS no es representativo); token propio del equipo; condiciones de uso |
| E21 | Cesium Mars en Gale: calidad visual y rendimiento. Visor propio a 1600×900 en la máquina del equipo (GTX 1050 Ti, Windows, WebGL2). Se midió el tiempo de render por cuadro con `render()` + `gl.finish()`, porque el panel estaba oculto y los FPS reales del navegador no son representativos | Funcionó | Por cuadro (FPS teórico): <br>• Sin ajustes, error de pantalla (SSE) 16: 3,5 ms (~286 FPS) <br>• Color + sol bajo con *shader* propio, SSE 6, MSAA 4: 5,1–5,8 ms (~175–197 FPS); 246 mil triángulos y 145–161 MB de texturas <br>• Lo anterior + sombras 2048: 10,1 ms (~99 FPS) <br>• SSE 4 + sombras 4096: 17,7 ms (~57 FPS) <br>• SSE 2: 17,4 ms (~57 FPS); 1,13 M triángulos, 338 MB de texturas, 24 s de carga <br>La textura trae relieve horneado; el *shader* propio (normales por derivadas + paleta + bruma) cambia mucho el aspecto. Las sombras necesitan ajuste de *bias* (si no, aparecen bandas). **La exageración vertical rompe la selección de teselas** (solo se cargan 2 teselas): no usarla con este tileset | FPS interactivos con transmisión de teselas mientras se mueve la cámara; desempeño en una tablet; uso sin conexión |
| E19 | Literatura de movilidad con traje (no es prueba de datos) | Fuentes NTRS/OSTI localizadas | Ver C3.1 | Ninguna mide caminatas en Marte |

**No probado en esta sesión** (siguen como documentados): Cesium Mars (requiere cuenta), extensión MSR 2025 de Jezero, mapa geológico SIM3464, CRISM, THEMIS, Mars Climate Database (MCD), OpenMARS/ARCO-Mars, MSL RAD, mosaico CTX de Murray Lab, SWIM y PLACES de Curiosity.

### Lectura de CORS (implicancia de arquitectura)

| Lectura directa desde el navegador (CORS OK) | Necesita paso de preparación o backend |
| --- | --- |
| COG en S3 (`astrogeo-ard`, `asc-pds-services`) con rangos; STAC USGS; JSON de mars.nasa.gov (recorridos, REMS, MEDA); pygeoapi; ODE; Trek WMTS (capa global) | PDS Search API; PLACES; Horizons; URLs `planetarymaps.usgs.gov` (usar la URL S3 directa); MEDA (`atmos.nmsu.edu`, hoy inaccesible) |

---

## 3. Matriz por capacidad (§22 del brainstorming)

### C1. Parcela marciana interactiva en 3D, con esfuerzo visual acotado

Origen: §2.15, §20, §21 y §22, fila 1.

| ID | Subfunción (origen) | Fuente / evidencia | Veredicto | Sustento | Prio | Depende de |
| --- | --- | --- | --- | --- | --- | --- |
| C1.1 | Elevación de alta resolución del recorte (§5, §20) | DTM HiRISE en COG del STAC (E9, E10); mosaico TRN y sub-DTM de Jezero (E12) | **Viable** | Observado | P0 | B1 |
| C1.2 | Ortoimagen coincidente con el DTM (§5) | Assets orto de cada DTM HiRISE, misma grilla (E9, E10); orto TRN de 25 cm (E12) | **Viable** | Observado | P0 | C1.1 |
| C1.3 | Escena 3D con parcela propia (malla + textura) (§20, vía 2) | COG leído y decodificado en el navegador (E9); Three.js, que el catálogo menciona junto a `3d-tiles-renderer` | **Viable** | — | P0 | C1.1, C1.2, B2 |
| C1.4 | Escena con Cesium Mars preparado (§20, vía 1) | Gale: cargado y con traza del rover ajustada al terreno (E20). Jezero: ficha 6 m / 20 m, sin probar | **Gale: viable** (falta medir FPS y nitidez de la textura) / **Jezero: mejorable** | Observado (producto de terceros) | P0 si se elige | B6, B8 |
| C1.5 | Contexto regional alrededor de la parcela (§20) | CTX 20 m COG (E11); MOLA–HRSC 200 m (E13); Trek WMTS (E18) | **Viable** | Observado | P1 | — |
| C1.6 | Exageración vertical solo en la visual, cálculos con la geometría física (§20) | Decisión de diseño | **Viable** | Supuesto (declarado en la UI) | P0 | C1.3 |
| C1.7 | Ruta ajustada al terreno, sin tramos flotantes (§20) | Muestreo del mismo DTM usado en el cálculo | **Viable** | Derivado | P0 | C4.1 |

Notas:
- **Facilidad de integración (lo que importa en el plazo):**
  - Los DTM del STAC son COG con overviews: se pueden leer por ventanas desde el navegador o con `rasterio`. Es lo más fácil.
  - Los sub-DTM TRN de Jezero tienen teselas pero no overviews internos verificados: conviene recortarlos con GDAL antes.
  - El mosaico TRN completo (1,84 GB) y la orto de 25 cm (7,4 GB) no tienen teselas: recortarlos remotamente baja filas completas. Usarlos solo si el recorte cae fuera de los DTM del STAC.
- **Resolución publicada vs. cobertura efectiva:** 1 m/px es la resolución de grilla, no la precisión vertical. Cada DTM HiRISE cubre una franja de unos 7×14–18 km, y el recorte debe caer dentro de una sola franja o mosaicar dos. Perseverance está hoy en el borde occidental, **fuera** de los DTM HiRISE del STAC: allí haría falta la extensión MSR 2025 (no probada).
- **C1.4:** si Cesium Mars sirve el detalle anunciado en Gale, reduce el trabajo de la escena. En Jezero (20 m de terreno) **no alcanza para la escala de caminata**, y la parcela propia es mejor. Hay que crear la cuenta y probar el token antes de elegir (B6). No implementar ambos motores (§20).

### C2. Caracterización mediante varias clases de datos

Origen: §1, §6 y §22, fila 2.

| ID | Subfunción (origen) | Fuente / evidencia | Veredicto | Sustento | Prio | Depende de |
| --- | --- | --- | --- | --- | --- | --- |
| C2.1 | Pendiente, ascenso y rugosidad por celda (§6) | Calculado desde la tesela real (E9, E10) | **Viable** | Derivado (no cuenta como otra clase de dato) | P0 | C1.1 |
| C2.2 | Celdas sin dato / desconocidas explícitas (§6) | nodata declarado en todos los COG leídos (E9–E13) | **Viable** | Observado | P0 | C1.1 |
| C2.3 | Calidad de evidencia por celda (§10) | `intersection_error` de los DTM CTX (E11, no leído); mosaico de confianza MSR (no probado) | **Mejorable** | Observado | P1 | C1.1 |
| C2.4 | Unidades geológicas a escala útil (§6, §11) | SIM3464 Jezero 1:75k (documentado, no probado); SIM3292 global (E17, demasiado grueso) | **Mejorable** (Jezero) / **No viable** a escala local (Gale con SIM3292) | Observado (interpretación) | P1 | B1 |
| C2.5 | Mineralogía orbital (§6) | CRISM (documentado; cubo sin elegir) | **Pendiente** | Observado | P2 | — |
| C2.6 | Térmico / inercia térmica (§6) | THEMIS 100 m (documentado) | **Mejorable** (100 m es gruesa para una caminata) | Observado | P2 | — |
| C2.7 | Fotos desde superficie para destinos (§1 de la consigna) | Campo `images` de los recorridos con panoramas (E2) | **Viable** | Observado | P1 | C3.3 |
| C2.8 | Meta de ≥3 clases y varias misiones (§1, §22) | Topográfico + óptico (MRO HiRISE/CTX), atmosférico (MSL REMS o M2020 MEDA), posiciones (rover). En Gale, la meta de 3 clases y 2+ misiones se cumple solo con lo comprobado. En Jezero, la clase atmosférica observada depende de B3; alternativa: térmica (THEMIS) o espectral (CRISM) | **Gale: viable / Jezero: mejorable** | Mixto | P0 | C1, C5 |

Notas:
- **No inflar la integración:** pendiente, rugosidad y visibilidad salen del mismo DTM. El DTM HiRISE está ajustado a MOLA (MGS), pero eso no convierte a MOLA en una capa independiente.
- La clase **térmica** (THEMIS, Odyssey) o **espectral** (CRISM, MRO) sumaría una misión o clase más, pero a 18–100 m solo sirve para describir el destino, no para la ruta.

### C3. Unas cuatro familias de misión con valores iniciales editables

Origen: §2.13, §7, §21.1 y §22, fila 3.

| ID | Subfunción (origen) | Fuente / evidencia | Veredicto | Sustento | Prio | Depende de |
| --- | --- | --- | --- | --- | --- | --- |
| C3.1 | Perfil del astronauta a pie: velocidad, pendiente y gasto (§7) | Literatura (E19), ver abajo | **Mejorable** | Supuesto con respaldo (lunar/análogo) | P0 | — |
| C3.2 | Perfil del robot de apoyo: pendiente admisible, velocidad, carga (§7) | Pitch, roll y tilt reales de Perseverance/Curiosity por tramo (E2, E3) como referencia de pendiente transitada | **Mejorable** | Supuesto con referencia observada | P0 | — |
| C3.3 | Destinos científicos georreferenciados (§11, §13) | Jezero: muestras de Perseverance (Herd et al. 2025, sin API), cruzables con PLACES/recorridos (E2, E7). Gale: boxwork y recorrido de Curiosity (E3) | **Viable** con carga manual | Observado (ubicación) + interpretación publicada | P0 | B1 |
| C3.4 | Cuatro familias con datos comunes y específicos (§21.1) | Geología (C2.4, C2.7), destino topográfico (C2.1), reconocimiento de una entrada (C1.1 + supuesto), observación ambiental (C5) | **Viable** como configuración; profundidad desigual entre familias | Mixto | P0 | C2, C5 |
| C3.5 | Parámetros editables con procedencia visible (§21.1) | Registro de origen por parámetro | **Viable** | Supuesto declarado | P0 | C3.1 |

Respaldo de C3.1 (sin convertirlo en límites marcianos):
- **Velocidad:** en Apollo 15 la marcha media pasó de ~1 a ~1,5 km/h en la EVA 1 y a ~2 km/h en la EVA 2, sobre la Luna con gravedad de 1/6. Una presentación de NASA de 2026 toma 2,2 mph (~3,5 km/h) como velocidad nominal máxima de Apollo.
- **Gasto metabólico:** las medias de Apollo 11–14 estuvieron entre unos 750 y 1120 BTU/h, contra un diseño del sistema portátil de soporte vital (PLSS) de 1200 BTU/h. Con traje Mark III, un tramo de 500 m al 30 % de pendiente llevó a picos de ~1650–1750 BTU/h (dos sujetos, en la Tierra).
- **Distancia de regreso:** la prueba Walkback evaluó 10 km de caminata de regreso con traje planetario, como supuesto heredado de Apollo.
- **Modelo:** el trabajo de NASA sobre planificación de travesías usa la ecuación de Pandolf (peso, carga, velocidad, pendiente y coeficiente de terreno) con correcciones de campo.
- **Condiciones que hay que conservar:** gravedad lunar o terrestre (no marciana, 0,38 g), pocos sujetos, trajes de prueba y terreno análogo. En la UI: "valor inicial de referencia (Apollo/análogo), editable".

### C4. Alternativas explicadas y preferencias del astronauta

Origen: §6, §10, §11, §21.2 y §22, fila 4.

| ID | Subfunción (origen) | Fuente / evidencia | Veredicto | Sustento | Prio | Depende de |
| --- | --- | --- | --- | --- | --- | --- |
| C4.1 | Coste de paso direccional entre celdas: distancia, ascenso, pendiente y tiempo (§6) | DTM 1 m (E9, E10) + perfil (C3.1) | **Viable** | Derivado + supuesto | P0 | C1.1, C3.1 |
| C4.2 | Restricciones obligatorias separadas de las preferencias (§6, §21.2) | Diseño del algoritmo | **Viable** | Supuesto declarado | P0 | C4.1 |
| C4.3 | Varias rutas distintas con fortalezas y límites (§11) | Pesos alternativos sobre la misma grilla; descartar duplicados | **Viable**, sujeto al relieve del recorte | Derivado | P0 | C4.1, B1 |
| C4.4 | Ida, tarea y regreso con presupuesto y reserva (§11) | Tiempo del perfil + reserva Walkback (C3.1) | **Viable** | Derivado + supuesto | P0 | C4.1 |
| C4.5 | Confianza por categorías (§10) | Evidencia (C2.2, C2.3), viabilidad, comunicación (C6) y sensibilidad (recalcular con ± velocidad) | **Viable** | Derivado | P1 | C2, C6 |
| C4.6 | Rutas por zonas con evidencia limitada (§11) | nodata y bordes de franja; `intersection_error` en CTX | **Mejorable** | Observado | P1 | C2.3 |
| C4.7 | Desvío científico opcional dentro del presupuesto (§11) | Destinos (C3.3) | **Viable** | Derivado | P1 | C3.3, C4.4 |

Notas:
- **Riesgo de demo, no de datos:** si el recorte es plano (como la tesela leída de Jezero), "más corta" y "más fácil" coinciden. Según §11 no hay que forzar tres líneas. Elegir un recorte con escarpe, borde del delta o pendiente de Mount Sharp (B1).
- **Pendiente al 30 %** (≈16,7°) aparece en la literatura de pruebas con traje. Puede ser una restricción inicial razonable, siempre etiquetada como supuesto.

### C5. Ambiente que puede modificar la recomendación (incluso posponer o declarar inviable)

Origen: §2.7, §2.8, §8 y §22, fila 5.

| ID | Subfunción (origen) | Fuente / evidencia | Veredicto | Sustento | Prio | Depende de |
| --- | --- | --- | --- | --- | --- | --- |
| C5.1 | Temperatura y presión por sol | Gale: REMS JSON hasta el 25/08/2026 (E4). Jezero: JSON solo de abril 2024 (E5); PDS derivado hasta el sol 1726 (E6, no leído) | **Gale: viable / Jezero: pendiente** | Observado (punto del rover, no por celda) | P1 | B3 si Jezero |
| C5.2 | Viento | REMS JSON vacío (E4); MEDA WS en PDS (no leído); MCD/OpenMARS (modelado, documentado) | **Mejorable** (solo modelado o escenario) | Modelado / supuesto | P2 | B3 |
| C5.3 | Polvo / opacidad | REMS sin valor útil (E4); climatología de Montabone y base MDAD (documentadas) | **Mejorable** (regional, por estación) | Modelado / observado regional | P2 | — |
| C5.4 | Luz solar y hora local; ventana diurna (§8) | Horizons, signo de longitud confirmado (E14); `marstime` sin red (documentado) | **Viable** con preprocesado | Modelado (efemérides) | P1 | B4 |
| C5.5 | Escenarios ambientales discretos: ahora vs. ventana favorable (§8) | Combinar C5.1, C5.4 y escenarios | **Viable** | Supuesto / simulado, etiquetado | P0 | C4 |
| C5.6 | Resultado "posponer" o "inviable" (§2.8, §7) | Reglas sobre restricciones y escenario | **Viable** | Supuesto declarado | P0 | C4.2, C5.5 |
| C5.7 | Efecto en energía o desempeño del perfil (§8) | Sin dato directo; regla declarada | **Mejorable** | Supuesto | P2 | C3 |

Notas:
- **Diferencia de región decisiva:** solo en Gale hay una serie local observada, actual y fácil de usar (temperatura, presión y UV). En Jezero, el ambiente observado depende de leer los CSV de MEDA en PDS (hoy inaccesibles) o de usar 2024.
- Ninguna fuente es **pronóstico**. La UI debe decir "reconstrucción del sol X" o "escenario hipotético" (§8).
- El índice UV y la temperatura sí pueden cambiar una decisión de forma explicable (por ejemplo, ventana térmica o de luz). El polvo y el viento solo como escenario.

### C6. Comunicación local con la base

Origen: §2.9, §9 y §22, fila 6.

| ID | Subfunción (origen) | Fuente / evidencia | Veredicto | Sustento | Prio | Depende de |
| --- | --- | --- | --- | --- | --- | --- |
| C6.1 | Visibilidad geométrica antena→celda (§9) | DTM (E9, E10) + posición y altura de la antena declaradas | **Viable** | Derivado + supuesto | P0 | C1.1 |
| C6.2 | Tramos sin enlace directo y su duración (§9) | C6.1 sobre la ruta + tiempos de C4 | **Viable** | Derivado | P0 | C6.1, C4.1 |
| C6.3 | Regla "obligatorio / preferible mantener enlace" por perfil (§9) | Configuración | **Viable** | Supuesto | P1 | C6.2, C3 |
| C6.4 | Cobertura RF real (potencia, frecuencia, pérdidas) (§9) | Manual de propagación de JPL (documentado), sin parámetros de equipo | **No viable (POC)** | — | — | — |
| C6.5 | Enlace con la Tierra (§9) | Fuera del alcance confirmado | **No viable (POC)** por decisión; posible como estado declarado | Supuesto | P2 | — |

Nota: la curvatura del planeta importa en la línea de vista a varios km (radio 3396 km). Incluirla es barato y evita un error conceptual.

### C7. Acompañamiento del recorrido y reevaluación

Origen: §2.12, §18, §21.3 y §22, fila 7.

| ID | Subfunción (origen) | Fuente / evidencia | Veredicto | Sustento | Prio | Depende de |
| --- | --- | --- | --- | --- | --- | --- |
| C7.1 | Fuente de posición simulada con calidad y antigüedad (§18) | Diseño | **Viable** | Simulado (etiquetado) | P0 | C4 |
| C7.2 | Recorrido de prueba realista (§18) | Trazas reales de los rovers con ritmo de sol a sol (E2, E3, E7) | **Viable** | Observado (rover, **no** astronauta) | P1 | B1 |
| C7.3 | Eventos: pérdida de enlace, localización degradada, cambio ambiental, bloqueo (§18, §21.3) | Simulación declarada | **Viable** | Simulado | P1 | C6, C5.5 |
| C7.4 | Reevaluar la ruta desde la posición actual (§21.3) | Recalcular C4 con nuevo origen y escenario | **Viable** | Derivado | P1 | C4, C7.1 |
| C7.5 | Última posición conocida en la base, con antigüedad, durante un corte (§18) | Diseño | **Viable** | Simulado | P1 | C7.1, C6 |
| C7.6 | Puntos de relocalización (§18) | Declarados en el escenario; posibles hitos visibles en la ortoimagen | **Viable** como supuesto | Supuesto | P2 | C1.2 |
| C7.7 | Localización real (odometría, SLAM, balizas) (§18) | Sin datos de un astronauta; precedentes de rover (MGL, KNaCK) | **No viable (POC)** | — | — | — |
| C7.8 | Interfaz HUD o tablet (§18) | Diseño | **Viable** | — | P1 | C7.1 |

### C8. Astronauta a pie o con apoyo robótico como foco

Origen: §2.5, §7 y §22, fila 8.

| ID | Subfunción (origen) | Fuente / evidencia | Veredicto | Sustento | Prio | Depende de |
| --- | --- | --- | --- | --- | --- | --- |
| C8.1 | Compatibilidad astronauta–robot: ruta admisible para ambos, pendiente y ancho (§7) | Dos perfiles sobre la misma grilla (C3.1, C3.2) | **Viable** | Derivado + supuesto | P0 | C3, C4 |
| C8.2 | Marcha conjunta vs. separada con punto de reunión (§7) | Dos rutas con restricción de encuentro | **Mejorable** (más algoritmo) | Derivado | P1 | C8.1 |
| C8.3 | Ancho de paso del vehículo (§6) | DTM de 1 m no resuelve rocas pequeñas | **Mejorable** (aproximar con ventana de pendiente) | Derivado | P2 | C1.1 |
| C8.4 | Transporte del astronauta en vehículo (§7) | Ejemplo del rover lunar de Apollo (LRV): velocidad efectiva vs. pendiente (abstract LPSC 2026, documentado) | **Mejorable** | Supuesto con referencia lunar | P2 | C3 |
| C8.5 | Robot sin astronauta (§7) | Extensión según el equipo | Ver §4 | — | P2 | — |

### C9. Conversación con IA de baja prioridad

Origen: §13, §21.4 y §22, fila 9.

| ID | Subfunción (origen) | Fuente / evidencia | Veredicto | Sustento | Prio | Depende de |
| --- | --- | --- | --- | --- | --- | --- |
| C9.1 | Explicar en lenguaje natural la comparación ya calculada (§13) | Requiere acceso programático a un modelo (no confirmado) | **Pendiente** | Generado sobre datos derivados | P2 | B7 |
| C9.2 | Explicación sin modelo: textos generados por reglas desde las categorías de C4.5 | Sin dependencias externas | **Viable** | Derivado | P1 | C4.5 |

---

## 4. Extensiones propuestas (§12) — evaluadas aparte

| Extensión | Insumos | Veredicto | Sustento | Aporte / esfuerzo | Depende de |
| --- | --- | --- | --- | --- | --- |
| Área alcanzable con la preparación actual (isócrona) | Misma grilla de costes | **Viable** | Derivado | Alto aporte visual; esfuerzo bajo una vez hecho C4.1 | C4.1 |
| Explicar la restricción dominante y qué cambio la destrabaría | Recalcular aflojando una restricción por vez | **Viable** | Derivado | Alto (es el diferencial "ayuda a decidir"); esfuerzo bajo-medio | C4.2 |
| Robot como repetidor en un punto estratégico | Visibilidad desde base + robot (C6.1 dos veces) | **Viable** | Derivado + supuesto | Medio-alto; esfuerzo bajo | C6.1 |
| Robot como reconocimiento previo de un sector con poca evidencia | Celdas nodata o de baja calidad + ruta del robot | **Viable** como simulación | Simulado | Medio; esfuerzo medio | C2.3, C3.2 |
| Comparación de ventanas de salida | C5.4 + C5.5 | **Viable** con escenarios | Modelado + supuesto | Medio; esfuerzo bajo | C5 |
| Replanificación ante bloqueo o demora | C7.3 + C7.4 | **Viable** | Simulado + derivado | Medio; esfuerzo bajo si C7.4 existe | C7.4 |
| Recorrido combinado: transporte, estacionamiento, tramo a pie y reunión | Perfil de vehículo hipotético | **Mejorable** | Supuesto | Medio; esfuerzo medio-alto | C8.4 |
| Robot sin astronauta | Perfil robot + tareas admitidas | **Mejorable** | Supuesto | Bajo para el foco humano; esfuerzo medio | C3.2 |

---

## 5. Posibilidades nuevas surgidas de los recursos (no entran automáticamente al alcance)

| ID | Posibilidad | Qué aporta | Esfuerzo | Evidencia | Recomendación |
| --- | --- | --- | --- | --- | --- |
| N1 | **Validar la pendiente del DTM contra el recorrido real del rover** (pitch, roll y tilt por punto vs. pendiente calculada) | Credibilidad: demuestra que el coste usado está anclado en terreno realmente transitado | Bajo-medio | E2, E3, E9, E10 | **Evaluar para P1**: argumento fuerte para el video |
| N2 | **Luz solar y sombras** (Horizons/`marstime` + DTM) | Restricción explicable (volver antes del ocaso; tramos en sombra) | Bajo (precalcular) | E14 | **Evaluar para P1**; refuerza C5 sin inventar meteorología |
| N3 | **Capa de calidad del DTM** (`intersection_error` de CTX; confianza MSR) | Llena la categoría "evidencia" con un dato publicado | Bajo | E11 (asset presente, no leído) | **Evaluar para P1** |
| N4 | **Panoramas del rover como fotos de destino** (campo `images`) | Contexto visual real en los puntos de interés (la consigna lo sugiere) | Bajo | E2 | **Evaluar para P1** |
| N5 | **Radiación medida en superficie (MSL RAD) + alertas MAVEN SEP** | Suma la clase "radiación" que pide la consigna, con datos de dos misiones | Medio (archivos CDF) | Documentado | Solo si se elige Gale (medición local); en Jezero sería extrapolación |
| N6 | **Climatología de tormentas (MDAD) por estación** | Fundamenta "posponer" con frecuencia histórica regional | Medio | Documentado | P2, para C5.3 |
| N7 | **Hielo subsuperficial (SWIM)** | Narrativa de recursos (ISRU) | Bajo | Documentado; ~3 km/px | Solo contexto; no cambia rutas |
| N8 | **AI4Mars** (clases de terreno en fotos de rover) | Tipo de suelo cerca del rover | Alto (17,8 GB) | Documentado | **No** para esta POC |
| N9 | **Cráteres de Robbins como obstáculos** | — | — | E17: 0 cráteres a escala de caminata | **Descartar** como obstáculo; solo contexto regional |
| N10 | **Mapa geológico global SIM3292** | Unidades a 1:20M | Bajo | E17 | Solo contexto; para Jezero preferir SIM3464 |
| N11 | **MMGIS como base de la aplicación** | Capas y medición ya resueltas | Alto (curva de aprendizaje) | Documentado | No, salvo que el equipo ya lo conozca |

---

## 6. Diferencias entre regiones (cuando cambia la conclusión)

| Dimensión | Jezero | Gale / Mount Sharp | Implicancia |
| --- | --- | --- | --- |
| DTM 1 m: resolución publicada | HiRISE 1 m (STAC + mosaico TRN) | HiRISE 1 m (STAC) | Igual |
| DTM 1 m: cobertura efectiva | Delta y piso: sí (2 DTM STAC + TRN). **Borde occidental, donde está hoy Perseverance: no** en STAC (falta la extensión MSR 2025, no probada) | La posición actual de Curiosity (sol 5073) está cubierta por 2 DTM | En Jezero, el recorte se limita al piso y al delta, salvo que la extensión MSR funcione |
| DTM: facilidad de integración | COG del STAC: fácil. Mosaico TRN: 1,84 GB sin teselas (preparación previa) | COG del STAC: fácil | Preferir los COG del STAC en ambas |
| Ortoimagen | 1 m en el ítem STAC probado; TRN de 25 cm en escala de grises sin teselas (7,4 GB) | **25 cm color COG** probado (527 MB) | Gale da mejor textura para la escena con menos trabajo |
| Relieve de la muestra | Plano (p90 4,4°) | Abrupto (p90 27,7°) | El recorte de Jezero debe incluir escarpe o borde del delta para que haya alternativas |
| Cesium Mars (documentado) | Terreno 20 m, imagen 6 m: insuficiente para caminata | Terreno 1 m, imagen 25 cm | La vía Cesium solo es competitiva en Gale |
| Meteorología observada | JSON abril 2024; PDS hasta el sol 1726, **host de datos inaccesible hoy** | REMS JSON hasta el 25/08/2026 (temp., presión, UV) | Gale tiene ambiente observado utilizable ya |
| Radiación en superficie | No hay medición local | RAD local (documentado) | Clase extra solo en Gale |
| Posiciones del rover | PLACES (sol 1896, CSV con CORS bloqueado) + recorridos (sol 2022) | Recorridos (sol 5073); PLACES MSL no probado | Ambas sirven para C7.2 y N1 |
| Contexto científico | Delta, muestras con designación publicada, mapa 1:75k | Boxwork y estratos de Mount Sharp; ejemplo de la consigna | Ambas defendibles |

**Lectura conjunta, sin elegir:** Gale reúne hoy más capacidades comprobadas con menos preparación: ortoimagen color COG, meteorología actual, relieve con alternativas y Cesium de alta resolución como opción. Jezero conserva mejor contexto de muestras y un mosaico propio, pero tiene dos pendientes (MEDA y cobertura del borde) y requiere elegir bien el recorte para que la comparación de rutas no sea trivial.

---

## 7. Bloqueos principales y pruebas pendientes (orden sugerido para el sábado temprano)

| ID | Bloqueo | Afecta | Prueba mínima para destrabar | Plan B |
| --- | --- | --- | --- | --- |
| B1 | **Recorte**: un sector de pocos km dentro de un solo DTM HiRISE, con ortoimagen, relieve que genere alternativas y destinos científicos | Casi todo | Leer 4–6 teselas del DTM candidato (código ya probado en E9/E10) y medir pendiente; marcar base y destinos | Mosaicar dos DTM; o recorte TRN en Jezero |
| B2 | **Herramientas de preparación en la máquina del equipo** (GDAL/rasterio; posible Windows) | C1, C2, C4, C6 | `gdalinfo /vsicurl/<COG>` y recortar una ventana a GeoTIFF/PNG o arreglo binario | Leer el COG en el navegador (`geotiff.js`), igual que en E9 |
| B3 | **MEDA inaccesible** (`atmos.nmsu.edu`) | C5 en Jezero | Reintentar un CSV derivado (PS o ATS) del inventario | JSON 2024 o escenario declarado |
| B4 | **CORS** de PDS API, PLACES y Horizons | C3.3, C5.4, C7.2 | Script que descargue y guarde JSON/CSV estáticos en el repo | `marstime` local para la luz solar; recorridos MMGIS en lugar de PLACES |
| B5 | **Parámetros del perfil** sin datos marcianos | C3, C4, C8 | Tabla de parámetros con fuente y condiciones | Valores redondos declarados como hipotéticos |
| B6 | **Cesium ion**: cuenta, token, detalle servido y condiciones de uso | C1.4 | Crear cuenta (decisión del equipo) y cargar Gale | Parcela propia con Three.js (ya probada a nivel de datos) |
| B7 | **Acceso programático a un modelo de IA** | C9.1 | Confirmar clave y coste | C9.2 por reglas |
| B8 | **Coherencia de referencias** (avance E20: en Gale, Cesium queda ~71 m por encima de `elev_geoid`, con dispersión de ~1,3 m; hay que restar un offset antes de mezclar ambas alturas): esfera Mars 2000 vs. 2015 (mismo radio, 3396190 m); elevaciones `elev_geoid` vs. DTM ajustado a geoide; Horizons geodético con elipsoide; columna anómala de PLACES | C1.7, C7.2, N1, N2 | Superponer 5 puntos de recorrido sobre el DTM y comparar elevaciones | Documentar la diferencia como incertidumbre |

---

## 8. Qué habilita este cruce para el paso 4

- **Decisiones que ya tienen evidencia:**
  - Motor: parcela propia viable (datos probados) vs. Cesium (pendiente B6).
  - Región: tabla de la sección 6.
  - Arquitectura: preparación estática + lectura directa de COG.
  - Meteorología: observada en Gale o escenario.
- **Núcleo candidato (P0)** con todo viable y sin dependencias externas no probadas: C1.1–C1.3, C1.6–C1.7, C2.1–C2.2, C2.8, C3.1–C3.5, C4.1–C4.4, C5.5–C5.6, C6.1–C6.2, C7.1 y C8.1.
- **Supuestos que deben verse en la UI:** perfiles, antena, posición simulada, eventos y escenarios ambientales.
- **No prometer:** cobertura RF, localización real, pronóstico, viento u opacidad local medidos, ni límites operativos de traje en Marte.

---

## 9. Fuentes adicionales consultadas en este cruce

- STAC USGS Astrogeology: `https://stac.astrogeology.usgs.gov/api/` (colecciones `mro_hirise_socet_dtms`, `mro_ctx_controlled_usgs_dtms`, `mro_hirise_uncontrolled_observations`).
- COG de ejemplo:
  - Jezero: `https://astrogeo-ard.s3-us-west-2.amazonaws.com/mars/mro/hirise/controlled/dtm/ESP_045994_1985_ESP_046060_1985/DTEEC_045994_1985_046060_1985_U01.tif`
  - Gale: `https://astrogeo-ard.s3-us-west-2.amazonaws.com/mars/mro/hirise/controlled/dtm/ESP_019698_1750_ESP_019988_1750/DTEEC_019698_1750_019988_1750_U01.tif`
- Listado S3 del mosaico TRN: `https://asc-pds-services.s3.us-west-2.amazonaws.com/?list-type=2&prefix=mosaic/mars2020_trn/HiRISE/`
- DEM MOLA–HRSC (URL S3 directa): `https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Mars/HRSC_MOLA_Blend/Mars_HRSC_MOLA_BlendDEM_Global_200mp_v2.tif`
- MEDA, inventario del release 15: `https://pds.nasa.gov/data/pds4/releases/atmos/mars2020_meda-20260407/`
- Releases de Mars 2020 y PLACES: <https://pds-geosciences.wustl.edu/missions/mars2020/> · <https://pds-geosciences.wustl.edu/missions/mars2020/places.htm>
- Movilidad y metabolismo con traje:
  - Prueba Walkback de 10 km: <https://corpora.tika.apache.org/base/docs/govdocs1/515/515870.pdf>
  - Velocidades en Apollo: <https://www.osti.gov/servlets/purl/7168757>
  - Metabolismo en Apollo y diseño del PLSS: <https://ntrs.nasa.gov/api/citations/19720019460/downloads/19720019460.pdf>
  - Mark III con pendiente del 30 %: <https://ntrs.nasa.gov/citations/20220009964>
  - Modelo de travesía con Pandolf: <https://ntrs.nasa.gov/api/citations/20240001423/downloads/IEEE%20EMBC%202024.pdf>
  - Presentación ICES 2026: <https://ntrs.nasa.gov/api/citations/20260005410/downloads/Mars_Mass_ICES2026_Presentation_Final.pdf>
  - Rover lunar de Apollo, velocidad vs. pendiente: <https://ntrs.nasa.gov/api/citations/20250011301/downloads/AsTrav_LPSC26_v1.docx>

## 10. Registro de cambios

### 2026-11-14 — v0.1
- Se crea el cruce con §22 como base, dividido en 9 capacidades y sus subfunciones, con trazabilidad a las secciones del brainstorming.
- Se separan veredicto y sustento, y se agregan prioridad propuesta y dependencias.
- Se registran 19 pruebas o evidencias, distinguiendo los límites del entorno de Claude (E1) de los de las fuentes (E6, E13, E16).
- Se comparan Jezero y Gale donde cambia la conclusión. No se elige región.
- Las extensiones (§12) y las posibilidades nuevas se evalúan aparte. Ninguna entra automáticamente al alcance.

### 2026-11-14 — v0.2
- Prueba de Cesium Mars en Gale (E20), tomada como ejemplo y no como decisión de región. Se actualizan C1.4 y B8.
- Se agrega un hallazgo para la arquitectura: Cesium Mars es una malla 3D Tiles. Sirve para la visualización; los cálculos siguen saliendo del DTM HiRISE.

### 2026-11-14 — v0.3
- Prueba de calidad visual y rendimiento de Cesium Mars en Gale (E21). Se registran presets medidos y el límite de la exageración vertical.
