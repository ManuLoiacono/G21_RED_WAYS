# Tareas — G21 RED WAYS (Marswalk en Gale)

Fuente: plan v1.1 (`docs/PLAN_DESARROLLO_MARSWALK_GALE.md`). Contexto general: `CLAUDE.md`.

**Regla de orden:** cada persona termina sus **P0** antes de pasar a P1. Si alguien se libera, ayuda con los P0 de otro antes de abrir sus P1. Las P2 solo se abren si la integración I2 funciona y no hay bloqueos de P0.

**Prioridades:** P0 = entrega mínima funcional · P1 = objetivo de producto · P2 = ampliación.

Para trabajar con Claude Code: pedir una tarea por ID («hacé P2-02») y mantener actualizado su estado en este archivo (`[ ]` pendiente · `[~]` en curso · `[x]` hecha).

---

## T0 — Los tres juntos (primeros 30–45 min) · P0

- [ ] **T0-01 Contratos v1.** Revisar y acordar los borradores de `contracts/`: manifiesto de parcela, pedido y respuesta de planificación, procedencia, punto de interés, escenario ambiental. A redacta el formato de datos, B el de planificación y C confirma que puede consumirlos.
  *Cierre:* los tres interpretan los mismos puntos, unidades y estados; `contracts/` marca `version: 1`.
- [ ] **T0-02 Fixture compartido.** Grilla sintética chica + respuesta de planificación de ejemplo, ambas marcadas como fixture y según el contrato.
- [ ] **T0-03 Repositorio.** Ramas por persona, regla de `main` siempre arrancable, horario de integraciones (cada 60–90 min).

---

## Persona 1 — Visualización y app (`app/`)

| ID | Prio | Tarea | Criterio de cierre | Depende de |
| --- | --- | --- | --- | --- |
| [x] P1-01 | P0 | **Escena Cesium de Gale.** La base ya está en `app/`. Poner el token en `.env`, verificar la carga, ajustes de calidad (liviano/equilibrado/presentación), cámara, «restablecer vista», selección de puntos | La escena carga en la máquina del equipo; la ruta fixture queda apoyada sobre el terreno; se cambia de ajuste sin errores | Token de ion |
| [~] P1-02 | P0 | **Preparación de misión:** plantilla (4 familias), destino, tareas con duración, parámetros del perfil, preferencias (tiempo/esfuerzo/enlace), hora de salida y sol; botón «restaurar valores» | Lo que se cambia en la UI viaja en el `plan_request` (verificable en la red) | T0-01 |
| [~] P1-03 | P0 | **Resultados y comparación:** tarjetas por alternativa (tiempo total, distancia, desnivel, margen de retorno, restricciones), estados (`viable_model`, `conditional`, `incompatible`, `insufficient_evidence`), motivo del rechazo, alternativa seleccionada | Con el fixture se ve un caso viable y uno rechazado con su motivo; no hay porcentajes de éxito | T0-01, T0-02 |
| [ ] P1-04 | P0 | **Parcela real:** centrar en la parcela de P3, base y destinos, rutas reales de P2 con `clampToGround`, capas de pendiente y «sin datos» | Los puntos de control de P3 coinciden en pantalla; la ruta no flota ni se entierra | P3-02, P2-06 |
| [~] P1-05 | P0 | **Procedencia bajo demanda:** botón ⓘ en capas y tarjetas + panel «Fuentes» plegable (clase, misión, instrumento, producto, en vivo/respaldo, fecha, tipo de sustento) | Nada técnico permanente sobre la escena; toda capa o regla tiene su ⓘ | T0-01 |
| [~] P1-06 | P0 | **Arranque y README:** instrucciones, mensajes de carga y error, arranque limpio | Otra persona levanta la app siguiendo el README | — |
| [ ] P1-07 | P1 | Dibujar el **área alcanzable** con retorno | Coincide con el cálculo de P2 | P2-07 |
| [ ] P1-08 | P1 | **Capas y modos:** selector de escenario ambiental, visibilidad hacia la base, capa THEMIS, modo a pie o con robot | Un cambio de escenario o modo produce un cambio explicable en el resultado | P2-08, P3-07, P3-08 |
| [ ] P1-09 | P1 | **Seguimiento simulado:** marcador que avanza sobre la ruta, pausa, evento, reevaluación y decisión; etiqueta «seguimiento simulado» | Secuencia reproducible avance → evento → nueva recomendación | P2-11 |
| [ ] P1-10 | P1 | Foto del destino (panorama de Curiosity verificado) | La foto corresponde al punto (fuente y sol visibles en ⓘ) | P3-10 |
| [ ] P1-11 | P2 | Modelos 3D de base y rover, pantalla de restricción dominante, chat con IA | — | P2-12 |

