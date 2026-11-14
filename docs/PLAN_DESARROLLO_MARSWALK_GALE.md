# Plan de desarrollo — Marswalk en Gale

Documento operativo para un equipo de tres personas. Versión 1.1 — 14 de noviembre de 2026 (madrugada). Los cambios respecto de la 1.0 están al final, en la sección 17.

### Decisiones técnicas cerradas en v1.1

| # | Decisión | Motivo / evidencia |
| --- | --- | --- |
| D1 | **Visualización con CesiumJS + Cesium Mars** (asset ion 3644333). Sin exageración vertical | Probado en Gale (cruce E20–E21): teselas de ~2,5 m de error geométrico y traza del rover ajustada al terreno. La exageración vertical rompe la carga de teselas |
| D2 | **Cálculo sobre el DTM HiRISE** (`DTEEC_019698_1750_019988_1750_U01` como candidato), en su grilla nativa en metros. La ruta se dibuja con `clampToGround` sobre Cesium | Cesium es una malla de visualización. Desfase vertical medido de ~71 m (casi constante): se controla, no se mezcla |
| D3 | **Plataforma:** app web para navegador de escritorio, con vista adaptable tipo tablet. Sin app nativa ni ejecutable | Cesium es nativo web; nada que instalar; enlace compartible |
| D4 | **Internet permitido.** APIs consultadas **en vivo con respaldo guardado**. El origen y la fecha de cada dato se pueden consultar en la UI | Las APIs pueden caerse (MEDA estuvo caída el 14/11). La demo no puede depender de una sola respuesta |
| D5 | **Servicio local en Python**: planificación + intermediario de las APIs bloqueadas por CORS (PDS, PLACES, Horizons) + caché | numpy/scipy para el motor; un solo servicio |
| D6 | **Motor de rutas:** grafo dirigido 8-vecinos + `scipy.sparse.csgraph.dijkstra`. Celda de búsqueda 2 m (parcela ≤ ~3 km) o 4 m. Pendiente calculada a 1 m y resumida por bloque (máximo o p90) | Medido con datos sintéticos: 2,25 M celdas → grafo 1,2 s; ida 0,8 s; vuelta 0,9 s. Con una corrida salen ida, vuelta y área alcanzable |
| D7 | **Tres clases de datos en P0, cada una con un papel en la evaluación**, más una cuarta en P1 (ver sección 3 bis) | Consigna: «at least three kinds of data… layered or combined… for navigating» |

## 1. Objetivo y decisiones de partida

Construir una POC que permita explorar una parcela real de Gale en 3D, preparar una expedición humana, comparar recorridos y entender si se puede completar la tarea y regresar bajo la configuración elegida. El sistema debe explicar restricciones, ventajas y limitaciones de la evidencia.

**Decisión confirmada del equipo: Gale es la región elegida.** La parcela exacta se evaluará al comenzar la jornada de desarrollo. El resto del equipo puede avanzar con un paquete de prueba compatible mientras se valida ese recorte. La evaluación es una tarea inicial del plan, no un requisito para poder redactarlo ni para iniciar todos los frentes.

Este plan integra el brainstorming v0.7, el cruce de recursos v0.3 (con las pruebas E20–E21 de Cesium) y la revisión posterior. Conserva la generalidad del modelo de misión y concreta una primera implementación. Las decisiones técnicas de este documento son propuestas operativas, modificables ante una prueba que demuestre un problema.

### Restricciones y cronograma conocidos

- Equipo: tres estudiantes de ingeniería, con ChatGPT y Claude como asistentes.
- Inicio de programación comunicado: sábado 14, 09:00. Este documento organiza el primer bloque efectivo de trabajo, al que el equipo se refiere como «mañana»; no desplaza el vencimiento.
- Entrega comunicada: domingo 15 de noviembre, 23:59, hora de Argentina.
- Entregables conocidos: código que sustente la solución y video de hasta tres minutos. Revisar en el portal los campos y formatos efectivos de entrega antes del cierre.
- La visualización debe resultar atractiva, interactiva e informativa, con esfuerzo de renderización acotado.
- El protagonista es el astronauta a pie o con robot de apoyo. Transporte y robot autónomo sin astronauta quedan como extensiones.
- La conversación con IA tiene baja prioridad. Las explicaciones básicas y el recorrido principal funcionan sin ella.

### Experiencia que buscamos demostrar

1. Explorar una parcela real y sus capas.
2. Elegir una familia de misión, destino y preparación inicial.
3. Modificar parámetros y preferencias.
4. Comparar las alternativas encontradas, con ida, tareas, regreso y reserva.
5. Entender por qué una opción es aceptable, condicionada, incompatible o insuficientemente evaluable.
6. Si el alcance principal está estable, simular el avance y un cambio que obligue a reevaluar.

Las cuatro familias de misión comparten el mismo motor. Las plantillas proponen tareas, herramientas y tiempos; no son cuatro aplicaciones distintas ni obligan a una única temática científica.

## 2. Organización de las tres personas

Asignar nombres a A, B y C al comenzar. Los roles son responsabilidades de entrega; se redistribuye trabajo cuando un frente termina una dependencia crítica.

| Frente y responsable | Objetivo | Áreas propias | Primer entregable | Apoyo posterior |
| --- | --- | --- | --- | --- |
| **A — Datos, terreno y contexto científico** | Entregar una parcela coherente, utilizable y documentada | Recorte, referencias, elevación, textura, derivados, fuentes, puntos científicos y observaciones ambientales | Paquete real de parcela v1 con manifiesto y ejemplo de lectura | Apoya a B en visibilidad y a C en puntos científicos, fuentes y narrativa |
| **B — Navegación y evaluación de misión** | Convertir terreno y configuración en rutas y razones verificables | Perfiles, restricciones, búsqueda, tiempos, retorno, alternativas, evaluación, reevaluación | Función de planificación sobre el paquete de prueba con salida JSON estable | Integra comunicación y escenarios; prueba casos críticos |
| **C — Aplicación, visualización e integración** | Hacer usable y demostrable todo el recorrido del producto | App web, 3D, selección de destinos, formularios, capas, comparación, seguimiento visual | Escena y flujo completo con datos de prueba | Integra datos reales y motor; prepara captura y recorrido de demo |

**Responsabilidades compartidas:** acordar contratos; revisar una entrega ajena; integrar; elegir el alcance final; preparar relato y entrega. C coordina la integración visual, pero A y B deben resolver los errores de sus propios paquetes y respuestas.

### Reglas para trabajar de verdad en paralelo

- Cada responsable trabaja en su carpeta; los contratos y archivos compartidos tienen un único editor por cambio.
- Entregar versiones pequeñas y ejecutables, no esperar al módulo completo.
- Las funciones de B deben ejecutarse sin navegador. La escena de C debe funcionar sin disponer todavía del buscador. Los datos de A deben poder inspeccionarse sin abrir la app.
- Usar datos sintéticos de prueba al comienzo, claramente identificados. Solo son una herramienta de integración: la demo principal debe usar la parcela real.
- Hacer integraciones breves cada 60–90 minutos o al cerrar un hito; no dejar la unión de todo para el domingo.
- Cada entrega incluye: cómo ejecutarla, ejemplo de entrada/salida, limitaciones y versión de contrato.
- Una tarea bloqueada no deja a una persona esperando: se toma su alternativa de prueba o una tarea independiente de su frente.
- Evitar refactorizaciones generales cuando otro frente está integrando. Cualquier cambio de contrato se acuerda y se prueba con sus consumidores.

