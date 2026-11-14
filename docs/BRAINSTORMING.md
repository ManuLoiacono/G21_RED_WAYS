# Brainstorming — NASA Marswalk

Documento de trabajo del equipo. Nombre del producto pendiente.

- Creado: 13 de noviembre de 2026.
- Estado: definición funcional general cerrada para cruzar con recursos; arquitectura, ubicación y alcance técnico final pendientes. Prioridad confirmada: expediciones del astronauta, a pie o con apoyo robótico.
- Siguiente etapa: cruzar esta definición con la exploración de APIs, datasets y accesos; después construir el plan de desarrollo según la evidencia obtenida.
- Equipo: tres estudiantes de ingeniería; uso de ChatGPT y Claude durante el trabajo.
- Inicio de programación comunicado por el equipo: sábado 14 de noviembre, 09:00.
- Entrega comunicada por el equipo: domingo 15 de noviembre, 23:59.
- Entregables conocidos: desarrollo de código que sustente la POC y video de tres minutos.
- Este archivo documenta propuestas y decisiones; su creación no inicia la implementación del producto.
- Los PDF de organización quedaron fuera del análisis por indicación del usuario. No se han incorporado reglas de esos archivos.

## 1. Desafío

Crear una vista integrada de una zona o recorrido marciano que combine datos de distintas misiones y ayude a preparar o ejecutar una exploración humana con objetivos científicos.

La consigna sugiere considerar al menos tres tipos de datos. Se tratará como una meta de diseño, sin convertir esa sugerencia en un requisito obligatorio del reglamento.

## 2. Dirección expresada por el equipo

Estas son intenciones confirmadas durante la conversación; no implican que todos sus detalles técnicos estén resueltos.

1. Seleccionar un área geográfica limitada de Marte buscando equilibrio entre interés científico y disponibilidad de datos.
2. Representarla mediante una cuadrícula de navegación y variables que describan el espacio.
3. Concentrar la primera experiencia en preparar una salida desde una base hasta un destino elegido.
4. Permitir definir la configuración de la expedición antes de salir.
5. Priorizar astronauta a pie y astronauta con robot de apoyo. Considerar el transporte del astronauta como modalidad posible, sin convertirlo en el centro del producto. Robot sin astronauta: extensión condicionada al tiempo disponible.
6. Proponer distintos caminos y explicar sus fortalezas, limitaciones y confianza de la evaluación.
7. Incluir meteorología en la comparación de opciones.
8. Admitir posponer una misión o declararla inviable. Evaluar una alternativa solo robótica únicamente si el alcance y las capacidades lo permiten; no usarla como respuesta automática.
9. Priorizar posibles dificultades de comunicación con la base en Marte. Dejar la conexión con Tierra como expansión posterior.
10. Mantener el brainstorming abierto: cuestionar supuestos y buscar un aporte diferenciador.
11. Explicar la evaluación por categorías y limitaciones concretas; no reducir confianza a un porcentaje global.
12. Investigar cómo acompañar el recorrido con posición actualizada y un mapa o HUD. El formato HUD sigue siendo una posibilidad, no una decisión de interfaz.
13. El tipo de misión y las tareas se eligen al prepararla. El sistema debe admitir aproximadamente cuatro familias de misión; sus nombres y alcance siguen abiertos. Un caso de demostración no debe fijar el diseño a una única tarea científica.
14. Continuar los pendientes mediante preguntas y respuestas, construyendo primero un mapa general de trabajo, responsabilidades y datos. Las propuestas concretas anteriores no son decisiones cerradas.
15. Mantener una visualización 3D útil con esfuerzo acotado: la calidad de render del boceto no es un requisito de implementación. Priorizar navegación, integración de información y claridad de las decisiones.
16. El documento de definición resultante se cruzará con otra exploración de APIs, datasets y accesos. Conservar la generalidad de región, fuentes, motor y modelos hasta esa comparación; resolver limitaciones concretas a medida que aparezcan.

La marcha del astronauta a pie pasa a ser un caso principal. Las modalidades no se implementarán todas con la misma prioridad.

## 3. Formulación provisional del producto

Un sistema de apoyo a la exploración humana que compara cómo llegar a un destino científico y regresar según el terreno, la configuración de misión, el escenario ambiental y la comunicación local, explicando qué evidencia respalda cada alternativa. Se investiga una experiencia de seguimiento del recorrido con posición actualizada y calidad de localización visible.

Esta formulación es una propuesta del asistente, todavía abierta a cambios.

## 4. Antecedentes y diferenciación

- Mars Trek ya integra capas, perfiles de elevación, pendientes, iluminación y herramientas de trayectos.
- NASA/JPL documentó en enero de 2026 recorridos de Perseverance planificados con ayuda de Claude utilizando imágenes orbitales y elevación. Por tanto, incorporar IA o calcular una ruta no alcanza como argumento de novedad.
- No se ha realizado una revisión exhaustiva de todas las herramientas o publicaciones existentes. No afirmar que la propuesta es la primera de su tipo.
- Diferenciación a explorar: comparar configuraciones de expedición sobre un mismo destino, explicar límites, tratar incertidumbre de forma explícita e integrar restricciones de comunicación y objetivos científicos.
- La experiencia debe ayudar a decidir. Un conjunto de capas que no modifica ninguna decisión aporta poco a la planificación.

## 5. Selección geográfica — pendiente

### Candidatos

