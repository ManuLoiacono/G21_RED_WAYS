/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CESIUM_ION_TOKEN?: string;
  /** Route service URL (default http://localhost:8000). */
  readonly VITE_SERVICE_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
