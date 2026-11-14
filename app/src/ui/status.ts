import { esc } from "./format";

/**
 * Mensajes de estado de la app (P1-06): carga, error bloqueante y avisos breves.
 * Reemplaza los `alert()` y la pantalla negra cuando algo falla al arrancar.
 */

export interface AppError {
  title: string;
  detail: string;
  steps?: string[];
  /** Mensaje técnico original, plegado (para quien depura). */
  technical?: string;
}

function overlay(): HTMLElement {
  let el = document.getElementById("appStatus");
  if (!el) {
    el = document.createElement("div");
    el.id = "appStatus";
    document.body.appendChild(el);
  }
  return el;
}

export function showLoading(message: string) {
  const el = overlay();
  el.className = "as-loading";
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");
  el.innerHTML = `<div class="as-card"><span class="as-spinner" aria-hidden="true"></span><p>${esc(message)}</p></div>`;
  el.hidden = false;
}

export function updateLoading(message: string) {
  const p = document.querySelector("#appStatus.as-loading p");
  if (p) p.textContent = message;
}

export function hideLoading() {
  const el = document.getElementById("appStatus");
  if (el?.classList.contains("as-loading")) el.hidden = true;
}

export function showError(err: AppError) {
  const el = overlay();
  el.className = "as-error";
  el.setAttribute("role", "alert");
  el.removeAttribute("aria-live");
  el.innerHTML = `
    <div class="as-card">
      <h2>${esc(err.title)}</h2>
      <p>${esc(err.detail)}</p>
      ${err.steps?.length ? `<ol>${err.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>` : ""}
      ${err.technical ? `<details><summary>Detalle técnico</summary><pre>${esc(err.technical)}</pre></details>` : ""}
      <button type="button" data-act="reload">Reintentar</button>
    </div>`;
  el.hidden = false;
  el.querySelector<HTMLButtonElement>('[data-act="reload"]')!.onclick = () => location.reload();
}

/** Aviso breve no bloqueante (por ejemplo, teselas que fallaron). */
export function showToast(message: string, timeoutMs = 8000) {
  let el = document.getElementById("appToast");
  if (!el) {
    el = document.createElement("div");
    el.id = "appToast";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.hidden = false;
  window.clearTimeout(Number(el.dataset.timer));
  el.dataset.timer = String(window.setTimeout(() => (el!.hidden = true), timeoutMs));
}