| Candidato | Interés para la POC | Pendiente de comprobar |
| --- | --- | --- |
| Delta y entorno de Jezero | Contexto científico y datos orbitales/de Perseverance | Recorte con coberturas coincidentes y alternativas de acceso |
| Borde occidental de Jezero | Relieve y productos cartográficos extendidos publicados en 2025 | Descarga, calidad y variedad de rutas dentro del recorte |
| Boxwork de Mount Sharp, Gale | Estructuras asociadas a antigua circulación de agua y movilidad compleja | DEM y otras capas coincidentes a escala suficiente |

Preferencia provisional del asistente: investigar primero un recorte útil de Jezero. No es una elección definitiva del equipo.

### Criterios para decidir

- Imagen y elevación disponibles sobre el mismo sector.
- Resolución y precisión adecuadas para las decisiones que se mostrarán.
- Alineación y sistema de coordenadas comprobables.
- Interés científico que pueda explicarse y vincularse a destinos.
- Variación del terreno que produzca alternativas reales, sin fabricar obstáculos para favorecer la demo.
- Tamaño de archivos y procesamiento compatibles con el fin de semana.
- Fuente y metadatos identificables.

La comprobación de archivos aún no se ha realizado. Encontrar una ficha de catálogo no demuestra que el conjunto ya esté descargado, alineado o listo para procesar.

## 6. Cuadrícula y caracterización

- Tamaño de celda pendiente hasta conocer los datos.
- Refinar la cuadrícula no agrega detalle a una fuente de menor resolución.
- La elevación y la pendiente derivada son información relacionada; no contarlas como dos tipos independientes de observación para inflar la integración.
- Usar distancias en metros y coordenadas compatibles con Marte. No aplicar métricas terrestres automáticamente.
- Representar nodata/desconocido explícitamente.
- Considerar el coste de pasar entre celdas, incluida la dirección de desplazamiento.
- El espacio requerido para pasar depende del perfil; una trayectoria puntual no prueba que quepa el vehículo.
- Un DEM de superficie no representa el interior de una cueva.

### Función de las variables

| Grupo | Ejemplos | Papel |
| --- | --- | --- |
| Restricciones | Zonas excluidas, límites del perfil, duración máxima | Admitir o descartar una alternativa |
| Costes | Distancia, ascenso, dificultad estimada, tiempo | Comparar rutas admisibles |
| Objetivos científicos | Observaciones, muestreo, comparación de materiales | Explicar utilidad y tareas alcanzables |
| Evidencia | Resolución, cobertura, calidad, fecha, procedencia | Mostrar limitaciones de la evaluación |

No permitir que un premio científico compense una restricción obligatoria.

## 7. Configuración de la misión

Separar quién se desplaza, qué tareas debe realizar y con qué capacidades/equipamiento cuenta. El objetivo central es apoyar las tareas del astronauta.

| Modalidad | Aspectos a modelar | Cuestiones abiertas |
| --- | --- | --- |
| Astronauta a pie — prioridad principal | Movilidad con traje, carga, tiempo, tareas y reserva | Parámetros y tareas concretas |
| Astronauta con robot de apoyo — prioridad principal | Trayectos de ambos, carga, reunión y dependencia de comunicación | Marcha conjunta o separada; tareas del robot |
| Astronauta transportado por vehículo — modalidad posible | Límites del vehículo y de ocupantes; posibles tramos a pie | Alcance y tipo de vehículo, si se incorpora |
| Robot sin astronauta — extensión si hay tiempo | Movilidad, energía, sensores, autonomía y comunicaciones | Qué tareas completa sin intervención humana |

Los perfiles son hipotéticos hasta documentar parámetros. Evitar atribuir capacidades de un vehículo real a otro por semejanza visual.

Una misión robótica no es automáticamente equivalente a una humana. La recomendación debe comprobar que el robot puede realizar la tarea. Si solo logra una inspección previa, describirlo como reconocimiento parcial.

Posibles resultados: misión tripulada viable; misión robótica viable para las tareas admitidas; reconocimiento robótico previo; reprogramar salida; ninguna alternativa viable con los parámetros actuales.

## 8. Meteorología y tiempo

### Intención del equipo

Las condiciones ambientales deben poder cambiar la comparación de recorridos y perfiles, incluida la conveniencia de enviar solo el robot.

Confirmado por el equipo: esas condiciones cambian la viabilidad de una operación sin que cambie el relieve. La analogía propuesta por Santiago es la diferencia entre poder recorrer un trayecto y poder hacerlo con un vehículo/equipamiento bajo determinadas condiciones de visibilidad. Es una analogía conceptual; no se trasladan reglas aeronáuticas a Marte.

### Variables candidatas

- Temperatura y su variación durante la misión.
- Viento, sujeto a la interpretación de los sensores y sus indicadores de calidad.
- Polvo/opacidad como contexto; no confundir opacidad con visibilidad local medida.
- Presión como contexto ambiental y entrada a modelos si existe una relación documentada.
- Iluminación/hora local y disponibilidad energética, según diseño del vehículo.

Cada variable necesita un vínculo explicable con una decisión. No crear un coeficiente genérico que empeore todas las celdas sin una justificación.

### Formas de trabajar con el ambiente

1. Reconstrucción histórica: usar observaciones fechadas y localizadas.
2. Contexto climatológico/modelado: utilizar un modelo publicado con resolución, escenarios y límites explícitos.
3. Escenario de demostración: modificar condiciones hipotéticas, claramente etiquetadas.

No presentar ninguna de esas opciones como un pronóstico local en tiempo real sin un producto que lo respalde.

MEDA es una fuente candidata de observaciones de Jezero. Sus mediciones no describen automáticamente cada celda del área y no deben trasladarse a Gale como si fueran locales.

