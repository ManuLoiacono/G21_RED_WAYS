import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import { defineConfig, type Plugin } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

/**
 * Serves data/processed/ at /local-data/ during development, without copying it into app/.
 * Used by the HiRISE mesh of the parcel (scripts/build_hirise_tiles.py).
 */
function localData(): Plugin {
  const root = resolve(__dirname, "../data/processed");
  const types: Record<string, string> = { ".json": "application/json", ".glb": "model/gltf-binary" };
  return {
    name: "local-data",
    configureServer(server) {
      server.middlewares.use("/local-data", (req, res, next) => {
        const path = resolve(root, "." + decodeURIComponent((req.url ?? "/").split("?")[0]));
        if (!path.startsWith(root + sep) || !existsSync(path) || !statSync(path).isFile()) return next();
        res.setHeader("Content-Type", types[extname(path)] ?? "application/octet-stream");
        res.setHeader("Cache-Control", "no-cache");
        createReadStream(path).pipe(res);
      });
    },
  };
}

// Cesium needs its Workers, Assets, Widgets and ThirdParty served as static files.
// Configuration based on Cesium's official Vite example.
const cesiumSource = "node_modules/cesium/Build/Cesium";
const cesiumBaseUrl = "cesiumStatic";

export default defineConfig({
  define: {
    CESIUM_BASE_URL: JSON.stringify(`/${cesiumBaseUrl}`),
  },
  plugins: [
    localData(),
    viteStaticCopy({
      targets: [
        { src: `${cesiumSource}/ThirdParty`, dest: cesiumBaseUrl },
        { src: `${cesiumSource}/Workers`, dest: cesiumBaseUrl },
        { src: `${cesiumSource}/Assets`, dest: cesiumBaseUrl },
        { src: `${cesiumSource}/Widgets`, dest: cesiumBaseUrl },
      ],
    }),
  ],
});
