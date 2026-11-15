import { onLanguageChange, t } from "../i18n";
import type { Preset } from "../look";
import { templateLabel } from "../mission/panel";
import type { PlanRequest } from "../mission/draft";
import { esc } from "./format";

/**
 * Top bar: brand (left), current mission context (center) and actions (right).
 * Technical options (render quality) live in the ⚙ menu so they do not compete with the task.
 */

/** Quality menu (⚙). Calls `onPreset` when a preset is picked; marks the active one. */
export function setUpSettingsMenu(onPreset: (preset: Preset) => void) {
  const button = document.getElementById("settingsBtn") as HTMLButtonElement;
  const menu = document.getElementById("settingsMenu")!;
  const presets = menu.querySelectorAll<HTMLButtonElement>("button[data-preset]");

  const setOpen = (open: boolean) => {
    menu.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
  };
  button.onclick = (e) => {
    e.stopPropagation();
    setOpen(menu.hidden);
    if (!menu.hidden) menu.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
  };
  document.addEventListener("click", (e) => {
    if (!menu.hidden && !menu.contains(e.target as Node)) setOpen(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !menu.hidden) {
      setOpen(false);
      button.focus();
    }
  });
  presets.forEach((btn) => {
    btn.onclick = () => {
      onPreset(btn.dataset.preset as Preset);
      presets.forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
    };
  });
}

/** Mission context uses registered IDs and the explicitly assumed UTC clock. */
export function createMissionContext(el: HTMLElement) {
  let last: Readonly<PlanRequest> | null = null;
  function render() {
    if (!last) return;
    el.innerHTML = [
      `<span class="ctx-chip ctx-family">${esc(templateLabel(last.mission.template_id))}</span>`,
      `<span class="ctx-chip">→ ${esc(last.destination.poi_id)}</span>`,
      `<span class="ctx-chip ctx-num">${esc(last.mission.departure_utc)}</span>`,
    ].join("");
  }
  onLanguageChange(render);
  return { update(state: Readonly<PlanRequest>) { last = state; render(); } };
}