Mars Climate Database es una fuente adicional candidata para escenarios climatológicos. Su contenido procede de modelos atmosféricos; no es por sí mismo un pronóstico operativo ni garantiza detalle meteorológico a escala de una caminata. Aún no se ha probado su integración.

Polvo y temperatura pueden afectar de forma diferente a cada diseño. El efecto energético de una tormenta depende, entre otros factores, de si el vehículo usa energía solar u otra fuente.

Idea a explorar: comparar una salida ahora con otra ventana ambiental más favorable. Empezar por escenarios discretos; la planificación que cambia continuamente con el tiempo agrega complejidad.

## 9. Comunicaciones

### Separar dos niveles

1. Comunicación local: astronauta/robot con la base o con un repetidor local.
2. Comunicación interplanetaria: base o vehículo con orbitadores y Tierra según la arquitectura elegida.

La comunicación local y la conexión a Tierra no deben resumirse en un único indicador de señal.

### Comunicación local — primer alcance confirmado

- Usar el relieve para calcular una primera aproximación de visibilidad geométrica hacia antenas propuestas.
- Declarar posición y altura de antenas como supuestos del escenario.
- Identificar tramos con posible obstrucción del enlace directo.
- Comparar distancia, duración estimada de tramos sin enlace directo y alternativas de recorrido.
- La línea de vista no garantiza conexión; su ausencia tampoco prueba que todo enlace sea imposible. La evaluación RF requeriría potencia, frecuencia, antenas, sensibilidad, pérdidas y otros parámetros.
- Por tanto, etiquetar el resultado inicial como evaluación geométrica, no como cobertura medida o garantía de conexión.
- Autonomía y tolerancia a interrupciones pueden variar entre perfiles. No habilitar cortes de comunicación por defecto para cualquier robot.

### Tierra — expansión posterior

- Las misiones actuales pueden usar enlaces directos y/o retransmisión orbital.
- Existen retardo de propagación, ventanas de comunicación, efectos de geometría y conjunción solar.
- Una reconstrucción real de ventanas requiere seleccionar fecha, infraestructura y datos orbitales apropiados; no se ha realizado.
- Para una primera POC, considerar representar el estado del enlace a Tierra como condición explícita del escenario, separado de la geometría del enlace local.
- El envío de un rover sin astronauta no significa que pueda controlarse desde Tierra de forma instantánea.

Decisión de prioridad del equipo: resolver primero el enlace local con la base; la modelización del enlace con Tierra no debe retrasar la POC principal.

### Meteorología y enlace

No asumir tormenta = pérdida de radio. Los efectos dependen del tipo de enlace, frecuencia, trayecto y condiciones. Separar además efectos indirectos como disponibilidad de energía o desempeño de sensores de los efectos de propagación de radio.

El manual de JPL sobre propagación marciana es una referencia técnica candidata; sus estimaciones no deben convertirse en un modelo universal sin revisar supuestos y antigüedad.

## 10. Qué significa confianza

Evitar una probabilidad de éxito inventada o una única cifra que mezcle conceptos incompatibles.

Confirmado por el equipo: presentar categorías y observaciones por dimensión, por ejemplo evidencia limitada o comunicaciones potencialmente obstruidas en un tramo. Las categorías exactas están pendientes de definición.

- Calidad de evidencia: qué resolución, cobertura e indicadores de calidad respaldan el cálculo.
- Viabilidad según el modelo: qué restricciones se cumplen y bajo qué supuestos.
- Sensibilidad: si la recomendación cambia al variar duración, velocidad u otras entradas dentro de escenarios declarados.
- Comunicación: visibilidad geométrica o evaluación de enlace, según lo realmente calculado.

Se pueden usar categorías explicadas o métricas concretas. No mostrar un porcentaje de éxito hasta contar con definición, modelo y validación adecuados. Un porcentaje de recorrido con línea de vista es una métrica geométrica, no una probabilidad de éxito.

## 11. Comparación de rutas

Intención confirmada: mostrar distintos caminos con fortalezas y limitaciones.

Posibles alternativas, todavía no garantizadas para el terreno elegido:

- Menor distancia entre las rutas admisibles.
- Menor dificultad estimada para el perfil.
- Menor exposición a sectores con evidencia limitada.
- Mayor continuidad de comunicación local bajo la evaluación disponible.
- Desvío científico opcional dentro del presupuesto de la expedición.

No forzar tres líneas diferentes si representan la misma ruta o si no existen alternativas factibles.

Mostrar: distancia, tiempo estimado, ascensos, restricciones, evidencia limitada, situación de comunicación y tareas científicas que pueden completarse. Valores y puntuaciones pendientes de definir.

Incluir ida, tarea y regreso. El regreso puede tener costes diferentes por dirección, carga o cambios del escenario.

## 12. Extensiones propuestas por el asistente — no aprobadas como alcance

- Área alcanzable con la preparación actual.
- Recorrido combinado: transporte, estacionamiento, tramo a pie y reunión.
- Robot como reconocimiento previo de un sector desconocido.
- Robot como repetidor en un punto estratégico; requiere evaluar capacidades y geometría.
- Comparación de ventanas de salida.
- Replanificación ante bloqueo o demora introducidos como eventos de simulación.
- Explicación de la restricción dominante y de cambios de preparación que permitirían una alternativa.

## 13. IA