## Persona 2 — Motor de rutas y servicio (`engine/`, `service/`)

| ID | Prio | Tarea | Criterio de cierre | Depende de |
| --- | --- | --- | --- | --- |
| [ ] P2-01 | P0 | **Perfiles y plantillas:** parámetros comunes, 4 plantillas editables (observación geológica, exploración topográfica, reconocimiento, medición ambiental), validador; cada parámetro con valor y fuente (Apollo/análogo o hipotético) | Una configuración incoherente se rechaza con motivo | T0-01 |
| [~] P2-02 | P0 | **Grafo dirigido + Dijkstra:** 8 vecinos con numpy; coste por sentido (subir ≠ bajar); no crear aristas que violen restricciones; sin cortar esquinas bloqueadas; `scipy.sparse.csgraph.dijkstra` para ida y, sobre el grafo transpuesto, para vuelta | Mapa chico con resultado conocido; una barrera bloquea; subir y bajar dan costes distintos; origen sin datos devuelve motivo | T0-02 |
| [ ] P2-03 | P0 | **Servicio local:** `POST /plan`, `GET /parcel`; la grilla se carga una vez en memoria; «calcular» no consulta APIs externas | La app recibe una respuesta según el contrato | P2-02 |
| [ ] P2-04 | P0 | **Misión completa:** ida + tareas + vuelta + reserva vs. presupuesto; **regla de luz diurna** (fin ≤ atardecer del sol elegido → si no, `conditional` o «posponer»); distinguir «ruta incompatible», «no existe ruta en el modelo» y «búsqueda inconclusa» | Un destino alcanzable se rechaza al agregar tareas o al acercarse al atardecer; cambiar una duración mueve el margen de forma coherente | P2-02, P3-06 |
| [ ] P2-05 | P0 | **Alternativas y motivos:** criterios tiempo y esfuerzo (y enlace en P1), eliminar duplicados, ordenar, motivos generados desde métricas | Si solo hay una alternativa distinta, devuelve una; las restricciones se evalúan antes que las preferencias | P2-04 |
| [ ] P2-06 | P0 | **Parcela real + medición de tiempos** (integración I2) | Ruta real ida/vuelta sobre el DTM de Gale; tiempos registrados en `docs/` | P3-02 |
| [ ] P2-07 | P1 | **Área alcanzable** (ida + tareas + vuelta + reserva ≤ presupuesto) a partir de las dos corridas de Dijkstra | Devuelve una máscara o un contorno según el contrato | P2-04 |
| [ ] P2-08 | P1 | **Comunicación y escenarios:** interrupción total y máxima continua de visibilidad sobre cada ruta; reglas de escenario ambiental | Un escenario puede cambiar la viabilidad sin cambiar la geometría, y se informa así | P3-08, P3-09 |
| [ ] P2-09 | P1 | **Advertencia THEMIS** (material suelto, cualitativa) | La ruta que cruza la zona lo informa | P3-07 |
| [ ] P2-10 | P1 | **Robot de apoyo en marcha conjunta:** segundo perfil, compatibilidad de ambos, ritmo del conjunto | Las diferencias de resultado surgen de la configuración | P2-01 |
| [ ] P2-11 | P1 | **Reevaluación** desde una posición simulada con tiempo transcurrido y un evento (demora o bloqueo); no reiniciar la autonomía | La demora reduce el margen; la recomendación se explica | P2-04 |
| [ ] P2-12 | P2 | Restricción dominante y cambios admisibles, robot repetidor, explicación con IA | — | P2-05 |

## Persona 3 — Datos y contexto (`scripts/`, `data/`)