## 3. Alcance por niveles

**P0 es la entrega mínima funcional. P1 es el objetivo de producto que buscamos completar. P2 son ampliaciones.** Una funcionalidad científicamente interesante no pasa a P0 por el solo hecho de tener una fuente disponible.

| Nivel | Incluye | Qué se pospone si falta tiempo |
| --- | --- | --- |
| **P0 — Flujo completo** | Parcela real 3D (Cesium); **tres clases de datos con papel en la evaluación**: topográfica (rutas), óptica (destinos y control) y atmosférica (ventana de luz diurna REMS); base/destino; cuatro plantillas editables sobre un motor común; perfil a pie; restricciones; ruta de ida y regreso; tareas/reserva; comparación cuando haya alternativas distintas; explicación básica; fuentes y supuestos visibles | Acabado visual avanzado, reproducción del recorrido y modelos complejos |
| **P1 — Objetivo principal** | Capa térmica cualitativa THEMIS (advertencia de material suelto); área alcanzable con retorno (casi gratis con D6); comunicación geométrica integrada; perfil humano con robot de apoyo conjunto; escenarios ambientales que afecten la evaluación; seguimiento simulado y un evento de reevaluación; indicadores de evidencia; foto de destino cuando se verifique | Más eventos, coordinación separada de agentes y métricas avanzadas |
| **P2 — Diferenciación adicional** | Análisis de restricción dominante y cambios admisibles; ventanas de iluminación; repetidor robótico; RAD si se valida; conversación con IA | Todo lo que requiera una nueva dependencia importante o cambie el motor cerca del cierre |

P0 ya debe explicar un rechazo y usar **tres clases de datos, cada una con un papel visible en la evaluación** (sección 3 bis). Si solo se consigue una ruta válida, se informa así; no se fabrican tres alternativas. La profundidad científica de las cuatro plantillas puede ser desigual y debe quedar documentada.

La clasificación P0/P1 organiza el orden de entrega; no revoca las capacidades acordadas. Cualquier reducción de P1 se registra como limitación de la POC.

## 3 bis. Clases de datos y su papel en la navegación

Respuesta a la consigna: *«at least three kinds of data… layered or combined in a way that provides helpful context for navigating»*. Cada clase tiene que **cambiar o justificar una decisión**, no solo mostrarse.

| Clase | Fuente en Gale (misión / instrumento) | Papel en la evaluación | Prio | Estado (cruce) |
| --- | --- | --- | --- | --- |
| **Topográfica** | DTM HiRISE 1 m (MRO / HiRISE) | Costes, pendientes, restricciones, visibilidad hacia la base, ida/vuelta | P0 | Leída y decodificada (E10) |
| **Óptica** | HiRISE RED en escala de grises (MRO) + imagen de Cesium; panoramas de Curiosity (MSL / Mastcam-Navcam) | Ubicar destinos y puntos de control; comprobación visual; foto de destino (P1) | P0 | Probado (E10, E2/E3) |
| **Atmosférica** | REMS JSON (MSL / REMS): temperatura mín./máx., presión, UV, **amanecer y atardecer** por sol | **Regla de luz diurna:** ida + tareas + vuelta + reserva debe terminar antes del atardecer del sol elegido. Las temperaturas se usan como condición del escenario (P1) | P0 (regla de luz) / P1 (escenarios) | JSON probado (E4) |
| **Térmica** | Mosaico infrarrojo nocturno de THEMIS, MC-23 Aeolis (Mars Odyssey / THEMIS), COG de 100 m/px, CC0, 459 MB | **Advertencia cualitativa** de material suelto (zonas más oscuras de noche) frente a material consolidado. Advierte, no fija umbrales | P1 | Tesela de Gale leída: valores con contraste (p10 71, p50 134, p90 222) |
| Radiación | MSL RAD | Dosis estimada de la caminata según su duración (contexto, no capa) | P2 | Documentado |
| Espectral | CRISM (MRO) | Justificación científica de destinos (arcillas y sulfatos) | P2 | Documentado |

Reglas:
- Hora de amanecer/atardecer de REMS: corresponde a la posición del rover en ese sol. Se asocia la posición con el JSON de recorridos MSL por sol. No es un pronóstico.
- THEMIS nocturno es un producto **cualitativo de 8 bits**: no son unidades físicas de inercia térmica. El producto cuantitativo (ISIS `.cub`, ~2,5 GB, exactitud absoluta ~20 %) queda como mejora posible.
- Las misiones base de Cesium (MGS/MOLA, Mars Express/HRSC, Viking) se citan como fuentes visuales, no como integración analítica.
- **Procedencia bajo demanda:** cada capa y cada regla guarda su clase, misión, instrumento, producto, fecha y si vino en vivo o del respaldo. La UI **no lo muestra por defecto**: se consulta con un botón de información (ⓘ) en la capa o en la tarjeta de evaluación, o en un panel «Fuentes» plegable. No hay textos técnicos permanentes sobre la escena.

## 4. Dependencias y puntos de integración

### Qué empieza inmediatamente en paralelo

| Momento | A — Datos | B — Motor | C — Aplicación |
| --- | --- | --- | --- |
| Después del acuerdo inicial | Evalúa recortes y prepara un paquete real | Implementa lectura y planificación usando paquete sintético | Construye escena, formularios y paneles usando paquete sintético y respuesta simulada |
| Al llegar el paquete real v1 | Comprueba alineación y añade contexto científico/ambiental | Cambia la entrada al paquete real y revisa conectividad | Cambia terreno y textura a reales sin rehacer la interfaz |
| Al llegar la primera ruta real | Prepara visibilidad y revisa cobertura de los destinos | Añade alternativas, retorno y razones | Integra respuesta real, rutas sobre terreno y comparación |
| Con el flujo completo estable | Añade contexto, trazabilidad y verifica capas | Añade apoyo robótico, escenarios y reevaluación | Añade progreso simulado, evento y presentación final |

### Integraciones obligatorias

| Hito | Qué se une | Criterio para cerrarlo | Quién participa |
| --- | --- | --- | --- |
| **I0 — Contrato de prueba** | Manifiesto + cuadrícula pequeña + petición/respuesta de ejemplo | A, B y C interpretan los mismos puntos, unidades y estados | Los tres; acuerdo breve al inicio |
| **I1 — Parcela real** | Datos de A + lector de B + escena de C | Base, destino y puntos de control coinciden; no hay inversión de ejes ni desplazamientos evidentes | A entrega; B y C verifican |
| **I2 — Primera misión** | Formulario de C + planificador de B + terreno real | Elegir destino produce ida/regreso y evaluación con tareas/reserva; un caso incompatible devuelve razón | B y C; A revisa coherencia |
| **I3 — Comparación explicada** | Alternativas, perfiles, preferencias y capas | La UI muestra lo calculado; no acepta violaciones por mejorar un promedio | B y C; A revisa fuentes |
| **I4 — Contexto y acompañamiento** | Ambiente, comunicación, robot de apoyo y evento | Un cambio declarado produce una revisión trazable; se conserva la distinción entre observado y simulado | Los tres |
| **I5 — Candidato a entrega** | App, código, documentación y video | Reproducción completa desde un arranque limpio y dentro del tiempo del video | Los tres |

