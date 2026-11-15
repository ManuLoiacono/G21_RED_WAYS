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

## Analytical Gale package

From the repository root on Windows (Python 3.11):

```powershell
& 'C:\Users\Usuario\anaconda3\python.exe' -m venv .venv
& '.\.venv\Scripts\python.exe' -m pip install -r scripts/analytical-requirements.txt
& '.\.venv\Scripts\python.exe' -m scripts.prepare_gale
& '.\.venv\Scripts\python.exe' -m unittest scripts.tests.test_prepare_gale -q
```

`data/processed/gale/analytical/manifest.json` records the exact native window, source CRS,
2-native-pixel search resolution (2.023493589 m), row direction, cell centres, masks, source-array
SHA-256 identities and processing policies. The ~2.96 km square search domain uses whole blocks
strictly inside the reviewed bounds and a one-native-pixel derivative halo. No whole-Gale graph.
`terrain.npz` is generated and ignored by Git. It includes unchanged native float32 elevations
with their original nodata sentinel, plus conservative analytical arrays. Search elevations are
block means; native central-difference slopes are aggregated by maximum. A missing sample in
any 3x3 derivative stencil blocks the whole affected search cell. No zero filling occurs.

No scientific exclusion layer was delivered: its explicit mask is all false, independently of
coverage and the engine's team/grade restrictions. Unknown small rocks and material hazards are
not assessed. The locations are hypothetical engineering choices; the manifest records their
selection and rejected preliminary locations. No terrain values or constraints were altered to
connect them. Changing source arrays or policies changes the content identity; the service never
chooses a newest file. `--factor 4` is available only as an explicit, separately identified
preparation; the delivered benchmark uses factor 2 and did not hit a resource bound.

The geographic/display metadata adopts P1's existing source-latitude convention and provisional
(-25 east, +35 north, +56.2 up) registration. Raw historical registration samples were not present;
the reported 0.9 m height spread is prior evidence, not a new numerical or horizontal accuracy
claim. Panorama +71.2 m never enters this package's elevations or movement costs.
