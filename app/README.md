# Marswalk — app (persona 1)

Visor de Gale con CesiumJS + Cesium Mars, efecto de color y luz (sol bajo), sombras, tres ajustes de calidad y una ruta de prueba apoyada sobre el terreno.

## Requisitos
- Node.js 18 o superior.
- Cuenta de Cesium ion con un token (ver abajo).

## Arranque
```bash
npm install
cp .env.example .env      # en Windows: copy .env.example .env
# editar .env y pegar el token en VITE_CESIUM_ION_TOKEN
npm run dev               # abre http://localhost:5173
```

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

## Notas
- `src/look.ts`: shader de color + sol bajo, atmósfera y ajustes de calidad (liviano / equilibrado / presentación).
- No usar `scene.verticalExaggeration`: con este tileset deja de cargar el terreno detallado.
- `src/fixture_route.json` es una **ruta sintética de prueba**, no un cálculo del motor.
- Para depurar: `viewer`, `tileset` y `Cesium` quedan accesibles desde la consola del navegador.