La cadena crítica es **parcela real coherente → primera ruta real → flujo integrado → verificación y entrega**. Las demás tareas avanzan en paralelo alrededor de esa cadena.

## 5. Acuerdo técnico inicial: contratos antes de módulos

**Objetivo:** que cada persona pueda programar con autonomía. **Responsables:** los tres; A redacta el formato de datos, B el formato de planificación y C confirma que puede consumirlos. **Duración orientativa:** 30–45 minutos del primer bloque, con un paquete mínimo de ejemplo.

### Arquitectura inicial propuesta

```text
Navegador (app web, C)                     Servicio Python (B; A aporta fuentes)
├─ CesiumJS + Cesium Mars  ── streaming ion  ├─ /plan    motor scipy (D6) sobre grilla en memoria
├─ Formularios / comparación / paneles       ├─ /parcel  carga ventana DTM (COG) + derivados
└─ Lecturas directas con CORS OK:            ├─ /env     REMS + posición del rover por sol
   STAC USGS, COG S3, JSON mars.nasa.gov,    ├─ /proxy   PDS, PLACES, Horizons (sin CORS)
   pygeoapi, ODE, Trek WMTS                  └─ caché: última respuesta válida por fuente
```

- **Datos (A):** Python con rasterio/numpy. Lee **ventanas** de los COG en vivo (no hace falta bajar archivos multigigabyte) y guarda una copia de cada recorte usado. Si la instalación de rasterio bloquea, usar el lector de COG que ya funcionó en las pruebas (navegador, `geotiff.js`) o la máquina de un compañero.
- **Motor (B):** Python con funciones puras más un servicio HTTP sencillo (el framework que el equipo conozca). Grafo dirigido y `scipy.sparse.csgraph.dijkstra` (D6). La grilla de la parcela se carga una vez al abrirla; «calcular» no consulta APIs externas, para que responder no dependa de la red.
- **Interfaz (C):** app web con CesiumJS. Framework frontend: el que C maneje mejor. Se trabaja con dos ajustes de calidad medidos (cruce E21, GTX 1050 Ti a 1600×900):
  - **Equilibrado**, para el trabajo diario: SSE 6, *shader* de color + sol bajo, sombras 2048. ~10 ms por cuadro.
  - **Presentación**, para grabar el video: SSE 4, sombras 4096. ~18 ms por cuadro.
  - Ajustar las sombras con *bias* (sin ajuste aparecen bandas). No usar exageración vertical.
- **APIs (D4):** cada fuente externa pasa por una función común `fetch_with_fallback(fuente)` que devuelve el dato y su metadato de procedencia: `origin: live | cache`, `fetched_at`, producto y URL. Si la consulta en vivo falla, usa la última copia válida y lo indica.
- **Claves (D5):** el token de Cesium ion se restringe en la consola de ion al dominio de la app y al asset 3644333. Cualquier otra clave va en variables de entorno del servicio, nunca en el repositorio.
- **Publicación:** la app puede publicarse como sitio web una vez estable. El servicio Python puede quedar local para la demo y el video.

Son propuestas de implementación, no afirmaciones de que los entornos ya estén instalados o probados. **Pendiente antes de grabar:** leer los términos de uso del plan gratuito de Cesium ion y la atribución requerida.

### Contratos comunes v1

| Contrato | Campos mínimos / acuerdos | Productor → consumidores |
| --- | --- | --- |
| **Manifiesto de parcela** | `schema_version`, `parcel_id`, fuentes/productos, fecha de preparación, proyección, referencias horizontal/vertical, origen, extensión, unidades, tamaño de celda, filas/columnas, orden de filas, nodata, archivos y versiones | A → B y C |
| **Elevación y cuadrícula analítica** | Elevación física en metros, máscara de datos válidos, formato y tipo numérico explícitos. Lectura binaria con orden de bytes acordado o formato equivalente que ambos consumidores lean | A → B (C no necesita malla: usa Cesium; solo recibe derivados para pintar capas) |
| **Coordenadas** | Cálculo en la **grilla nativa del DTM** (equirectangular, esfera Mars 2015, R = 3 396 190 m, metros; sin reproyectar). Distorsión E–O en Gale ≈ 0,35 % (cos 4,8°), declarada en el manifiesto. Una sola función fila/columna ↔ lat/lon. Intercambio con Cesium y con fuentes en lat/lon. **Alturas:** la ruta se dibuja con `clampToGround`; el desfase DTM↔Cesium (~71 m) se mide por parcela como control, no se usa para el cálculo | A define → B y C aplican |
| **Procedencia** | `class` (topográfica/óptica/…), `mission`, `instrument`, `product`, `url`, `origin: live\|cache`, `fetched_at`, `kind: observado\|derivado\|modelado\|supuesto` | A y B producen → C lo muestra solo cuando se pide (ⓘ / panel Fuentes) |
| **Puntos de interés** | ID, posición, título, familia/tareas compatibles, referencia científica, imagen verificada si existe, calidad y origen de la ubicación | A → B y C |
| **Perfil y misión** | ID de plantilla, tareas/tiempos, equipo, autonomía temporal, reserva, modelo de velocidad, restricciones, modo a pie/apoyo, preferencias y escenario. Valor y procedencia de parámetros | B → C; A aporta referencias |
| **Escenario ambiental** | ID, fecha/sol, ubicación de observación, valores y unidades, nulos, tipo observado/modelado/supuesto, reglas de efecto y ventana de validez | A prepara contenido; B aplica → C muestra |
| **Solicitud de planificación** | Versión, `parcel_id`, origen, destino, configuración efectiva de misión/perfiles, escenario y preferencias | C → B |
| **Respuesta de planificación** | Estado, razones, alternativas encontradas, puntos ordenados de ida y regreso, métricas, presupuesto, restricciones evaluadas y pendientes, evidencia y versiones de entrada | B → C |

### Semántica que debe quedar fijada

- Usar metros, segundos y grados con nombres inequívocos; convertir a minutos/km en pantalla. Evitar mezclar pendiente en porcentaje y en grados.
- Diferenciar pendiente máxima del entorno y pendiente en la dirección de marcha. A puede exportar derivados; B calcula los costes direccionales.
- La malla visual puede simplificarse. El cálculo utiliza la geometría física y una resolución analítica declarada; la exageración vertical no afecta al motor.
- Un DTM de grilla de 1 m no garantiza precisión de 1 m ni detecta todos los obstáculos pequeños. El tamaño de la cuadrícula de búsqueda se decide según escala, estabilidad y rendimiento.
- Estados de evaluación: `viable_model`, `conditional`, `incompatible`, `insufficient_evidence`. Separar los errores técnicos y `search_inconclusive` de una incompatibilidad demostrada.
- En la respuesta, distinguir restricción incumplida de preferencia desfavorable. Informar qué se evaluó y qué no.
- Un ejemplo de respuesta simulada debe respetar exactamente el contrato real y estar identificado como fixture; no presentarlo como cálculo del motor.