| ID | Prio | Tarea | Criterio de cierre | Depende de |
| --- | --- | --- | --- | --- |
| [ ] P3-01 | P0 | **Elegir la parcela** dentro del DTM `DTEEC_019698_1750_019988_1750_U01`: recorte (≤ ~3 km para usar celdas de 2 m), base hipotética, 3–5 destinos candidatos; revisar nodata y bordes; comprobar que hay corredores transitables | Hay caminos potenciales entre base y destinos; recorte documentado | — |
| [ ] P3-02 | P0 | **Paquete analítico:** leer la ventana del COG (rasterio, en vivo con copia guardada), elevación + máscara + pendiente a 1 m + resumen por bloque de búsqueda, manifiesto, función fila/col ↔ lat/lon | P2 y P1 leen el paquete; los puntos de control coinciden; script reproducible | P3-01 |
| [ ] P3-03 | P0 | **Control vertical:** muestrear ~20 puntos en el DTM y en Cesium (`sampleHeightMostDetailed`); registrar el desfase y su dispersión | Desfase documentado (esperado ~71 m ± <1,5 m); si varía mucho, revisar la alineación horizontal | P3-02, P1-01 |
| [ ] P3-04 | P0 | **`fetch_with_fallback(fuente)`:** consulta en vivo → si falla, última copia válida; devuelve dato + procedencia (`origin`, `fetched_at`, producto, URL) | Simulando un corte de red se usa la copia y se indica | T0-01 |
| [ ] P3-05 | P0 | **Destinos científicos** con ID, posición, título, familias compatibles, referencia y origen de la ubicación; los puntos hipotéticos van marcados aparte | GeoJSON/JSON en `data/processed/gale/` | P3-01 |
| [ ] P3-06 | P0 | **REMS + posición del rover por sol:** soles válidos, amanecer y atardecer para la regla de luz, temperaturas; faltantes conservados | P2 recibe el amanecer y el atardecer del sol elegido; la procedencia indica «medido por Curiosity en (lat, lon), sol X» | P3-04 |
| [ ] P3-07 | P1 | **Capa THEMIS nocturna** (MC-23) remuestreada a la grilla; regla cualitativa (percentil bajo de la parcela = posible material suelto) | Coincide con el terreno (revisar bordes visibles) | P3-02 |
| [ ] P3-08 | P1 | **Visibilidad geométrica** desde una antena o base hipotética (posición y altura declaradas, con curvatura) | Casos simples visibles/ocultos correctos; etiqueta «estimada» | P3-02 |
| [ ] P3-09 | P1 | **Dos escenarios ambientales** con efecto definido (junto con P2) | Cada escenario indica si es observado, modelado o hipotético | P3-06 |
| [ ] P3-10 | P1 | **Fotos de destino** verificadas (panoramas de Curiosity con sol y posición) | Correspondencia geográfica comprobada | P3-05 |
| [ ] P3-11 | P2 | RAD (dosis por duración), ventana solar fina con Horizons (vía servicio), CRISM | — | P3-04 |

---

## Integraciones

| Hito | Qué se une | Criterio |
| --- | --- | --- |
| I0 | Contratos + fixture (T0) | Los tres interpretan lo mismo |
| I1 | Parcela real de P3 + lector de P2 + escena de P1 | Base, destino y puntos de control coinciden |
| I2 | Formulario P1 + motor P2 + terreno real | Ida/tarea/vuelta con evaluación; un caso incompatible devuelve su motivo |
| I3 | Comparación explicada | La UI muestra solo lo calculado |
| I4 | Ambiente, comunicación, robot, evento | Cambio declarado → revisión trazable |
| I5 | Candidato a entrega | Arranque limpio + demo dentro de los 3 min del video |

**Cadena crítica:** parcela real (P3-02) → primera ruta real (P2-06) → flujo integrado (P1-04) → verificación y entrega.

## Cronograma de referencia

| Cuándo | Qué |
| --- | --- |
| Sábado, primeras 2–3 h | T0, P1-01/02, P2-01/02, P3-01/02 → I1 |
| Sábado tarde | P0 restantes → I2 e I3 |
| Sábado noche | P1 según avance → inicio de I4 |
| Domingo hasta 14:00 | I4 completo o reducción explícita de P1; **cierre de funciones** |
| Domingo 14:00–18:00 | Video de 3 min y documentación |
| Domingo 18:00–21:30 | Arranque limpio, revisión, carga |
| Domingo 21:30–23:59 | Solo incidencias de entrega |
