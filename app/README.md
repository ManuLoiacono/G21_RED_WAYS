# Marswalk frontend

The mission UI explicitly consumes the local P2 development draft `p2-plan-draft-1`. Shared v0 is unchanged. The service advertises an exact default parcel and registered choices. Start it with `--gale-package data/processed/gale/analytical/manifest.json` after [analytical preparation](../scripts/README.md) to enable real HiRISE terrain; synthetic regression mode remains selectable. Connection and schema errors are visible and never replaced with fixed response cards. The Gale scenario uses assumed movement/clock parameters and missing daylight evidence, not observed mission viability. See [the review handoff](../docs/handoffs/GALE_ROUTING_DELIVERY.md).

## Run the integrated development flow

From the repository root, with Python 3.10–3.12 and the pinned engine dependencies:

```sh
python -m pip install -r engine/requirements.txt
python -m service
```

In another terminal:

```sh
cd app
npm ci
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Open http://127.0.0.1:5173. The initial reconnaissance mission selects the registered base/sample locations, Avery Stone and the support rover. Click **Compute routes**: the calculated result is 800 s activity and 2600 s including reserve. Task durations are edited in seconds. Metadata comes from `/health`, `/parcel` and `/catalogs`; calculations use `POST /plan`. The last sent request and accepted response are available as `window.lastPlanRequest` and `window.lastPlanResponse`. Input edits invalidate results and pending responses; switching ES/EN preserves calculations.

The planning panel works even if Cesium cannot start. To load the Gale scene, copy `.env.example` to `.env` and set `VITE_CESIUM_ION_TOKEN` with access to Cesium Mars asset 3644333. Restart Vite after environment changes. Optional `VITE_SERVICE_URL` defaults to `http://127.0.0.1:8000`. Alternate ports require matching service `--allow-origin` flags; see [HTTP instructions](../service/HTTP_API.md). Windows can use `& 'C:\Users\Usuario\anaconda3\python.exe' -m service` for the verified Python runtime.

```sh
npm run typecheck
npm run build
npm run test:mission
# Include actual HTTP consumer checks while the service runs:
# PowerShell: $env:SERVICE_TEST_URL = 'http://127.0.0.1:8000'
# Also set P2_TEST_PYTHON to the engine Python interpreter for HTTP edge cases.
# POSIX: SERVICE_TEST_URL=http://127.0.0.1:8000 npm run test:mission
```

Only registered service POIs are submitted. Geographic fixture points and optical panorama observations are separate from planning. Synthetic metric geometry is never interpreted as longitude/latitude. Effort, communication, weather effects and other unsupported capabilities are explained in the form.

## Mission configuration and calculated results

Select 1–4 fixed humans and 0–2 fixed robots from the service catalog. Selected participants have assigned payloads and optional per-mission overrides for flat speed, ascent/descent grade limits, carrying limit and sortie availability. Empty override fields inherit catalog defaults. Identity and the movement model stay fixed. The reset button restores the initial baseline, including the roster.

All four mission templates come from the central export. Sequential tasks can be added, removed, renamed by unique occurrence ID and edited in seconds (up to 64 tasks). Reserve and mission budget use seconds. UTC departure and decision cutoff are explicit assumed scenario inputs. The scenario selector is intentionally limited to the two registered synthetic scenarios documented by P2; the service has no scenario-discovery endpoint. REMS sol selection and local solar time are unavailable in this draft.

Cards display only returned alternatives. Assessment and search status stay separate. Elapsed activity excludes unused reserve; reserved total includes it. Mission budget, every participant margin, limiting temporal margin and both daylight checks have separate labels. Missing values remain unavailable; no null becomes zero. Failed and missing-evidence checks show reasons, values, limits and evidence IDs. Expand evidence/reproducibility details for the actual returned metadata, classifications, assumptions, effective overrides and versions.

Reproduce the requested cases through the form:

| Case | Edit from the baseline | Expected |
| --- | --- | --- |
| Task +1 s | Visual reconnaissance: 601 | 801 / 2601 s |
| Rover limit | Support rover override: maximum sortie 2599 | Incompatible; rover margin -1 s |
| Exact daylight | Departure UTC 2025-10-25 12:38:20 | Daylight reserved return margin 0 s |
| Missing daylight | Select missing-daylight scenario | Insufficient evidence; daylight margins unavailable |

Restore defaults between cases. Changing inputs removes calculated cards immediately. ES/EN changes preserve the received result and form values.

## Geometry preview and regression verification