## 6. Frente A — Datos, parcela y evidencia científica

### A1. Selección y validación de la parcela — P0

**Objetivo:** fijar un recorte de Gale que permita navegación y narrativa científica con datos coincidentes.

**Trabajo:** revisar el DTM HiRISE candidato y la ortoimagen que el cruce identifica; inspeccionar varias ventanas; verificar máscaras y bordes; ubicar una base hipotética y destinos. No exigir el sector de boxwork si su ubicación/cobertura no se confirma. Evaluar corredores conectados, no solo estadísticas de pendiente.

**Recursos de partida:** STAC USGS Astrogeology, colección `mro_hirise_socet_dtms`. DTM candidato `DTEEC_019698_1750_019988_1750_U01` (cubre la última posición de Curiosity, junto con `DTEEC_009149_1750_009294_1750_U01`). Aún falta el recorte integrado.

**Ortoimagen:** el asset principal de ese DTM es `IRB` (falso color, franja más angosta que el DTM). Como la visual la pone Cesium, A usa la imagen **RED** en escala de grises, que cubre toda la franja, solo para ubicar puntos de control y destinos. **Control vertical:** muestrear unos 20 puntos del recorte en el DTM y en Cesium y registrar el desfase y su dispersión (en E20 fue ~71 m ±0,7 m).

**Entrega:** extensión, referencias, base propuesta, destinos candidatos y paquete de terreno v1. Registrar fuente y una imagen de control para uso interno de los otros frentes.

**Cierre:** hay datos válidos y caminos potenciales entre puntos útiles; elevación e imagen coinciden; B y C pueden leer el paquete. Que una parcela tenga relieve atractivo no justifica aceptarla si deja todo bloqueado.

**Si falla:** mover o reducir el recorte dentro de Gale. Preferir un solo producto coherente antes de mosaicar o abrir otra región. B y C siguen con el fixture.

### A2. Preparación del paquete analítico y visual — P0

**Objetivo:** convertir archivos científicos en una entrada pequeña y reproducible para ambos consumidores.

**Trabajo:** leer la ventana del COG (en vivo, con copia guardada), conservar nodata, revisar unidades y georreferencias, preparar elevación y máscara, derivados básicos (pendiente a 1 m y su resumen por bloque de búsqueda) y manifiesto. **No hace falta textura propia:** la visual es Cesium.

**Entrega:** manifiesto, elevación, máscara y derivados; script reproducible que genera el paquete desde la URL del COG. Anotar resolución original y resolución de cada salida.

**Cierre:** puntos de control coinciden en B y C; no hay reflejos, rotaciones ni desplazamientos por referencias incorrectas. Resolver discrepancias sistemáticas antes de rutas y visibilidad. Guardar las versiones para poder reproducir el video.

### A3. Contexto científico, destinos y fotografías — P0/P1

**Objetivo:** que la ruta sirva para una tarea científica comprensible.

**Trabajo:** preparar pocos puntos verificables, con descripción y referencia; relacionarlos con las plantillas sin limitar el modelo general. Usar recorridos públicos de Curiosity como contexto histórico y comprobación de posición. Las trazas del rover no son posiciones humanas ni prueban transitabilidad humana.

**Recursos:** JSON de recorridos MSL citado en el cruce; materiales NASA sobre Gale/Curiosity; fotografías o panoramas cuya correspondencia geográfica se confirme. Las fotos son P1; destinos y referencias son P0.

**Entrega:** tabla/GeoJSON o JSON de puntos con ID estable y procedencia. Marcar por separado los puntos hipotéticos de escenario. No inventar una cueva para presentar una misión de reconocimiento: una plantilla puede existir sin disponer de un destino real de ese tipo en esta parcela.

### A4. Ambiente histórico y trazabilidad — P0/P1

**Objetivo:** aportar la clase atmosférica y un contexto temporal honesto.

**Trabajo:** seleccionar registros REMS válidos (consulta en vivo con respaldo); conservar fecha/sol, unidades y huecos. **Asociar cada sol con la posición de Curiosity** en el JSON de recorridos MSL, para mostrar «medido por Curiosity en (lat, lon), sol X». Separar observaciones de escenarios hipotéticos. La última fecha registrada por el cruce es 25/08/2026: no denominarla «tiempo real» ni «clima actual».

**Entrega P0:** contexto atmosférico atribuido **y amanecer/atardecer del sol elegido para la regla de luz diurna** (sección 3 bis), que B aplica. **Entrega P1:** dos escenarios con efectos definidos junto con B. No convertir una mínima/máxima diaria en una predicción horaria ni una medición puntual en un mapa meteorológico por celda.

No usar `Sunny` como medición de polvo u opacidad; no sustituir nulos por ceros. Si se utiliza UV para decisiones, revisar su definición/calidad; no equipararlo a la radiación ionizante de RAD.

### A5. Visibilidad geométrica — P1, después de A2

**Objetivo:** calcular obstrucción del terreno entre una antena/base hipotética y puntos de la parcela.

**Trabajo:** acordar posición y alturas de antenas, realizar pruebas de línea de vista e incluir curvatura cuando corresponda a la escala. Mantener un estado desconocido si faltan datos relevantes del perfil de terreno.

**Entrega:** capa o función de visibilidad más parámetros del escenario. A produce la geometría; B calcula tiempos de interrupción sobre cada ruta; C dibuja y explica.

**Cierre:** casos simples visibles/ocultos coinciden con el perfil geométrico. Etiqueta: «visibilidad geométrica estimada». No afirmar cobertura RF ni un enlace garantizado.

### A6. Capa térmica THEMIS — P1, después de A2

**Objetivo:** sumar la cuarta clase de datos (térmica) y la tercera misión (Mars Odyssey) con un papel en la navegación.

**Trabajo:** leer la ventana de la parcela en el COG del infrarrojo nocturno MC-23 Aeolis del STAC (`mo_themis_controlled_mosaics`, ítem `mc23_aeolis_nir`) y remuestrearla a la grilla de búsqueda. Definir con B una regla **cualitativa**: las zonas relativamente oscuras de noche (percentil bajo dentro de la parcela) se marcan como «posible material suelto» y generan una advertencia o un coste adicional declarado. No convertir los números de la imagen en inercia térmica física.

**Cierre:** la capa coincide con el terreno (revisar con bordes visibles); una ruta que cruza la zona marcada lo informa en su evaluación; la procedencia queda registrada.

## 7. Frente B — Motor de navegación y decisión

### B1. Perfiles, plantillas y reglas — P0

**Objetivo:** formalizar la preparación de misión sin depender de la parcela definitiva.

**Trabajo:** definir parámetros comunes, unas cuatro plantillas editables y tareas con duración. Familias iniciales orientativas: observación geológica, exploración topográfica, reconocimiento y medición ambiental; el equipo puede renombrarlas manteniendo el mismo contrato.

Separar preferencias modificables de restricciones de la configuración. Documentar valores de referencia de Apollo/análogo y valores hipotéticos. Que un estudio ensaye una pendiente no la convierte en límite de seguridad marciano. Las reglas de compatibilidad deben advertir cambios incoherentes.

