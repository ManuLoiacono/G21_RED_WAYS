# engine/ — Motor de rutas (persona 2)

Funciones puras en Python (sin dependencias del servicio ni del navegador):
perfiles y plantillas, grafo dirigido de 8 vecinos, `scipy.sparse.csgraph.dijkstra` (ida y vuelta),
evaluación de misión (ida + tareas + vuelta + reserva, regla de luz diurna), alternativas y motivos.

Ver tareas P2-01 a P2-12 en `docs/TAREAS.md` y los contratos en `contracts/`.
Tiempos de referencia (datos sintéticos): 2,25 M celdas → grafo 1,2 s, ida 0,8 s, vuelta 0,9 s.
