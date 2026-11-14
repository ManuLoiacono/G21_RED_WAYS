# Marswalk — app (persona 1)

Visor de Gale con CesiumJS + Cesium Mars, efecto de color y luz (sol bajo), sombras, tres ajustes de calidad y una ruta de prueba apoyada sobre el terreno.

## Requisitos
- Node.js 18 o superior (`node -v`).
- Navegador de escritorio reciente con WebGL (Chrome, Edge o Firefox).
- Cuenta de Cesium ion con un token (ver abajo).
- Conexión a internet: el terreno se descarga de Cesium ion.

## Arranque
Desde la carpeta `app/`:
```bash
npm install
cp .env.example .env      # en Windows: copy .env.example .env
# editar .env y pegar el token en VITE_CESIUM_ION_TOKEN
npm run dev               # abre http://localhost:5173
```
- En macOS, `.env` es un archivo oculto: abrilo con `open -e .env` o `code .env`, o mostrá los ocultos en Finder con **Cmd + Shift + .**
- Vite lee `.env` **solo al arrancar**: si cambiás el token, reiniciá `npm run dev`.
- Variables de `app/.env`:
  - `VITE_CESIUM_ION_TOKEN` (obligatoria): token de Cesium ion.
  - `VITE_SERVICE_URL` (opcional): URL del servicio de rutas. Por defecto, `http://localhost:8000`.

Al abrir la página se ve «Cargando el terreno de Gale…» hasta que llegan las primeras teselas (unos segundos). Después aparecen el panel «Preparar misión», la base y los destinos de prueba.

Otros comandos: `npm run typecheck` (tipos), `npm run build` (compila en `dist/`) y `npm run preview` (sirve `dist/`).

## Si algo falla
La app muestra el problema en pantalla con los pasos para resolverlo. El detalle técnico queda plegado y en la consola del navegador.

| Mensaje en pantalla | Causa probable | Qué hacer |
| --- | --- | --- |
| «Falta el token de Cesium ion» | No existe `app/.env` o `VITE_CESIUM_ION_TOKEN` está vacío | Crear `.env` desde `.env.example`, pegar el token y reiniciar `npm run dev` |
| «Cesium ion rechazó el token» | Token mal copiado, vencido, sin `assets:read` o sin el asset de Cesium Mars, o URL no permitida | Revisar el token en ion; si restringiste URLs, agregar `http://localhost:5173` |
| «Cesium Mars no está en tu cuenta de ion» | Falta agregar el asset `3644333` | Asset Depot → Cesium Mars → **Add to my assets** |
| «No se pudo conectar con Cesium ion» | Sin internet o ion caído | Revisar la conexión y tocar **Reintentar** |
| «La carga está tardando más de lo normal» | Conexión lenta | Esperar; sigue intentando. Si persiste, elegir **Liviano** en el menú ⚙ |
| «El navegador no puede mostrar la escena 3D» | Sin WebGL | Usar Chrome, Edge o Firefox recientes con aceleración por hardware |
| «El servicio de rutas no responde: se muestra una respuesta simulada» | El servicio de P2 no está levantado | Esperado mientras no exista `service/`. Las tarjetas llevan el aviso «Respuesta simulada» |
| «El servicio de rutas respondió 4xx/5xx» | Error en el servicio | Ver los registros del servicio (persona 2) |

## Token de Cesium ion
1. En https://ion.cesium.com → **Asset Depot**, buscar **Cesium Mars** y agregarlo a tus assets (**Add to my assets**), si no aparece ya en **My Assets**. El ID esperado es `3644333`; si en tu cuenta aparece otro, cambiarlo en `src/main.ts`.
2. **Access Tokens → Create token**:
   - Scopes: solo `assets:read`.
   - Resources: solo el asset de Cesium Mars.
   - Allowed URLs: `http://localhost:5173` (y más adelante el dominio publicado).
3. Pegar el token en `.env`. **No** subir `.env` al repositorio. El token igual queda visible en el navegador; por eso se restringe.