- Uso de asistentes para investigación y desarrollo: previsto por el equipo.
- Asistente conversacional integrado: complemento admitido, de baja prioridad y sujeto a recursos. Su implementación no condiciona el recorrido principal del producto.
- Candidatos: interpretar intención de misión, explicar cálculos, recuperar contexto científico con fuentes y ayudar a interpretar imágenes con revisión.
- El cálculo debe poder verificarse. Una explicación generada no demuestra que una ruta sea transitable.
- Acceso técnico, costes y modo de integración se revisarán si se elige una función que requiera un modelo durante la ejecución.

## 14. Riesgos y límites de alcance

- El conjunto de ideas completo supera lo que conviene comprometer antes de comprobar datos.
- Primer recorte sugerido: una zona, perfiles acotados, meteorología de escenario, comparación de rutas y evaluación local de visibilidad.
- Las órbitas reales, interiores de cuevas, predicción meteorológica local y simulación física completa de vehículos requieren trabajo adicional.
- Cuevas y atmósferas contaminadas fueron ejemplos de motivación del equipo; no son condiciones observadas del área ni capacidades confirmadas de los robots.
- Mantener el foco en apoyar la exploración humana. Un robot puede reconocer, transportar o realizar tareas compatibles, sin convertir la propuesta únicamente en navegación robótica.
- Mantener trazabilidad entre dato real, producto derivado, interpretación y supuesto.

## 15. Próximas decisiones

1. Definir capacidades y tareas de los perfiles principales confirmados: astronauta a pie y astronauta con apoyo robótico.
2. Decidir si la meteorología de la demo será histórica, modelada o hipotética.
3. Definir familias de misión configurables y evaluar qué datos comunes y específicos necesitan; mantener abierta la elección de un caso de demostración.
4. Definir qué hace obligatorio o preferible mantener comunicación local.
5. Delimitar el seguimiento del astronauta y su localización simulada; reservar el enlace con Tierra para una expansión posterior.
6. Definir métricas comprensibles de comparación y calidad de evidencia.
7. Confirmar si habrá IA integrada en la ejecución del producto.

## 16. Fuentes consultadas

Fuentes identificadas para investigación, no un inventario de datos ya integrados.