**Entrega:** perfiles/plantillas en configuración y validador de misión. Para P0, implementar a pie; dejar la estructura de apoyo conjunto preparada. No dedicar tiempo a estimar oxígeno o metabolismo con precisión que el modelo no respalda.

### B2. Grafo de terreno y primera ruta — P0

**Objetivo:** encontrar un recorrido real compatible con el perfil.

**Trabajo:** leer cuadrícula, impedir cruces por zonas excluidas/nodata según política, construir vecinos y costes direccionales, calcular distancia/desnivel/tiempo y buscar. Evitar atravesar esquinas bloqueadas diagonalmente.

**Método propuesto (D6):** construir con numpy un grafo **dirigido** de 8 vecinos. El coste de cada arista depende del sentido (subir ≠ bajar). Las aristas que violan una restricción no se crean. Correr `scipy.sparse.csgraph.dijkstra`:
- desde la base sobre el grafo → **ida** a todas las celdas;
- desde la base sobre el grafo transpuesto → **vuelta** desde todas las celdas.

Con eso salen la ruta a cualquier destino, el regreso desde cualquier punto (para reevaluar) y el área alcanzable (ida + tareas + vuelta + reserva ≤ presupuesto). Celda de búsqueda: 2 m si la parcela mide hasta ~3 km, 4 m si es mayor. Medir el tiempo real en I2.

Si se combinan tiempo, esfuerzo y comunicación, normalizar los términos y documentar el significado de los pesos. La regla de restricciones opera antes de la preferencia: un promedio favorable no elimina una incompatibilidad.

**Entrega:** función pura de planificación con salida contractual, primero sobre fixture y luego sobre datos reales. B es responsable de la lógica; C de dibujarla.

**Cierre:** un mapa pequeño con resultado conocido funciona; una barrera bloquea el paso; los costes de subir/bajar pueden diferir; origen/destino fuera de cobertura reciben un motivo claro.

### B3. Misión completa: ida, tarea, regreso y reserva — P0

**Objetivo:** evaluar la expedición completa, no solo la llegada.

**Trabajo:** estimar ida y regreso según dirección, sumar tareas y reserva configurada, verificar autonomía. En el primer modelo, usar presupuesto temporal explícito. **Regla de luz diurna (P0):** la hora de salida más el total deben quedar antes del atardecer del sol elegido (dato de A4). Si no se cumple, el resultado es `conditional` o «posponer», con el motivo. Reservas de consumibles separados solo si hay un modelo adicional defendible.

La vuelta no se obtiene simplemente duplicando el tiempo de ida. Si un candidato incumple el presupuesto, comprobar otros candidatos pertinentes antes de concluir sobre toda la misión. Distinguir «ruta evaluada incompatible», «no existe ruta en este modelo» y «búsqueda inconclusa».

**Entrega:** métricas de ida/regreso, tarea, reserva, margen y razones por alternativa.

**Cierre:** un destino alcanzable puede rechazarse al añadir tareas o retorno; cambiar una duración modifica el margen de forma coherente. Para apoyo robótico, declarar qué contingencias se modelan; no prometer rescate o retorno a pie sin calcularlo.

### B4. Alternativas y explicaciones — P0/P1

**Objetivo:** apoyar una decisión entre opciones distintas.

**Trabajo P0:** buscar con prioridades de tiempo y esfuerzo; eliminar duplicados; ordenar alternativas aceptables y explicar fortalezas/limitaciones. Si solo hay una alternativa distinta, mostrar una. Las métricas básicas y razones no dependen de IA.

**Trabajo P1:** añadir criterio de comunicación y categorías separadas de evidencia, resolución y dependencia de supuestos. Si se prueba sensibilidad a velocidad o tiempos, indicar el intervalo ensayado; no convertirlo en probabilidad de éxito.

**Entrega:** comparaciones y textos por reglas a partir de métricas estructuradas. El motor debe devolver motivos; la UI no debe inventarlos.

### B5. Ambiente y reglas de comunicación — P1

**Objetivo:** permitir que las condiciones cambien la recomendación de forma trazable.

**Trabajo:** consumir escenario de A, aplicar reglas declaradas y evaluar interrupciones de visibilidad sobre las rutas. Acordar si la misión exige visibilidad continua o admite una duración máxima sin visibilidad estimada; esta última es una restricción acumulada que debe verificarse sobre la ruta.

Un escenario ambiental uniforme puede cambiar la ventana o viabilidad de toda la misión sin producir otra geometría de ruta. No forzar desvíos sin un mecanismo espacial/temporal explícito. La recomendación de posponer compara escenarios disponibles, no constituye un pronóstico.

**Entrega:** evaluación por escenario, motivos de cambio y métricas de interrupción total y máxima continua. Si no se implementa búsqueda con restricciones acumuladas, declarar que se verificaron los candidatos generados; no afirmar inexistencia global de una solución.

### B6. Astronauta con robot de apoyo — P1

**Objetivo:** que la configuración de equipo cambie el conjunto de rutas aceptables.

**Trabajo:** incorporar segundo perfil; en marcha conjunta exigir compatibilidad para ambos y respetar el ritmo del conjunto. Declarar qué aporta el robot, por ejemplo transporte de herramientas, sin atribuirle capacidades no implementadas.

**Entrega:** modo conjunto con restricciones y métricas explicadas. Las diferencias deben surgir de la configuración.

**Límite:** la estimación fina de ancho, estabilidad y obstáculos de ruedas no está resuelta por un DTM de 1 m. No certificar paso de un vehículo a partir de esa resolución. Marcha separada con reunión y transporte de personas son P2.

### B7. Reevaluación desde posición actual — P1

**Objetivo:** conectar planificación y acompañamiento durante la expedición.

**Trabajo:** aceptar posición simulada, tiempo transcurrido, tareas completadas y un evento. Recalcular opciones desde ese estado usando el presupuesto restante; no reiniciar la autonomía original al cambiar el origen.

**Primer evento recomendado:** demora durante una tarea o bloqueo declarado en un tramo. Elegir uno y completarlo antes de añadir otros.

**Entrega:** comparación antes/después, nueva ruta o recomendación de regreso/posponer lo pendiente. Ante insuficiencia de datos, mostrar el problema y conservar las restricciones.

**Cierre:** la demora reduce el margen; la restricción nueva afecta al sector correspondiente; la recomendación se explica. Conservar la ruta anterior como referencia visual si ayuda.

## 8. Frente C — Aplicación, 3D y experiencia

### C1. Esqueleto y escena — P0

**Objetivo:** contar pronto con una aplicación navegable sin esperar al motor.

**Trabajo:** organizar vista 3D central con CesiumJS + Cesium Mars (`Cesium.Ellipsoid.default = Cesium.Ellipsoid.MARS`), preparación de misión, capas y comparación. Para el desarrollo con fixture alcanza con dibujar la ruta simulada sobre Cesium: no hace falta terreno sintético. Implementar cámara orbital, zoom, restablecer vista y selección de puntos. Aplicar desde el inicio los dos ajustes de calidad (sección 5). El *shader* de color + sol bajo (cruce E21) puede reutilizarse como punto de partida.

