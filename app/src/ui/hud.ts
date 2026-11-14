import { onLanguageChange, t } from "../i18n";
import type { Preset } from "../look";
import { poiTitle } from "../mission/pois";
import { templateLabel } from "../mission/templates";
import type { MissionState, Poi } from "../mission/types";
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

/** Center of the bar: family → destination · sol · departure, kept in sync with the mission panel. */
export function createMissionContext(el: HTMLElement, pois: Poi[]) {
  let last: Readonly<MissionState> | null = null;

  function render() {
    if (!last) return;
    const dest = pois.find((p) => p.id === last!.destination_poi);
    el.innerHTML = [
      `<span class="ctx-chip ctx-family">${esc(templateLabel(last.template_id))}</span>`,
      `<span class="ctx-chip" title="${esc(t("hud.ctx.destination"))}">→ ${esc(dest ? poiTitle(dest) : t("hud.ctx.noDestination"))}</span>`,
      `<span class="ctx-chip ctx-num" title="${esc(t("hud.ctx.sol.title"))}">${esc(t("hud.ctx.sol", { sol: last.sol }))}</span>`,
      `<span class="ctx-chip ctx-num" title="${esc(t("hud.ctx.departure.title"))}">${esc(t("hud.ctx.departure", { time: last.departure_local }))}</span>`,
    ].join("");
  }

  onLanguageChange(render);
  return {
    update(state: Readonly<MissionState>) {
      last = state;
      render();
    },
  };
}
