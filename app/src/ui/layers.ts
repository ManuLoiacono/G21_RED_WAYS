import { onLanguageChange, t, type MessageKey } from "../i18n";
import { esc } from "./format";

/**
 * "Layers" panel: the kinds of data shown on the scene (the challenge asks for several kinds of
 * NASA data layered together), grouped in three sections (terrain, analysis, mission observations).
 * Each row is one line: name, optional action, switch and ⓘ. Mission/instrument and the rest of
 * the provenance stay behind the ⓘ (D8). The status is shown only when there is something to say
 * (loading, not available, test data). Details (REMS card, THEMIS scale) expand on demand.
 */

/**
 * - `loaded`: on screen, from a local file.
 * - `streaming`: on screen, streamed from an online service.
 * - `fixture`: on screen, but test data (not real).
 * - `missing`: available in the project but not generated on this machine.
 * - `pending`: not connected yet (another team member's task).
 */
export type LayerStatus = "loaded" | "streaming" | "fixture" | "missing" | "pending";

export type LayerSection = "terrain" | "analysis" | "observations";
const SECTIONS: LayerSection[] = ["terrain", "analysis", "observations"];

export interface LayerDef {
  id: string;
  /** Section of the panel the row belongs to. */
  section: LayerSection;
  /** Optional one-line summary under the name (plain text, escaped here). */
  summary?: () => string;
  /** Text shown while the layer is `pending` (defaults to a generic "not connected"). */
  pendingKey?: MessageKey;
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
  /** Details HTML (already escaped), expandable from the row while the layer is on screen. */
  legend?: () => string;
}

export interface LayersPanel {
  /** Re-reads statuses (for example, after a layer finishes loading). */
  refresh(): void;
  setOpen(open: boolean): void;
  isOpen(): boolean;
  onToggle(cb: (open: boolean) => void): void;
}

export function createLayersPanel(root: HTMLElement, layers: LayerDef[]): LayersPanel {
  // Starts closed (the "Layers" pill); the user opens it when needed.
  let open = false;
  /** Rows whose details are expanded. */
  const expanded = new Set<string>();
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
    const active = status !== "missing" && status !== "pending" && (!layer.visibility || on);
    const canExpand = active && Boolean(layer.legend);
    const isOpen = canExpand && expanded.has(layer.id);
    const toggleDetails = canExpand
      ? `<button type="button" class="ly-more" data-details="${layer.id}" aria-expanded="${isOpen}"
           aria-label="${esc(t(isOpen ? "layers.details.hide" : "layers.details.show", { layer: t(layer.name) }))}"
           title="${esc(t(isOpen ? "layers.details.hide" : "layers.details.show", { layer: t(layer.name) }))}">⌄</button>`
      : "";
    // Status only when it tells something: loading / not available / test data.
    const statusText =
      status === "pending" ? t(layer.pendingKey ?? "layers.status.pending")
      : status === "missing" ? t("layers.status.missing")
      : status === "fixture" ? t("layers.status.fixture")
      : "";
    const summary = active && layer.summary ? layer.summary() : "";
    const sub = summary || statusText;
    return `
      <li class="ly-row" data-status="${status}" data-active="${active}" data-class="${layer.dataClass}">
        <div class="ly-main">
          <span class="ly-name">${esc(t(layer.name))}</span>
          <!-- Fixed columns so each kind of control lines up across rows: extra · ⓘ · switch/BASE. -->
          <span class="ly-slot ly-slot-extra">${toggleDetails}${action}</span>
          <span class="ly-slot ly-slot-info">${info}</span>
          <span class="ly-slot ly-slot-control">${control}</span>
        </div>
        ${sub ? `<div class="ly-sub ${summary ? "ly-summary" : "ly-state"}">${esc(sub)}</div>` : ""}
        ${isOpen ? `<div class="ly-legend">${layer.legend!()}</div>` : ""}
      </li>`;
  }

  function render() {
    root.classList.toggle("ly-collapsed", !open);
    if (!open) {
      // Collapsed: a compact "Layers" pill stays in place and reopens the panel.
      root.innerHTML = `<button type="button" class="ly-reopen" data-act="open" aria-expanded="false"
          aria-label="${esc(t("layers.show"))}" title="${esc(t("layers.show"))}">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/></svg>
          <span>${esc(t("layers.title"))}</span><span class="ly-reopen-arrow" aria-hidden="true">›</span></button>`;
      return;
    }
    root.innerHTML = `
      <div class="ly-head">
        <h2>${esc(t("layers.title"))}</h2>
        <button type="button" data-act="close" aria-label="${esc(t("layers.hide"))}" title="${esc(t("layers.hide"))}">‹</button>
      </div>
      ${SECTIONS.map((section) => {
        const items = layers.filter((l) => l.section === section);
        return items.length ? `<section class="ly-section" data-section="${section}">
          <h3>${esc(t(`layers.section.${section}`))}</h3>
          <ul class="ly-list">${items.map(row).join("")}</ul></section>` : "";
      }).join("")}`;
  }

  root.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-act="close"]')) {
      api.setOpen(false);
      root.querySelector<HTMLButtonElement>(".ly-reopen")?.focus();
      return;
    }
    if (target.closest('[data-act="open"]')) {
      api.setOpen(true);
      root.querySelector<HTMLButtonElement>('[data-act="close"]')?.focus();
      return;
    }
    const more = target.closest<HTMLButtonElement>(".ly-more");
    if (more) {
      const id = more.dataset.details!;
      if (expanded.has(id)) expanded.delete(id); else expanded.add(id);
      render();
      root.querySelector<HTMLButtonElement>(`.ly-more[data-details="${id}"]`)?.focus();
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
      render();
      toggleListeners.forEach((cb) => cb(open));
    },
    isOpen: () => open,
    onToggle(cb) {
      toggleListeners.push(cb);
      cb(open);
    },
  };

  render();
  onLanguageChange(render);
  return api;
}
