/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CESIUM_ION_TOKEN?: string;
  /** URL del servicio de rutas (por defecto http://localhost:8000). */
  readonly VITE_SERVICE_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
