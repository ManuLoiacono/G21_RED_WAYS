# scripts/ — Preparación de datos (persona 3)

Scripts reproducibles (rasterio/numpy) que generan el paquete de la parcela desde la URL del COG:
ventana del DTM, máscara, pendiente a 1 m y resumen por bloque, manifiesto, puntos de interés,
REMS + posición de Curiosity por sol, capa THEMIS (P1), visibilidad geométrica (P1).
Ver tareas P3-01 a P3-11 en `docs/TAREAS.md`.

## `build_hirise_tiles.py` — malla 3D de la parcela (visual)

Convierte la ventana de la parcela del DTM HiRISE (1 m) y la ortoimagen RED (0,25 m) en 3D Tiles 1.1
(glb con textura) para la app. Salida: `data/processed/gale/tiles_hirise/` + `metadata.json` con la procedencia, y la grilla de elevación del DTM (`elevation.bin`, uint16 a 1 cm, + `elevation.json`) para la lectura bajo el cursor de la app.

```bash
python3 -m venv .venv && .venv/bin/pip install numpy rasterio pillow
.venv/bin/python scripts/build_hirise_tiles.py            # parcela por defecto, ~3 × 3 km (137,360–137,410 E; −4,850 a −4,800)
.venv/bin/python scripts/build_hirise_tiles.py --bbox W S E N --shift ESTE NORTE --offset METROS
.venv/bin/python scripts/build_hirise_tiles.py --grid-only  # solo la grilla de elevación (elevation.bin/.json), ~6 s
```

**Alineación (medida el 14/11/2026 en la parcela):** el DTM y Cesium Mars no están registrados igual.
Cesium Mars coincide con el DTM movido −25 m al este, +35 m al norte y +56,2 m en altura (144 puntos,
dispersión residual 0,9 m). Las posiciones de Curiosity (`MSL_waypoints`) también están corridas respecto
del DTM: unos (−43, +33) m, y `elev_geoid` ≈ DTM − 17,9 m (563 puntos, dispersión 2,2 m).
Para dibujar sobre la escena algo que esté en coordenadas del DTM (por ejemplo, las rutas del motor),
hay que aplicarle el mismo desplazamiento.