**Procedencia bajo demanda:** botón ⓘ en cada capa y en cada tarjeta de evaluación, y un panel «Fuentes» plegable. Por defecto la escena muestra solo lo necesario para decidir.

**Entrega:** flujo de pantallas o paneles con datos de prueba y respuesta simulada contractual. Evitar pantallas decorativas que no participen del recorrido principal.

**Límites visuales:** sin fotogrametría global, avatares complejos, clima con partículas ni materiales de cine. Priorizar terreno legible, buena cámara, colores consistentes, etiquetas y rutas visibles.

### C2. Parcela real y capas — P0

**Objetivo:** visualizar exactamente el espacio usado por el motor.

**Trabajo:** centrar Cesium en la parcela de A; convertir coordenadas con el acuerdo común (lat/lon); dibujar rutas con `clampToGround`; mostrar escala, orientación y capas: pendiente y desconocido como clasificación sobre el terreno, y THEMIS en P1. **No usar exageración vertical** (rompe la carga de teselas de Cesium Mars).

**Entrega:** terreno real, base/destinos y conmutación de imagen, relieve/pendiente y datos desconocidos. El contexto atmosférico puede ser un panel atribuido; no tiene que ser un falso raster local.

**Cierre:** controles de posición acordados con A coinciden; una ruta de B se dibuja sobre el terreno sin flotar ni enterrarse; la escena funciona en el equipo de presentación **con la pestaña visible**. Medir allí la fluidez real, incluido el tirón al mover la cámara mientras cargan teselas; los valores de E21 son de render puro.

### C3. Preparación de misión y comparación — P0

**Objetivo:** expresar la configuración del astronauta y entender sus consecuencias.

**Trabajo:** seleccionar plantilla, destino, tareas, parámetros y preferencias; poder restaurar valores iniciales. Enviar la solicitud contractual y mostrar estado de cálculo, errores, razones y alternativas.

**Entrega:** tarjetas o tabla con tiempo total, desnivel/esfuerzo estimado, margen de retorno y restricciones. Incorporar después la comunicación. Resaltar una alternativa seleccionada conservando la comparación.

**Cierre:** cambios en la UI llegan efectivamente al motor; los datos no se quedan en una tarjeta estática. Se entiende por qué una misión fue rechazada y qué información falta. No mostrar porcentajes de éxito inventados.

### C4. Ambiente, apoyo y fuentes — P1

**Objetivo:** integrar las capacidades acordadas sin sobrecargar el flujo.

**Trabajo:** selector de escenario con fecha y tipo de sustento, capa de visibilidad geométrica y modo a pie/apoyo. Los valores observados, derivados y supuestos se consultan con el botón ⓘ o el panel «Fuentes», incluido si vinieron en vivo o del respaldo. No interrumpen cada acción ni ocupan la escena.

**Entrega:** una comparación que muestre un cambio explicable por configuración o escenario. Si dos escenarios producen el mismo camino pero distinta viabilidad, mostrarlo correctamente.

### C5. Seguimiento simulado y evento — P1

**Objetivo:** demostrar acompañamiento sin prometer localización real.

**Trabajo:** animar un marcador sobre la ruta, pausa/reanudar, progreso y estado de misión; activar el evento acordado con B y presentar el nuevo resultado. Mostrar de forma clara «seguimiento simulado».

**Entrega:** secuencia reproducible de avance → evento → reevaluación → decisión del usuario. No hace falta HUD inmersivo: una vista de seguimiento dentro de la misma aplicación alcanza.

Si se simula pérdida de comunicación, distinguir la posición local del astronauta de la última posición recibida por la base. Esta segunda vista es opcional; no fingir que perder el enlace elimina necesariamente la navegación local.

### C6. Presentación y arranque reproducible — P0

**Objetivo:** que la aplicación se pueda demostrar y revisar sin asistencia del desarrollador.

**Trabajo:** completar leyendas, fuentes, mensajes de error y estado de carga; preparar inicio local y README; comprobar rutas de archivos y arranque limpio. No dejar la documentación y el video para después del desarrollo.

**Entrega:** instrucciones breves, requisitos y comando/proceso de arranque; recorrido de demo estable; capturas o grabación cuando el flujo exista.

## 9. Cronograma de referencia y redistribución

Los horarios son objetivos de coordinación, no promesas de duración. Si un hito tarda más, se reduce P2 y luego la profundidad de P1 antes de comprometer integración y entrega. Se preserva siempre el corte de nuevas funciones del domingo.

| Bloque | A | B | C | Resultado compartido |
| --- | --- | --- | --- | --- |
| **Primeros 30–45 min** | Contrato de parcela y fixture | Contrato de misión/resultado | Prueba de consumo de contratos | I0: intercambio acordado |
| **Primeras 2–3 h** | A1–A2: recorte real, control vertical; `fetch_with_fallback` | B1–B2: perfiles, grafo dirigido y primera búsqueda con fixture | C1: Cesium + token restringido, ajustes de calidad, flujo con fixture | I1 en cuanto A entregue (motor visual ya decidido: D1) |
| **Resto de la primera mañana / hasta primera tarde** | A3–A4: destinos y REMS | B3–B4: retorno, alternativas y razones | C2–C3: datos y rutas reales | I2: primera misión completa real |
| **Primera tarde** | A5: visibilidad; A6: capa THEMIS; revisión de fuentes | B5–B6: contexto y apoyo conjunto | C4: ambiente, capas y comparación | I3: comparación funcional; iniciar I4 |
| **Cierre de la primera jornada** | Resolver problemas de datos y preparar procedencia | Casos críticos y B7 si el núcleo está estable | C5 si corresponde; recorrido de demo básico | App integrada que pueda volver a arrancarse; lista corta de pendientes |
| **Domingo por la mañana** | Revisar datos/fuentes y apoyar el bloqueo principal | Completar un evento; corregir motor | Integrar evento; mejorar legibilidad y fluidez | I4 completo o reducción explícita de P1 |
| **Domingo hasta las 14:00** | Validación cruzada y README científico | Validación cruzada y README del motor | Validación cruzada y README de ejecución | Cierre de nuevas funciones; candidato I5 |
| **Domingo 14:00–18:00** | Fuentes, límites y evidencia para el relato | Revisar números y explicar algoritmo | Captura y edición con apoyo de todos | Video de 3 minutos y documentación listos para revisión |
| **Domingo 18:00–21:30** | Revisar entrega | Revisar entrega | Revisar entrega | Arranque limpio, video completo y paquete/repo revisado; comenzar carga |
| **Domingo 21:30–23:59** | Solo incidencias de entrega | Solo incidencias de entrega | Solo incidencias de entrega | Margen para carga, comprobación y correcciones imprescindibles |

Si el inicio efectivo fuera recién el domingo, mantener los contratos y la división A/B/C, concentrarse en I0–I3 y el P0, e incorporar solo el P1 que ya funcione. No extender el trabajo por fuera del vencimiento para completar esta tabla.

### Cómo se redistribuyen las personas

