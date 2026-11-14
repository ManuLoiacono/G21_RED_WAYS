import * as Cesium from "cesium";
import { t } from "../i18n";
import type { AppError } from "./status";

/** Configuration error detected before the viewer is created. */
export class ConfigError extends Error {
  constructor(public readonly appError: AppError) {
    super(appError.title);
  }
}

const envSteps = () => [t("err.env.copy"), t("err.env.paste"), t("err.env.restart")];

export function missingTokenError(): AppError {
  return {
    title: t("err.token.title"),
    detail: t("err.token.detail"),
    steps: [t("err.token.create"), ...envSteps()],
  };
}

/** Turns any startup error into a message with concrete steps. */
export function describeStartupError(err: unknown, assetId: number): AppError {
  if (err instanceof ConfigError) return err.appError;
  const technical = err instanceof Error ? `${err.name}: ${err.message}` : String(err);

  if (err instanceof Cesium.RequestErrorEvent || (typeof err === "object" && err !== null && "statusCode" in err)) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 401 || status === 403) {
      return {
        title: t("err.auth.title"),
        detail: t("err.auth.detail", { assetId }),
        steps: [t("err.auth.scope"), t("err.auth.urls"), ...envSteps().slice(1)],
        technical: `HTTP ${status}`,
      };
    }
    if (status === 404) {
      return {
        title: t("err.notFound.title"),
        detail: t("err.notFound.detail", { assetId }),
        steps: [t("err.notFound.add"), t("err.notFound.id")],
        technical: `HTTP ${status}`,
      };
    }
    return {
      title: t("err.network.title"),
      detail: t("err.network.detail"),
      steps: [t("err.network.check"), t("err.network.retry")],
      technical: status ? `HTTP ${status}` : technical,
    };
  }

  if (/webgl/i.test(technical)) {
    return {
      title: t("err.webgl.title"),
      detail: t("err.webgl.detail"),
      steps: [t("err.webgl.browser"), t("err.webgl.hardware")],
      technical,
    };
  }

  return {
    title: t("err.generic.title"),
    detail: t("err.generic.detail"),
    steps: [t("err.generic.reload"), t("err.generic.share")],
    technical,
  };
}
