import * as Cesium from "cesium";
import type { AppError } from "./status";

/** Error de configuración detectado antes de crear el visor. */
export class ConfigError extends Error {
  constructor(public readonly appError: AppError) {
    super(appError.title);
  }
}

const ENV_STEPS = [
  "En la carpeta app/, copiá .env.example a .env (cp .env.example .env).",
  "Abrí app/.env y pegá tu token después de VITE_CESIUM_ION_TOKEN=, sin comillas ni espacios.",
  "Reiniciá el servidor (npm run dev): Vite solo lee .env al arrancar.",
];

export const MISSING_TOKEN: AppError = {
  title: "Falta el token de Cesium ion",
  detail: "La app necesita un token de Cesium ion para cargar el terreno de Marte.",
  steps: [
    "Creá un token en https://ion.cesium.com → Access Tokens (scope assets:read, solo el asset Cesium Mars). Ver app/README.md.",
    ...ENV_STEPS,
  ],
};

/** Traduce cualquier error del arranque a un mensaje con pasos concretos. */
export function describeStartupError(err: unknown, assetId: number): AppError {
  if (err instanceof ConfigError) return err.appError;
  const technical = err instanceof Error ? `${err.name}: ${err.message}` : String(err);

  if (err instanceof Cesium.RequestErrorEvent || (typeof err === "object" && err !== null && "statusCode" in err)) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 401 || status === 403) {
      return {
        title: "Cesium ion rechazó el token",
        detail: `El token no es válido, está vencido o no tiene permiso sobre el asset ${assetId} (Cesium Mars).`,
        steps: [
          "En https://ion.cesium.com → Access Tokens, revisá que el token tenga el scope assets:read y el asset Cesium Mars.",
          "Si restringiste URLs, agregá la de esta página (por ejemplo http://localhost:5173).",
          ...ENV_STEPS.slice(1),
        ],
        technical: `HTTP ${status}`,
      };
    }
    if (status === 404) {
      return {
        title: "Cesium Mars no está en tu cuenta de ion",
        detail: `No se encontró el asset ${assetId} en tu cuenta de Cesium ion.`,
        steps: [
          "En https://ion.cesium.com → Asset Depot, buscá «Cesium Mars» y tocá «Add to my assets».",
          `Si en «My Assets» aparece con otro ID, cambiá CESIUM_MARS_ASSET_ID en app/src/main.ts.`,
        ],
        technical: `HTTP ${status}`,
      };
    }
    return {
      title: "No se pudo conectar con Cesium ion",
      detail: "El terreno de Marte se descarga de Cesium ion y la conexión falló.",
      steps: ["Revisá la conexión a internet.", "Probá de nuevo en unos segundos."],
      technical: status ? `HTTP ${status}` : technical,
    };
  }

  if (/webgl/i.test(technical)) {
    return {
      title: "El navegador no puede mostrar la escena 3D",
      detail: "La app necesita WebGL y este navegador no lo tiene disponible.",
      steps: [
        "Usá una versión reciente de Chrome, Edge o Firefox.",
        "Activá la aceleración por hardware en la configuración del navegador.",
      ],
      technical,
    };
  }

  return {
    title: "No se pudo iniciar la app",
    detail: "Ocurrió un error inesperado al cargar la escena.",
    steps: ["Recargá la página.", "Si se repite, abrí la consola del navegador y compartí el detalle técnico con el equipo."],
    technical,
  };
}
