import { t } from "../i18n";
import { esc } from "./format";

/**
 * App status messages (P1-06): loading, blocking error and short notices.
 * They replace `alert()` and the black screen when something fails at startup.
 */

export interface AppError {
  title: string;
  detail: string;
  steps?: string[];
  /** Original technical message, folded (for whoever is debugging). */
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
      ${err.technical ? `<details><summary>${esc(t("status.technical"))}</summary><pre>${esc(err.technical)}</pre></details>` : ""}
      <button type="button" data-act="reload">${esc(t("status.retry"))}</button>
    </div>`;
  el.hidden = false;
  el.querySelector<HTMLButtonElement>('[data-act="reload"]')!.onclick = () => location.reload();
}

/** Short non-blocking notice (for example, tiles that failed). */
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