Calculated routes appear in a local metric preview in each returned card: equal x/y scale, solid cyan outbound and dashed orange return. Overlapping legs stay visible; a same-cell route is a point; unavailable legs have no path. The preview shows resolved centres and exact returned coordinates. It has no geographic transform or Cesium route placement. The +71.2 m panorama height correction remains visual only.

The existing Gale scene, panorama observations/viewer, layers and camera implementation remain separate. A valid ion token is required to verify the full streamed scene. Scene buttons are disabled until their handlers are ready. The token-free component harness at http://127.0.0.1:5173/tests/browser.html exercises the actual panorama/layer/source modules without streamed terrain; it does not verify real Gale registration or camera clearance.

Verified integration cases, limits, delayed-response tooling and remaining real-routing dependencies are recorded in the [integration handoff](../docs/handoffs/P1_P2_FRONTEND_INTEGRATION.md). The draft backend and shared v0 remain unchanged. The scene-inclusive production build retains Vite's large Cesium chunk warning.

## Procedencia bajo demanda (P1-05)
- Botón **Fuentes** en la barra superior: abre un panel con todas las fuentes, agrupadas por clase (topográfica, óptica y visual, atmosférica, supuestos y datos de prueba). Se cierra con «×», con Escape o con un clic afuera.
- Botones **ⓘ** junto al terreno (barra superior), las secciones del formulario, el aviso de datos de prueba, cada tarjeta y las restricciones con fuente. Abren el panel en esa fuente, resaltada. Un clic sobre una ruta del mapa también abre su fuente.
- Each source shows its evidence kind, mission/instrument/product, retrieval information, link and limitations. The active planner source explicitly identifies engine calculation on synthetic inputs; raw environment evidence and effective participants remain inspectable in the result details.
- Sources are registered in `src/provenance/sources.ts`. New layer buttons can use `infoButton("<id>", "<label>")` or `data-source="<id>"`. The active draft does not claim that the visual HiRISE grid or historical REMS reference is a connected analytical input.
- Nada técnico queda fijo sobre la escena (D8): todo está detrás de un ⓘ o del botón «Fuentes».

## Cámara (P1-01)
- **Rueda del mouse:** zoom propio (`src/camera.ts`) hacia el punto bajo el cursor. Nunca baja a menos de 30 m del suelo.
  - El zoom de Cesium falla en Gale: el terreno está ~3,4–4,4 km por debajo del elipsoide de Marte y Cesium mide la distancia como «altura sobre el elipsoide», que da negativa. El zoom se invertía y la cámara terminaba bajo tierra o subía hacia 0 m.
- **Arrastre:** rotar e inclinar siguen siendo de Cesium. El zoom con botón derecho quedó desactivado (usaba la misma lógica); en tablet se puede pellizcar.
- `keepCameraAboveGround`: si cualquier gesto deja la cámara bajo tierra o a menos de 30 m del suelo, la sube.
- **No usar `{ enableCollision: true }` en el tileset:** con Cesium Mars traba la carga de teselas (medido).
- «Restablecer vista» vuelve a la vista inicial (137,374° E, −4,792°, rumbo 160°, inclinación −9°).

## Barra superior y capas

- **Barra superior:** a la izquierda, el nombre y el lugar. En el centro, la misión que se está preparando (familia, destino, sol y hora de salida), que se actualiza con el formulario. A la derecha, **Capas**, **Restablecer vista**, **Fuentes**, **ES | EN** y el menú ⚙ con la calidad visual (Liviano, Equilibrado y Presentación).
- **Panel Capas** (`src/ui/layers.ts`): una fila por clase de dato. Cada fila tiene un interruptor (si la capa se puede ocultar), un ⓘ con su fuente, la misión e instrumento, y un estado: archivo local, en línea, datos de prueba, no generada o sin conectar. Las capas que todavía no existen (REMS, THEMIS) aparecen como «sin conectar»: no se inventan. Se cierra solo al llegar una respuesta, para dejar lugar a los resultados. En pantallas angostas arranca cerrado.
- **Colores:** los tokens están en `:root` (`src/style.css`, variables `--ui-*`). Los cuatro estados de evaluación usan siempre los mismos colores.

## Detalle HiRISE de 1 m en la parcela (opcional)

Dentro de la parcela, la escena puede mostrar una malla propia hecha con el DTM HiRISE (1 m) y la
ortoimagen RED (0,25 m), en lugar de Cesium Mars (~2,5 m en Gale). Cesium Mars sigue alrededor como contexto.