## Preparación de misión (P1-02)
- Panel «Preparar misión» (`src/mission/`): familia (4 plantillas), destino (selector o clic en el mapa), tareas con duración, sol REMS, hora de salida, reserva, tiempo máximo, perfil y preferencias, y «Restaurar valores».
- «Calcular rutas» envía `POST {VITE_SERVICE_URL}/plan` con el `plan_request` del contrato v0 (por defecto `http://localhost:8000`). El último pedido queda en `window.lastPlanRequest` y en «Ver pedido enviado al motor».
- El servicio de P2 tiene que aceptar CORS desde `http://localhost:5173`: el navegador manda un `OPTIONS` antes del `POST`.
- Valores iniciales en `src/mission/templates.ts`: supuestos editables. Reemplazarlos por los de P2-01 cuando existan.
- Base y destinos: `src/fixtures/poi.fixture.json` (**fixture**) hasta tener P3-05.
- Los puntos se dibujan con la altura que muestrea Cesium (`sampleHeightMostDetailed`). Con el globo oculto, `CLAMP_TO_GROUND` no funciona en puntos ni etiquetas; en polilíneas sí.
- `npm run typecheck` revisa los tipos.

## Resultados y comparación (P1-03)
- Panel «Alternativas» (`src/mission/results.ts`): una tarjeta por alternativa con estado (sin porcentajes), restricciones incumplidas, condiciones, tiempo total, margen de regreso, distancia, desnivel y desglose ida/tareas/vuelta/reserva.
- Mapa (`src/mission/routes.ts`): ida continua, vuelta a trazos si difiere, incompatibles en rojo a trazos. Elegir una tarjeta resalta su ruta.
- **Respaldo simulado:** si el servicio de rutas no responde, se usa `src/fixtures/plan_responses.fixture.ts`. Hay una respuesta fija por destino de prueba (destino 1: dos alternativas; destino 3: una; destino 2: incompatible), con el aviso «Respuesta simulada». Si el servicio responde con un error, se muestra el error, sin simulación.
- Pantallas de hasta 900 px: el formulario va abajo y se pliega solo al llegar los resultados.

## Procedencia bajo demanda (P1-05)
- Botón **Fuentes** en la barra superior: abre un panel con todas las fuentes, agrupadas por clase (topográfica, óptica y visual, atmosférica, supuestos y datos de prueba). Se cierra con «×», con Escape o con un clic afuera.
- Botones **ⓘ** junto al terreno (barra superior), las secciones del formulario, el aviso de datos de prueba, cada tarjeta y las restricciones con fuente. Abren el panel en esa fuente, resaltada. Un clic sobre una ruta del mapa también abre su fuente.
- Cada fuente muestra: tipo de sustento (observado, derivado, modelado o supuesto), misión, instrumento, producto, obtención (en vivo o respaldo), fecha de consulta, enlace y advertencias.
- Fuentes en `src/provenance/sources.ts`. Para una capa nueva: agregar una entrada y usar `infoButton("<id>", "<etiqueta>")`, o `data-source="<id>"` en cualquier botón. Si la respuesta del motor trae un bloque `provenance` que coincide con una fuente conocida (misma misión e instrumento), se agregan su origen, fecha, producto y enlace; si no coincide, se crea una entrada nueva.
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
- Lo que manda el motor (motivos, detalles) se muestra tal cual llega. Las respuestas simuladas y los títulos de los puntos de prueba (`title_en`) traen los dos idiomas.

## Notas
- `src/look.ts`: shader de color + sol bajo, atmósfera y ajustes de calidad (`light` / `balanced` / `presentation`).
- Ajustes de calidad verificados en una Mac con WebGL 2: los tres se aplican sin errores (SSE 16/6/4, sombras no/2048/4096, MSAA 1/4/4) y la escena se mantiene a 60 cuadros por segundo, el tope del monitor. Medir de nuevo en la máquina de presentación.
- No usar `scene.verticalExaggeration`: con este tileset deja de cargar el terreno detallado.
- `src/fixture_route.json` es una **ruta sintética de prueba**, no un cálculo del motor.
- Para depurar: `viewer`, `tileset` y `Cesium` quedan accesibles desde la consola del navegador.