- [Mars Trek: capacidades](https://trek.nasa.gov/mars/jpl/config/textAbout.html).
- [Mars Trek: documentación WMTS](https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=mars).
- [USGS: ortomosaico HiRISE de Mars 2020](https://www.usgs.gov/data/mars-2020-terrain-relative-navigation-hirise-orthorectified-image-mosaic).
- [USGS: extensión cartográfica de Jezero publicada en 2025](https://www.usgs.gov/data/mars-sample-return-hirise-mosaics-terrain-relative-navigation).
- [USGS: ficha de DTM, imagen y confianza del producto MSR](https://astrogeology.usgs.gov/search/map/mars-sample-return-terrain-relative-navigation-hirise-dtm-mosaic).
- [NASA: movilidad e interés científico de boxwork](https://www.nasa.gov/missions/mars-science-laboratory/curiosity-rover/nasas-curiosity-rover-sees-martian-spiderwebs-up-close/).
- [PDS: MEDA](https://pds-atmospheres.nmsu.edu/data_and_services/atmospheres_data/PERSEVERANCE/meda.html).
- [PDS: posiciones de Perseverance, PLACES](https://pds-geosciences.wustl.edu/missions/mars2020/places.htm).
- [PDS: mapa de recorridos y observaciones](https://an.rsl.wustl.edu/help/Content/Using%20the%20Notebook/Main%20sections/Maps/Traverse%20map.htm).
- [Mars Climate Database: interfaz](https://www-mars.lmd.jussieu.fr/mcd_python/index.html).
- [LMD: descripción de Mars Climate Database](https://www.lmd.ipsl.fr/en/bases-de-donnees/mcd-en/).
- [NASA: Mars Relay Network](https://science.nasa.gov/mars/mars-relay-network/).
- [NASA: conjunción solar](https://www.nasa.gov/solar-system/whats-mars-solar-conjunction-and-why-does-it-matter/).
- [JPL: manual de propagación de radio en Marte](https://descanso.jpl.nasa.gov/propagation/mars/marspub.html).
- [JPL: polvo y propagación](https://descanso.jpl.nasa.gov/propagation/mars/MarsPub_sec5.pdf).
- [JPL: geomorfología y propagación](https://descanso.jpl.nasa.gov/propagation/mars/MarsPub_sec6.pdf).
- [NASA: tormenta de polvo y diferencias entre fuentes de energía](https://science.nasa.gov/solar-system/planets/mars/10-things-massive-dust-storm-on-mars/).
- [NASA: desafíos del reconocimiento de cuevas](https://www.nasa.gov/general/cavehopping-exploration-of-planetary-skylights-and-tunnels/).
- [JPL: demostración de planificación con IA](https://www.jpl.nasa.gov/news/nasas-perseverance-rover-completes-first-ai-planned-drive-on-mars/).
- [NASA: Mars Global Localization en operaciones de Perseverance, febrero de 2026](https://www.nasa.gov/missions/mars-2020-perseverance/perseverance-rover/nasas-perseverance-now-autonomously-pinpoints-its-location-on-mars/).
- [NASA: prototipo KNaCK para cartografía y navegación sin GPS](https://www.nasa.gov/centers-and-facilities/marshall/nasa-partners-develop-lunar-backpack-technology-to-aid-new-moon-explorers/).
- [NASA NTRS: evaluación de tecnologías de navegación para superficie lunar, 2025](https://ntrs.nasa.gov/citations/20250000468).

## 17. Registro de cambios

### 2026-11-13 — v0.1

- Se crea el documento y se reconstruye el estado del brainstorming visible en la conversación.
- Se registra el enfoque del equipo: zona acotada, caracterización, configuración previa y comparación de caminos.
- Se incorpora la elección entre modalidades con astronauta, apoyo robótico y robot sin astronauta.
- Se agregan meteorología, comunicaciones locales y enlace con Tierra como líneas de investigación.
- Se distinguen calidad de evidencia, viabilidad y comunicaciones para evitar una confianza global sin fundamento.
- Se documentan fuentes, supuestos, candidatos y decisiones pendientes.

Las próximas actualizaciones deberán registrar qué se aceptó, qué cambió y qué sigue siendo una propuesta, conservando la distinción entre decisiones del equipo y recomendaciones del asistente.

### 2026-11-13 — v0.2

- Se confirma el astronauta como centro: marcha a pie y apoyo robótico primero; robot sin astronauta solo como extensión.
- Se aceptan posposición e inviabilidad como resultados posibles de la planificación.
- Se confirma la meteorología como modificador de viabilidad operativa y la comparación por categorías.
- Se prioriza comunicación local con la base; Tierra queda para más adelante.
- Se incorpora la pregunta del equipo sobre seguimiento de posición y HUD durante la caminata.
- Se agregan antecedentes de localización visual marciana y pruebas de navegación lunar sin GPS.
- Se registra una propuesta de seguimiento simulado y funcionamiento local; no se ha implementado ni aprobado como arquitectura definitiva.

## 18. Localización y acompañamiento durante la caminata

### Pregunta del equipo

Cómo se actualiza la posición del astronauta mientras recorre el mapa, qué infraestructura existe y qué parte podríamos fundamentar o demostrar en la POC.

### Distinciones fundamentales

- Localización: estimar dónde está el astronauta y con qué incertidumbre.
- Navegación: utilizar esa estimación para comparar la posición con la ruta y orientar la siguiente acción.
- Comunicación: transmitir esa información a la base cuando existe enlace.
- HUD: mostrar información. No es por sí solo un sensor ni un sistema de localización.
- Posición prevista en el plan y posición observada/estimada son datos diferentes. Una animación sobre la ruta no demuestra seguimiento real.
- Perder comunicación con la base no obliga a perder localización local. También puede existir comunicación con una posición local poco confiable.

### Antecedentes comprobados

- No hay una red operativa de GPS marciano equivalente al GPS terrestre, según NASA en su publicación de febrero de 2026. No asumir rastreo continuo de astronautas por satélite.
- Perseverance utiliza odometría visual para estimar desplazamientos. Su error puede acumularse y requiere correcciones.
- Mars Global Localization compara panoramas de cámaras del rover con mapas orbitales almacenados a bordo para corregir su posición. NASA documentó su uso en operaciones en febrero de 2026.
- Ese precedente demuestra localización autónoma de un rover; no demuestra un sistema listo para un astronauta en Marte ni una corrección continua en cada instante.
- KNaCK es un prototipo de navegación/cartografía con LiDAR investigado para exploración lunar. Es un antecedente tecnológico; no un equipo operativo en Marte.
- NASA evalúa tecnologías como estimación inercial de marcha, odometría visual-inercial, SLAM con LiDAR y medición de distancias por radio/UWB para navegación de superficie lunar.

### Arquitectura conceptual propuesta — pendiente de decisión

1. Inicializar la posición en una base o punto de referencia conocido.
2. Estimar desplazamiento mediante sensores del explorador: inerciales y cámaras, según equipamiento supuesto.
3. Corregir la estimación al reconocer referencias del mapa o recibir mediciones de una infraestructura local de balizas, si existe en el escenario.
4. Vincular la estimación al sistema de coordenadas del mapa. Un mapa local de SLAM no proporciona por sí solo coordenadas globales correctas.
5. Mostrar posición estimada, calidad/antigüedad, recorrido realizado y siguiente indicación.
6. Compartir actualizaciones con la base cuando hay enlace; mantener mapa, ruta y registro local durante una interrupción.

La infraestructura de balizas es una hipótesis de misión que requeriría instalación, posiciones conocidas, geometría suficiente y evaluación de cobertura. Una sola medición de distancia a la base no fija por sí sola una posición completa.

### Propuesta acotada para la POC

- Simular una fuente de posición que entregue ubicación, tiempo y calidad/estado de la estimación.
- Permitir movimiento manual o reproducción de un recorrido de prueba, incluyendo desvíos respecto de la ruta planeada.
- Etiquetar la posición como simulada. No afirmar implementación de odometría, SLAM o hardware que no se haya construido.
- Actualizar avance, distancia restante y alertas a partir de esa entrada.
- Separar eventos de pérdida de enlace con la base de eventos de degradación de localización.
- Mostrar la última posición recibida en la base junto con su antigüedad, sin presentarla como actual durante una interrupción.
- Simular meteorología y pérdida de referencias visuales como escenarios declarados. No atribuir una curva de error real a los sensores sin validación.
- Si la posición es incierta, mostrar esa condición y proponer detenerse/relocalizar como regla de la demo; evitar instrucciones precisas que supongan una ubicación confirmada.
- Un mapa que acompaña la misión puede mostrarse en una interfaz tipo HUD o tablet. El diseño exacto y la superposición de elementos sobre el mundo real están pendientes.

### Diferenciación propuesta

Explorar rutas que consideren no solo transitabilidad y enlace, sino también la posibilidad de mantener o recuperar una localización útil. Esa observabilidad solo podrá calcularse con evidencia y un modelo apropiados; para la primera demo se pueden usar puntos de relocalización declarados como parte del escenario.

No prometer resolver la navegación de un traje espacial completo durante la hackathon. El aporte demostrable puede ser cómo el sistema utiliza posición y calidad de localización para acompañar al astronauta y adaptar sus indicaciones.

## 19. Dependencias de datos y pendientes de concreción

El equipo solicita avanzar desde ideas hacia datos, recursos y un plan realizable, asegurando acceso antes de comprometer funcionalidades.

Se crea `MATRIZ_DATOS_Y_PENDIENTES.md` con correspondencia función–dato–modelo, niveles de evidencia de acceso, fuentes principales y respaldos, decisiones P1–P8 y pruebas necesarias antes de cerrar alcance.

Hallazgo organizativo: imagen, DEM, ambiente y fichas científicas pueden sostener muchas funciones. Pendientes y visibilidad hacia la base son derivados del relieve; perfiles, infraestructura futura y movimiento simulado son entradas del escenario. No se requieren APIs independientes para cada función.

Estado de validación: las fuentes principales tienen documentación/archivos identificados, pero no se ha abierto y alineado un paquete geoespacial local. Los intentos de representar etiquetas LBL y un CSV con la herramienta web no validan ni invalidan sus valores; no pudieron leerse con esa herramienta.

Propuesta del asistente: probar primero piso/delta de Jezero con imagen/DEM, ambiente local o escenario identificado y pocos destinos científicos. No es una decisión definitiva. La ficha de USGS advierte problemas de calidad en el sector CR del borde del mosaico original, por lo que se debe revisar el recorte exacto.

Orden revisado tras la aclaración del equipo: mapa general del sistema y división del trabajo; familias de misión configurables; datos comunes/específicos y evidencia de acceso; escenarios y perfiles; criterios de rutas, comunicación, seguimiento, categorías e IA. La zona se investiga en paralelo sin fijar todavía una única tarea.

### 2026-11-13 — v0.3

- Se documenta el paso de brainstorming abierto a resolución de dependencias y decisiones.
- Se crea una matriz separada para fuentes, respaldos y pruebas de preparación.
- Se identifica la reutilización del DEM entre varias funciones para acotar dependencias externas.
- Se mantienen como pendientes las decisiones de zona, modelos y arquitectura.
- La guía independiente de contexto para Claude no se modifica.

### 2026-11-13 — v0.4

- Se corrige el enfoque anterior que proponía avanzar desde una sola tarea científica de ejemplo.
- El equipo quiere elegir tipo de misión y tareas en la preparación, con unas cuatro familias posibles todavía abiertas.
- Geología, destino topográfico, reconocimiento de una entrada y observación ambiental son ejemplos de familias, no una lista definitiva ni funciones implementadas.
- Se prioriza el intercambio de preguntas y respuestas y una división general del trabajo antes de cerrar casos concretos.
- La matriz conserva utilidad para investigar acceso, pero sus propuestas de un caso geológico único dejan de guiar el alcance.

## 20. Visualización y navegación 3D — prioridad de evaluación

### Pedido y referencias del equipo

Antes de seguir con tareas/tipos de misión, el equipo quiere resolver la viabilidad de una experiencia visual 3D interactiva. Aspira a una parcela con todo el recorrido, cámara libre, información seleccionable, relieve, pendientes y ambiente, tomando como referencias el GIF de Curiosity por Mount Sharp y God's Eye View.

- [God's Eye View — repositorio](https://github.com/bilawalsidhu/gods-eye-view).
- [Cesium Mars — producto, especificaciones y ejemplo](https://cesium.com/platform/cesium-ion/content/cesium-mars/).
- [Demo oficial de Marte en CesiumJS](https://sandcastle.cesium.com/?id=mars).
- [Presentación de Cesium Mars](https://cesium.com/blog/2025/09/03/lift-off-to-cesium-mars/).
- [Three.js — terreno de ejemplo](https://threejs.org/examples/webgl_geometry_terrain.html).

Los dos GIF aportados fueron abiertos visualmente. La referencia NASA muestra terreno y trayectorias; God's Eye aporta la referencia de globo con información superpuesta y una experiencia de exploración dinámica. Ninguno reemplaza los archivos geoespaciales necesarios para los cálculos.

### Evaluación documental y técnica del asistente

Una parcela navegable en navegador, con capas y recorridos sobre relieve real, es técnicamente viable como alcance de POC. La evaluación aún no incluye una aplicación propia ejecutándose, validación de GPU/FPS ni acceso autenticado al tileset comercial. No equivale a una garantía de terminar todas las funciones del brainstorming.

God's Eye usa CesiumJS y, en sus GIF de fotorealismo terrestre, Google Photorealistic 3D Tiles. Adoptar cámara, capas y lenguaje visual no proporciona datos equivalentes de Marte. El repositorio completo contiene muchas integraciones terrestres; una base pequeña de visualización puede tener menos dependencias para esta POC.

### Dos vías principales

1. **CesiumJS + Cesium Mars preparado:** probar primero si el tileset cubre con detalle útil el recorte elegido. Aporta un entorno geoespacial 3D y visualización por streaming. Requiere cuenta/token de Cesium ion para ese contenido y comprobar condiciones de uso, atribución y conectividad. No crear ni contratar una cuenta automáticamente.
2. **Three.js + parcela propia:** recortar un DEM y una ortoimagen; construir una malla de superficie y aplicar la imagen como textura. Facilita controlar datos locales, detalle y capas a cambio de preparar la geometría y georreferencia. El archivo visual puede ser GLB u otro formato de malla; la elección está pendiente.

Cesium también puede mostrar datos propios, pero convertir, ubicar e integrar un recorte de alta resolución es trabajo adicional. No dar por supuesto que cargar un GeoTIFF basta para obtener un terreno listo con cualquier motor.

### Nuevo hallazgo que afecta la selección de zona

La ficha de Cesium Mars informa resoluciones aproximadas: global, imagen 232 m y terreno 200 m; Jezero, imagen 6 m y terreno 20 m; Gale, imagen 25 cm y terreno 1 m. Son especificaciones de las áreas cubiertas por esos productos, no una garantía para todo el cráter ni precisión de navegación. Comprobar el recorte exacto y el detalle realmente servido.

Este recurso vuelve a Gale un candidato importante para una prueba visual rápida. No implica elegir Gale ni prueba cobertura del sector de boxwork de 2025. Jezero puede seguir siendo preferible con una parcela propia HiRISE si se requiere más detalle que el tileset preparado de esa zona.

USGS también publica una versión color de un mosaico de Gale en formato COG: [ficha](https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_orthophoto_mosaic_25cm). Se identificó documentalmente, sin descargar ni verificar lectura por rangos.

### Qué construir sobre la visual

- Cámara orbital libre, zoom, desplazamiento y vistas guardadas.
- Base, destinos y recorridos ajustados al terreno.
- Selección de un punto para consultar datos y referencias.
- Capas de elevación, pendientes y visibilidad geométrica hacia la base.
- Movimiento del astronauta simulado y cámara de seguimiento.
- Panel ambiental y control temporal, según datos/escenarios disponibles.
- Transición de cámara o recorrido animado para comunicar la misión en el video.

Son objetivos propuestos de implementación, no funciones construidas. Priorizar cámara/terreno, una ruta y una capa antes de sumar efectos.

### Límites que debe conservar el diseño

- Relieve derivado de un DEM es una superficie de altura (2.5D), adecuada para una escena 3D. No reconstruye por sí solo cuevas, salientes ni cada roca.
- La textura y el DEM pueden tener resoluciones diferentes. Los cálculos no deben tomar el color de una imagen como altura.
- Separar malla visual optimizada de datos analíticos. Si hay exageración vertical, aplicarla y declararla solo en la visual; pendientes y distancias se calculan con la geometría física de referencia.
- Usar coordenadas de Marte compatibles en todos los elementos. En Cesium, configurar el cuerpo/ellipsoide y alinear datums; no aplicar WGS84 terrestre por defecto.
- La ruta visible debe corresponder al cálculo, no a una línea decorativa. Verificar el ajuste al terreno para evitar tramos flotantes o enterrados.
- Movimiento de cámara o partículas en tiempo real no significa meteorología observada en tiempo real. Mostrar fecha, origen y naturaleza de cada escenario.
- El aspecto cercano al suelo depende de la resolución real de imagen y relieve. No prometer una reconstrucción fotogramétrica de detalle equivalente a las ciudades de Google.

### Primer hito propuesto desde las 09:00

Reservar inicialmente unas dos o tres horas como presupuesto de prueba, no como duración garantizada: una parcela real visible y navegable, un punto seleccionable y una ruta de ejemplo sobre el terreno. Validar acceso, detalle, alineación y fluidez en el equipo del grupo.

Si el contenido preparado de Cesium satisface la escala del recorrido, continuar por esa vía. Si exige corregir datos o depende de un acceso no resuelto, evaluar la parcela propia sin asumir que su preparación será instantánea. No implementar ambos motores en la POC.

La visualización 3D pasa a ser un frente principal junto con datos y navegación. La arquitectura final y el motor aún se deben elegir a partir de esa prueba.

### 2026-11-13 — v0.5

- Se pausa la definición de tareas para resolver viabilidad visual 3D.
- Se revisan los GIF y el repositorio de God's Eye.
- Se identifica Cesium Mars y su cobertura de mayor detalle en Gale/Jezero.
- Se comparan Cesium con contenido preparado y una parcela propia con Three.js.
- Se propone una primera prueba visual con datos reales; no se implementa la aplicación antes del horario comunicado.

## 21. Cierre del brainstorming y criterio para el futuro plan

Actualización: sábado 14 de noviembre de 2026, hora de Argentina.

### Confirmación más reciente del equipo

El render conceptual refleja la dirección visual deseada, pero se debe limitar el esfuerzo de renderización y priorizar las funciones importantes. La visualización 3D acompaña el sistema de navegación; el boceto no impone su nivel de acabado, detalle o efectos.

Cerrar primero el brainstorming en términos funcionales. Construir el plan de desarrollo después de ese cierre y del cruce con el documento externo de exploración de datos. El documento externo todavía no fue aportado ni revisado en esta conversación.

### Qué puede quedar cerrado sin elegir datasets o motor

- Usuario principal y situaciones de uso.
- Información que se configura antes de salir.
- Diferencia entre restricciones obligatorias y preferencias de ruta.
- Qué compara y explica el sistema.
- Comportamiento ante falta de datos, condiciones incompatibles y cambios durante la caminata.
- Papel del apoyo robótico y prioridad de las extensiones.
- Experiencia mínima útil de la visual 3D.

### Qué permanece abierto al cruce de recursos

- Región, recorte, resolución y fechas.
- Proveedores, productos exactos y vía de descarga/API.
- Fuente de escenarios ambientales y detalle espacial que permiten.
- Parámetros concretos y su procedencia.
- Motor de visualización, stack y formatos de intercambio.
- Alcance realizable y cambios justificados por disponibilidad, tiempos o rendimiento.

### Respuestas del equipo: decisiones confirmadas

1. **Preparación configurable:** las misiones disponibles tendrán una configuración predeterminada que permita avanzar en casos generales. El astronauta podrá modificar sus parámetros antes de la salida. Las familias concretas, sus valores iniciales y los límites de edición se definirán al cruzar requisitos y recursos; no se fija una única tarea científica.
2. **Preferencias de ruta:** el astronauta podrá priorizar criterios para comparar alternativas, porque el sistema es soporte a la decisión. Se distinguirán preferencias de restricciones obligatorias: cambiar una prioridad no elimina una incompatibilidad. La forma de introducir esas prioridades y el método de comparación quedan pendientes de implementación.
3. **Reevaluación en marcha:** se incluye la capacidad de revisar la misión ante cambios durante el recorrido. Se decidirá sobre la marcha si forma parte del núcleo o de una ampliación. Para la POC se puede evaluar mediante eventos simulados, identificados como tales; no se da por disponible una fuente de condiciones ni de localización en tiempo real. El mecanismo de actualización y confirmación sigue abierto.
4. **Asistente conversacional:** puede incluirse, con baja prioridad. Su aporte concreto, proveedor, acceso y coste se evaluarán después; no debe bloquear las funciones principales de navegación y comparación explicable.

Con estas respuestas queda cerrado el comportamiento general necesario para pasar al cruce de recursos. El cierre no implica que los datos, modelos o accesos estén validados ni que todas las funciones propuestas entren en la entrega.

No reabrir decisiones que el equipo ya confirmó: protagonismo humano, unas cuatro familias configurables, alternativas con fortalezas/limitaciones, ambiente, comunicación local, posibilidad de posponer/inviabilidad y robot solo como extensión.

### Criterio para construir el plan posterior

El futuro plan debe traducir cada función acordada a entradas, salidas, responsable, dependencia, prueba mínima y prioridad. Debe incluir un alcance principal y ampliaciones ordenadas, con validación temprana de datos y 3D. No prometer terminar toda la lista de ideas ni imponer una región por los primeros ejemplos consultados.

### 2026-11-14 — v0.6

- Se confirma el criterio de esfuerzo visual acotado tras el render conceptual.
- Se incorpora el cruce pendiente con la exploración externa de datos.
- Se separan decisiones funcionales de decisiones dependientes de fuentes y herramientas.
- Se retoman preguntas de cierre sin imponer un caso científico único.
- El plan de desarrollo definitivo sigue pendiente del cierre funcional y del cruce de recursos.

### 2026-11-14 - v0.7

- Se registran las cuatro respuestas del equipo como decisiones confirmadas.
- Se confirman configuraciones predeterminadas editables y prioridades elegidas por el astronauta.
- Se incluye la reevaluación durante el recorrido, con prioridad de implementación por definir.
- Se admite un asistente conversacional como complemento de baja prioridad.
- El documento queda listo para cruzar con la exploración de APIs, datasets y accesos antes del plan de desarrollo.

## 22. Resumen vigente para cruzar con recursos

Esta sección resume el estado actual; las propuestas e interrogantes anteriores se conservan como historial y deben interpretarse a la luz de las decisiones confirmadas en la sección 21.

| Capacidad acordada | Qué debe resolver el cruce con recursos |
| --- | --- |
| Parcela marciana interactiva en 3D, con esfuerzo visual acotado | Cobertura coincidente de imagen y elevación, resolución útil, formatos, acceso y coste de preparación/renderizado. Región y motor abiertos. |
| Caracterización mediante varias clases de datos | Productos de distintas misiones que puedan combinarse; escala, fecha, unidades, cobertura y datos faltantes. Objetivo de al menos tres clases, sujeto a validación. |
| Unas cuatro familias de misión con valores iniciales editables | Parámetros comunes y específicos, procedencia de valores y límites; distinguir evidencia científica de supuestos de la POC. Nombres y tareas concretas abiertos. |
| Alternativas explicadas y preferencias del astronauta | Entradas para relieve, movilidad y otros criterios; restricciones, métricas y limitaciones que realmente puedan sustentarse. No inventar porcentajes de éxito. |
| Ambiente que pueda modificar la recomendación, incluso posponer o declarar inviabilidad | Qué observaciones, modelos o escenarios están disponibles para la región y el momento; distinguir datos históricos, predicciones y simulaciones. |
| Comunicación local con la base | Datos para evaluar obstrucciones del terreno y supuestos de infraestructura/equipos. Separar visibilidad geométrica de una garantía de enlace. Comunicación con la Tierra como ampliación. |
| Acompañamiento del recorrido y reevaluación incluida, con prioridad por definir | Forma viable de representar posición y eventos; identificar lo simulado y qué permitiría una futura actualización real. No asumir GPS marciano operativo. |
| Astronauta a pie o con apoyo robótico como foco | Parámetros y compatibilidades de esos perfiles. Rover solo y reparto avanzado de tareas como ampliaciones. |
| Conversación con IA de baja prioridad | Aporte útil, acceso a modelo, coste y respaldo de explicaciones; funcionamiento principal independiente de ese complemento. |

Para cada recurso candidato, registrar: **capacidad que habilita → producto/fuente concreta → vía de acceso → evidencia de descarga y lectura → compatibilidad espacial/temporal → limitaciones → alternativa si falla**. Una página de catálogo o un endpoint encontrado no equivalen a una integración validada.

El resultado del cruce permitirá definir qué se implementa primero, qué se simula de forma explícita, qué se posterga y qué dependencias necesitan una prueba temprana. Recién entonces se arma el plan de desarrollo y la división del trabajo.
