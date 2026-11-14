import { numberLocale, t, tOr } from "../i18n";
import { esc } from "../ui/format";
import { allSources, getSource, onSourcesChange, type SourceClass, type SourceEntry } from "./sources";

/**
 * "Sources" panel (P1-05): opens only on request ("Sources" button or any ⓘ).
 * Nothing here stays fixed on top of the scene (D8).
 */

const GROUP_ORDER: SourceClass[] = ["topografica", "optica", "atmosferica", "termica", "supuesto"];

export function createSourcesPanel(dialog: HTMLDialogElement) {
  let highlighted: string | null = null;

  function row(label: string, value?: string) {
    return value ? `<div><dt>${esc(label)}</dt><dd>${value}</dd></div>` : "";
  }

  function entry(s: SourceEntry) {
    const p = s.provenance;
    const url = p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${esc(p.url)}</a>` : undefined;
    return `
      <li id="src-${esc(s.id)}" class="src-entry ${s.id === highlighted ? "highlight" : ""}" tabindex="-1">
        <h4>${esc(s.title)} ${s.fixture ? `<span class="src-tag">fixture</span>` : ""}</h4>
        <p class="src-role">${esc(s.role)}</p>
        <dl>
          ${row(t("src.field.kind"), esc(p.kind ? tOr(`src.kind.${p.kind}`, p.kind) : "—"))}
          ${row(t("src.field.mission"), p.mission && esc(p.mission))}
          ${row(t("src.field.instrument"), p.instrument && esc(p.instrument))}
          ${row(t("src.field.product"), p.product && esc(p.product))}
          ${row(
            t("src.field.origin"),
            p.origin ? esc(tOr(`src.origin.${p.origin}`, p.origin)) : s.group === "supuesto" ? undefined : esc(t("src.notQueried")),
          )}
          ${row(t("src.field.fetched"), p.fetched_at && esc(new Date(p.fetched_at).toLocaleString(numberLocale)))}
          ${row(t("src.field.link"), url)}
        </dl>
        ${s.notes?.length ? `<ul class="src-notes">${s.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
      </li>`;
  }

  function render() {
    const sources = allSources();
    dialog.innerHTML = `
      <div class="src-head">
        <h2 id="sourcesTitle">${esc(t("src.title"))}</h2>
        <button type="button" data-act="close" aria-label="${esc(t("src.close"))}">×</button>
      </div>
      <p class="mp-hint">${esc(t("src.intro"))}</p>
      ${GROUP_ORDER.map((g) => {
        const items = sources.filter((s) => s.group === g);
        if (!items.length) return "";
        return `<section><h3>${esc(tOr(`src.group.${g}`, g))}</h3><ul class="src-list">${items.map(entry).join("")}</ul></section>`;
      }).join("")}
    `;
  }

  function open(sourceId?: string) {
    highlighted = sourceId && getSource(sourceId) ? sourceId : null;
    render();
    if (!dialog.open) dialog.showModal();
    if (highlighted) {
      const el = dialog.querySelector<HTMLElement>(`#src-${CSS.escape(highlighted)}`);
      el?.scrollIntoView({ block: "center" });
      el?.focus({ preventScroll: true });
    }
  }

  dialog.setAttribute("aria-labelledby", "sourcesTitle");
  dialog.addEventListener("click", (e) => {
    // A click on the backdrop (outside the content) or on "×" closes it.
    if (e.target === dialog || (e.target as HTMLElement).closest('[data-act="close"]')) dialog.close();
  });
  onSourcesChange(() => {
    if (dialog.open) render();
  });

  // Any button with data-source (the ⓘ buttons) opens the panel at that source.
  document.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-source]");
    if (btn?.dataset.source) {
      e.preventDefault();
      e.stopPropagation();
      open(btn.dataset.source);
    }
  });

  return { open };
}