```bash
# desde la raíz del repo (una vez; ~1,5 min, lee solo la ventana de la parcela desde S3)
python3 -m venv .venv && .venv/bin/pip install numpy rasterio pillow
.venv/bin/python scripts/build_hirise_tiles.py
```

- La parcela es de ~3 × 3 km (137,360–137,410° E; −4,850 a −4,800°, en coordenadas del DTM), igual que `contracts/parcel_manifest.example.json`. En la escena se ve con un borde rojo (capa «Límite de la parcela»).
- Genera `data/processed/gale/tiles_hirise/` (~420 MB y una grilla de elevación de ~17 MB; no se versiona). `npm run dev` lo sirve en `/local-data/`.
- Si no está generada, la app arranca igual con Cesium Mars. Si está, se prende y apaga desde el panel **Capas** para compararla.
- Es solo visual: el motor calcula sobre el DTM. El color ocre lo pone el shader de la app; la imagen RED es en grises.
- Solo funciona con `npm run dev` (el build de producción todavía no copia las teselas).

### Lectura bajo el cursor

Al pasar el mouse sobre el terreno, abajo al centro se ven la posición, la **elevación** y la **pendiente** local del punto (`src/ui/readout.ts`).

- Elevación y pendiente salen de la grilla de 1 m del DTM HiRISE (`elevation.bin` + `elevation.json`, que genera el mismo script; `--grid-only` arma solo la grilla en ~6 s). Están etiquetadas como **derivado**. La pendiente se calcula a 1 m con diferencias centrales.
- La elevación es la del DTM, no la altura de la escena 3D (la escena está ~56 m más arriba y corrida −25 m E, +35 m N). Adentro de la parcela, las coordenadas también son las del DTM, el mismo marco que usa el motor.
- Si la pendiente supera la máxima del perfil del formulario, se resalta en amarillo.
- Fuera de la parcela, o sin la grilla generada, solo se ve la posición. En pantallas táctiles no aparece.
- Es una grilla provisoria para visualizar: cuando P3-02 publique el paquete analítico, conviene leer de ahí.

## Coordenadas y alturas (medido el 14/11 con 20 posiciones de Curiosity, soles 1930–4857)
- `Cartesian3.fromDegrees(lon, lat, h, Ellipsoid.MARS)` con la latitud tal como viene en los datos (MMGIS/HiRISE) cae en el lugar correcto del tileset. **No convertir** de planetocéntrica a geodésica: daría un corrimiento de ~3,3 km y un desfase vertical inconsistente (491 ± 41 m).
- Desfase vertical Cesium − `elev_geoid`: **71,2 m ± 0,3 m** (de 70,4 a 71,8). Es el dato que busca P3-03.

## Idioma (español / inglés)

- El selector **ES | EN** de la barra superior marca el idioma en pantalla y lo cambia al instante, sin recargar: el formulario, los resultados, las fuentes y los nombres del mapa se reescriben y conservan lo que ya estaba cargado. La elección queda guardada en el navegador. También se puede forzar con `?lang=en` o `?lang=es` (útil para grabar el video).
- Cada módulo que muestra texto se registra con `onLanguageChange` y se vuelve a dibujar; lo que escribió el usuario (por ejemplo, el nombre de una tarea) no se traduce.
- Los textos están en `src/i18n/es.ts` y `src/i18n/en.ts`. Para agregar uno: sumar la clave en los dos archivos y usarla con `t("clave")`. Si falta en `en.ts`, `npm run typecheck` falla.
- El código y los comentarios van siempre en inglés (ver `CLAUDE.md`, sección 8). Los valores de los contratos (`observacion_geologica`, `destino`, `observado`…) no se traducen.
- Engine rule/status labels use the ES/EN dictionary when recognized; original engine messages and reason codes remain in technical details. Changing language preserves the received calculated object and geometry.

## Notas
- `src/look.ts`: shader de color + sol bajo, atmósfera y ajustes de calidad (`light` / `balanced` / `presentation`).
- Ajustes de calidad verificados en una Mac con WebGL 2: los tres se aplican sin errores (SSE 16/6/4, sombras no/2048/4096, MSAA 1/4/4) y la escena se mantiene a 60 cuadros por segundo, el tope del monitor. Medir de nuevo en la máquina de presentación.
- No usar `scene.verticalExaggeration`: con este tileset deja de cargar el terreno detallado.
- `src/fixture_route.json` es una **ruta sintética de prueba**, no un cálculo del motor.
- Para depurar: `viewer`, `tileset` y `Cesium` quedan accesibles desde la consola del navegador.
