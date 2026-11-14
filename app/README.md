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

## Notas
- `src/look.ts`: shader de color + sol bajo, atmósfera y ajustes de calidad (liviano / equilibrado / presentación).
- No usar `scene.verticalExaggeration`: con este tileset deja de cargar el terreno detallado.
- `src/fixture_route.json` es una **ruta sintética de prueba**, no un cálculo del motor.
- Para depurar: `viewer`, `tileset` y `Cesium` quedan accesibles desde la consola del navegador.