- Cuando A2 termina, A deja de explorar fuentes generales y trabaja en contexto/visibilidad. Si la integración falla, vuelve a resolver ese problema antes de añadir capas.
- Cuando A4–A5 terminan, A puede implementar verificaciones, preparar fuentes y ayudar a B con escenarios. Eso evita que B concentre toda la segunda mitad del trabajo.
- Si B se demora, C completa controles y comparación usando respuestas contractuales de prueba; A ayuda a aislar entrada, coordenadas o máscara. El cálculo real sigue siendo requisito de la entrega.
- Si C se demora por rendimiento, A reduce los recursos visuales y B mantiene las salidas compactas. No se reescribe el motor por un problema de renderizado.
- Después del corte de funciones, las tres personas se orientan a correcciones y entrega; nadie sigue abriendo fuentes o módulos opcionales.

## 10. Trabajo compartido, repositorio y control de integración

### Estructura propuesta

| Carpeta | Responsable principal | Contenido |
| --- | --- | --- |
| `contracts/` | Compartido; editor por cambio acordado | Esquemas, ejemplos y unidades |
| `data/fixtures/` | A, con revisión de B/C | Paquete sintético pequeño para desarrollar y verificar |
| `data/processed/gale/` | A | Paquete real reducido y manifiesto |
| `data/science/` | A | Destinos, ambiente y referencias |
| `scripts/` | A | Preparación reproducible de datos |
| `engine/` | B | Evaluación, búsqueda y perfiles |
| `service/` | B | Conexión local entre aplicación y funciones |
| `app/` | C | Interfaz y visualización |
| `tests/` | A/B; C para casos de interfaz útiles | Verificaciones significativas de geometría y reglas |
| `docs/` | Compartido | Fuentes, supuestos, decisiones, instrucciones y guion |

Crear un repositorio compartido al iniciar el desarrollo si todavía no existe. No asumir que el workspace actual ya tiene Git configurado. Usar ramas cortas por tarea/frente y una rama principal que siempre arranque. Integrar cambios pequeños, con otra persona revisando el contrato y una ejecución básica.

No versionar archivos multigigabyte por comodidad. Conservar scripts, manifiesto y un paquete reducido compatible con los límites del repositorio/canal de entrega. Si los datos no se incluyen, el procedimiento de preparación debe ser reproducible y haberse probado; la demo conserva una copia local lista.

### Checklist para entregar una subsección a otro frente

1. Archivo o función disponible y ubicación acordada.
2. Contrato y versión compatibles.
3. Ejemplo mínimo que se pueda ejecutar o abrir.
4. Unidades, referencias, nulos y limitaciones escritos.
5. Responsable consumidor confirma que lo leyó/ejecutó.
6. Cambio integrado y anotado; pendientes restantes explícitos.

Una sección no está terminada solo porque corre en la máquina de su autor. El cierre exige que su consumidor pueda usarla.

## 11. Verificación que sí merece tiempo

Priorizar comprobaciones que detecten decisiones incorrectas y errores de integración. Evitar una batería extensa de pruebas que solo repita el código.

| Prueba | Error que previene | Responsable |
| --- | --- | --- |
| Puntos de control y conversión ida/vuelta de coordenadas | Ejes invertidos, desplazamientos y referencias inconsistentes | A con B/C |
| Máscara nodata y bordes | Atravesar terreno desconocido como si fuera llano | A/B |
| Mapa pequeño con barrera y ruta conocida | Búsqueda y vecinos incorrectos, corte de esquinas | B |
| Ascenso/descenso y unidades | Regreso idéntico por error, confundir grados/% o segundos/minutos | B |
| Ida + tarea + vuelta + reserva | Aceptar una salida sin margen de retorno | B |
| Preferencia muy alta frente a restricción incumplida | Compensar un límite obligatorio con un buen promedio | B |
| Incompatible vs. insuficiente vs. fallo técnico | Dar una falsa conclusión sobre viabilidad | B/C |
| Casos de visibilidad con perfil sencillo | Confundir terreno visible/oculto o nulos | A/B |
| Evento con tiempo ya transcurrido | Regalar autonomía al reevaluar | B/C |
| Cambio de formulario a resultado real | UI que aparenta modificar parámetros pero no los envía | C/B |
| Datos y simulaciones identificados | Presentar supuestos como mediciones NASA o posición real | A/C |
| Arranque limpio y repetición de la demo | Dependencias ocultas o rutas locales rotas | Los tres |
| Corte de una API (simular apagando la red o con URL inválida) | Demo rota por un servicio externo caído; respaldo que no indica su origen | A/C |
| Desfase DTM↔Cesium en ~20 puntos del recorte | Ruta flotando o enterrada; corrimiento horizontal entre productos | A/C |
| Fluidez con pestaña visible en la máquina de presentación | Escena trabada al mover la cámara | C |
| Regla de luz diurna con un caso que termina después del atardecer | Ambiente que se muestra pero no decide | B |

La comparación de inclinación del rover con DTM queda como comprobación de consistencia opcional. No es validación directa de transitabilidad humana, ni una estimación automática del límite del vehículo.

## 12. Nuevas posibilidades: cuándo agregarlas

Solo iniciar una ampliación si I2 funciona y no hay bloqueos de P0. Para cada incorporación, anotar un resultado visible, responsable y coste estimado antes de abrir trabajo.

| Posibilidad | Responsable natural | Dependencia | Criterio para incorporarla |
| --- | --- | --- | --- |
| Área alcanzable con tareas y retorno (**subió a P1**) | B calcula; C dibuja | B3 estable | Sale de las dos corridas de Dijkstra que ya existen (D6) |
| Restricción dominante / cambio admisible | B explica; C presenta | B4 estable | Recalcular configuraciones permitidas; no proponer eliminar límites para fabricar viabilidad |
| Ventana solar detallada (la regla básica de amanecer y atardecer de REMS ya está en P0) | A prepara; B evalúa; C muestra | Coordenadas y tiempo coherentes | Horizons (vía servicio, sin CORS) a paso fino; una tabla cada 3 h no basta para anunciar minutos precisos de ocaso o sombra |
| Sombras topográficas | A/B | Ventana solar + DTM y horizonte | Hay tiempo para cálculo geométrico y comprobación; separar sombra visual decorativa de restricción calculada |
| Robot repetidor | A/B; C integra | A5 y B5 estables | Modelar dos enlaces geométricos y equipo supuesto, sin prometer RF |
| RAD | A | Lectura y unidades verificadas | Agrega contexto útil de exposición; una serie puntual no es un mapa de zonas protegidas por ruta |
| Conversación con IA | B/C | Acceso/coste y respuesta estructurada estables | Explica resultados ya calculados, conserva fuentes y no altera restricciones ni bloquea el flujo |

SWIM, cráteres regionales, mineralogía compleja, clasificación visual de suelos, coordinación separada de agentes y despliegue avanzado se mantienen fuera del trabajo inmediato. Solo reconsiderar con un aporte concreto a la parcela y sin poner en riesgo el cierre.

## 13. Riesgos y decisiones sin detener a todos

