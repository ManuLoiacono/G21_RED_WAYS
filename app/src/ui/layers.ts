import { onLanguageChange, t, type MessageKey } from "../i18n";
import { esc } from "./format";

/**
 * "Layers" panel: one row per kind of data shown on the scene (the challenge asks for several
 * kinds of NASA data layered together). Each row has a switch (if the layer can be hidden), an ⓘ
 * that opens its source in the "Sources" panel, and a short status. The detailed provenance
 * stays behind the ⓘ (D8): the row only says whether the layer is there and where it comes from.
 */

/**
 * - `loaded`: on screen, from a local file.
 * - `streaming`: on screen, streamed from an online service.
 * - `fixture`: on screen, but test data (not real).
 * - `missing`: available in the project but not generated on this machine.
 * - `pending`: not connected yet (another team member's task).
 */
export type LayerStatus = "loaded" | "streaming" | "fixture" | "missing" | "pending";

export interface LayerDef {
  id: string;
  /** Contract data class, for the colored tag (`topografica`, `optica`, …), or `mission`. */
  dataClass: "topografica" | "optica" | "atmosferica" | "termica" | "mission";
  name: MessageKey;
  /** Mission · instrument (not translated). */
  origin: string;
  sourceId?: string;
  status: () => LayerStatus;
  /** Present if the layer can be shown or hidden. */
  visibility?: { get: () => boolean; set: (on: boolean) => void };
  /** Optional button in the row (for example, to open something from the layer). */
  action?: { label: MessageKey; run: () => void };
  /** Shown instead of a switch when the layer cannot be hidden. */
  lockedKey?: MessageKey;
}

export interface LayersPanel {
  /** Re-reads statuses (for example, after a layer finishes loading). */
  refresh(): void;
  setOpen(open: boolean): void;
  isOpen(): boolean;
  onToggle(cb: (open: boolean) => void): void;
}

export function createLayersPanel(root: HTMLElement, layers: LayerDef[]): LayersPanel {
  let open = !window.matchMedia("(max-width: 900px)").matches;
  const toggleListeners: ((open: boolean) => void)[] = [];

  function row(layer: LayerDef): string {
    const status = layer.status();
    const on = layer.visibility?.get() ?? false;
    const canToggle = Boolean(layer.visibility) && status !== "missing" && status !== "pending";
    const control = layer.visibility
      ? `<button type="button" class="ly-switch" role="switch" data-layer="${layer.id}" aria-checked="${on && canToggle}"
           aria-label="${esc(t("layers.toggle", { layer: t(layer.name) }))}" ${canToggle ? "" : "disabled"}></button>`
      : layer.lockedKey
        ? `<span class="ly-locked">${esc(t(layer.lockedKey))}</span>`
        : "";
    const info = layer.sourceId
      ? `<button type="button" class="info-btn" data-source="${layer.sourceId}"
           aria-label="${esc(t("layers.source", { layer: t(layer.name) }))}" title="${esc(t("layers.source", { layer: t(layer.name) }))}">ⓘ</button>`
      : "";
    const action = layer.action
      ? `<button type="button" class="ly-action" data-action="${layer.id}">${esc(t(layer.action.label))}</button>`
      : "";
    return `
      <li class="ly-row" data-status="${status}" data-active="${status !== "missing" && status !== "pending" && (!layer.visibility || on)}">
        <div class="ly-main">
          <span class="ly-name">${esc(t(layer.name))}</span>
          ${info}
          ${action}
          ${control}
        </div>
        <div class="ly-meta">
          <span class="ly-class" data-class="${layer.dataClass}">${esc(t(`layers.class.${layer.dataClass}` as MessageKey))}</span>
          <span class="ly-origin" title="${esc(layer.origin)}">${esc(layer.origin)}</span>
          <span class="ly-status">${esc(t(`layers.status.${status}` as MessageKey))}</span>
        </div>
      </li>`;
  }

  function render() {
    root.innerHTML = `
      <div class="ly-head">
        <h2>${esc(t("layers.title"))}</h2>
        <button type="button" data-act="close" aria-label="${esc(t("layers.hide"))}" title="${esc(t("layers.hide"))}">‹</button>
      </div>
      <ul class="ly-list">${layers.map(row).join("")}</ul>`;
  }

  root.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-act="close"]')) {
      api.setOpen(false);
      return;
    }
    const act = target.closest<HTMLButtonElement>(".ly-action");
    if (act) {
      layers.find((l) => l.id === act.dataset.action)?.action?.run();
      return;
    }
    const sw = target.closest<HTMLButtonElement>(".ly-switch");
    if (!sw || sw.disabled) return;
    const layer = layers.find((l) => l.id === sw.dataset.layer);
    if (!layer?.visibility) return;
    layer.visibility.set(!layer.visibility.get());
    render();
    root.querySelector<HTMLButtonElement>(`.ly-switch[data-layer="${layer.id}"]`)?.focus();
  });

  const api: LayersPanel = {
    refresh: render,
    setOpen(value) {
      if (open === value) return;
      open = value;
      root.hidden = !open;
      toggleListeners.forEach((cb) => cb(open));
    },
    isOpen: () => open,
    onToggle(cb) {
      toggleListeners.push(cb);
      cb(open);
    },
  };

  root.hidden = !open;
  render();
  onLanguageChange(render);
  return api;
}