| Situación | Respuesta operativa | Qué sigue en paralelo |
| --- | --- | --- |
| El recorte inicial falla | A mueve/reduce dentro de Gale; entrega fixture compatible mientras tanto | B avanza algoritmo y C flujo |
| Instalación geoespacial consume el primer bloque | Usar entorno del compañero o lector que ya funcionó; reducir exportación inicial | C usa fixture y B prueba reglas |
| Cesium ion falla, se vence el token o los términos lo impiden | Plan B: escena Three.js con la ortoimagen y el DTM HiRISE de la parcela, que ya se lee como COG. No mantener dos motores en paralelo: solo se activa si Cesium falla | B sigue independiente; A ya tiene el DTM |
| Una API externa cae durante la demo | `fetch_with_fallback` usa la última copia y la UI lo indica | El cálculo no depende de la red (grilla en memoria) |
| El terreno bloquea todos los caminos | Verificar referencias, reglas y conectividad; cambiar base/destino o recorte justificadamente | Mantener un caso negativo válido para la demo |
| Las alternativas coinciden | Mostrar una; verificar otro destino/criterio real si conviene | No dibujar rutas ficticias ni subir pendientes para forzarlas |
| Datos REMS incompletos | Elegir un sol válido y declarar huecos; escenario hipotético separado | Continúa navegación sobre terreno |
| No hay modelo humano validado | Perfil de referencia editable y análisis temporal; límites de POC escritos | No frenar el motor por intentar calibrar fisiología marciana |
| Una capa desconocida impide concluir | Estado de evidencia insuficiente; política conservadora explícita | Explorar otra zona cubierta sin esconder el hueco |
| Render lento | Pasar al ajuste liviano (subir el SSE, sombras off), simplificar etiquetas | Conservar geometría física del cálculo |
| Presión de tiempo | Cortar P2, luego reducir profundidad P1; proteger P0 y entrega | Todos ayudan a completar el flujo real |

## 14. Video, documentación y entrega

### Historia sugerida para tres minutos

| Tiempo orientativo | Contenido | Quién prepara |
| --- | --- | --- |
| 0:00–0:20 | Problema: preparar una expedición humana considerando destino, terreno y retorno | Equipo |
| 0:20–0:45 | Parcela real de Gale, datos integrados y objetivo científico | A, con captura de C |
| 0:45–1:35 | Configurar misión y comparar alternativas con razones | B/C |
| 1:35–2:15 | Cambio de preparación/escenario o evento; nueva recomendación | B/C |
| 2:15–2:40 | Datos NASA, cálculos y supuestos; qué funciona realmente | A/B |
| 2:40–3:00 | Aporte, limitaciones y siguiente paso | Equipo |

Si el seguimiento no entra, demostrar el cambio de preparación antes de salir y explicar la reevaluación como extensión pendiente. El video debe mostrar funcionalidades existentes, no una animación que aparente un cálculo no implementado.

### Documentación mínima

- README: objetivo, instalación, arranque y uso de la demo.
- Fuentes: productos exactos, enlaces, fechas, atribuciones/condiciones consultadas y preparación.
- Supuestos: perfiles, base/antenas, reglas ambientales, posición/eventos simulados y limitaciones de resolución.
- Método: restricciones, costes, búsqueda, retorno, alternativas y estados de evaluación.
- Resultados de verificación: qué se probó y qué quedó pendiente.
- Alcance: funciones implementadas frente a propuestas futuras; uso de IA en el trabajo y en el producto según corresponda y lo solicitado por la organización.

### Criterio final de entrega

La POC está lista cuando se puede arrancar, repetir una misión sobre datos reales, explicar el resultado y mostrar un cambio coherente de configuración; el código y los recursos necesarios están disponibles por la vía acordada, y el video reproduce ese funcionamiento en tres minutos. Antes de cerrar, comprobar en el portal que los enlaces/archivos enviados abren y que el estado de entrega quedó confirmado.

## 15. Primeras acciones de la jornada

1. Asignar A/B/C y elegir herramienta compartida para tareas/repositorio.
2. Acordar contratos v1, convenciones y fixture; cada responsable confirma su consumidor.
3. Arrancar simultáneamente A1–A2, B1–B2 y C1.
4. Integrar el primer paquete real apenas esté disponible; corregir referencias antes de añadir capas.
5. Cerrar una misión completa de ida/tarea/regreso y un caso rechazado.
6. Añadir contexto, comunicación y acompañamiento en entregas pequeñas; revisar prioridades en cada integración.

## 16. Referencias de trabajo y estado

- `BRAINSTORMING.md`, v0.7: definición funcional y capacidades. La elección posterior de Gale queda confirmada en este plan.
- `CRUCE_BRAINSTORMING_RECURSOS.md`, v0.3: productos candidatos, pruebas E1–E21 (E20–E21: Cesium Mars en Gale, desfase vertical, calidad y rendimiento), diferencias de acceso y bloqueos B1–B8. Las pruebas registradas son evidencia de acceso/lectura, no de integración terminada.
- `CONTEXTO_HACKATON_Y_DATOS_PARA_CLAUDE.md`: contexto del challenge y recursos iniciales.
- `MATRIZ_DATOS_Y_PENDIENTES.md`: historial de dependencias previo al cruce; ante discrepancias de etapa, este plan organiza el trabajo actual.
- `apis-nasa.md`, `apis-marte.md`, `CATALOGO_FUENTES_EXTERNAS_MARTE.md`: documentos de exploración mencionados por el equipo y usados como base del cruce; consultar sus detalles durante las tareas que los necesiten.

Este documento planifica el desarrollo: no afirma que el entorno, la parcela, el motor, el acceso a modelos ni las funciones estén implementados. Las tareas y sus criterios de cierre permiten avanzar aun con decisiones pendientes y convertirlas en resultados integrables.

## 17. Registro de cambios

### v1.1 — 14/11/2026, madrugada
- **Motor visual decidido:** CesiumJS + Cesium Mars (D1), sin exageración vertical. Three.js queda solo como plan B ante una falla de Cesium.
- **Cálculo y visual separados:** DTM HiRISE en grilla nativa para el motor; rutas dibujadas sobre Cesium con `clampToGround`; control del desfase vertical (~71 m) por parcela (D2).
- **Plataforma:** app web de escritorio con vista adaptable tipo tablet (D3).
- **Se elimina la regla de «ninguna consulta externa obligatoria».** Ahora: APIs en vivo con respaldo guardado y procedencia consultable; el cálculo no consulta la red al pulsar «calcular» (D4).
- **Servicio Python** como motor + intermediario de las APIs sin CORS + caché (D5).
- **Motor de rutas:** grafo dirigido + Dijkstra de scipy, con celda de 2–4 m y tiempos medidos (D6). El área alcanzable sube de P2 a P1.
- **Clases de datos (sección 3 bis):** tres en P0 con papel en la evaluación; la regla de luz diurna REMS entra en P0; la capa térmica THEMIS (cualitativa, Mars Odyssey; COG probado en Gale) entra en P1 como A6.
- **Procedencia bajo demanda:** botón ⓘ y panel «Fuentes»; nada técnico permanente sobre la escena.
- **Ortoimagen:** A usa la imagen RED en escala de grises solo como control (el asset IRB es falso color); la textura visual la pone Cesium.
- **REMS** asociado a la posición de Curiosity por sol.
- **Claves:** token de Cesium restringido por dominio y asset; las demás claves, en el servicio.
- **Nuevas verificaciones:** corte de API, desfase DTM↔Cesium, fluidez con pestaña visible y regla de luz diurna.
- **Pendiente:** términos de uso y atribución de Cesium ion antes de grabar.
