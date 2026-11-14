import { esc } from "../ui/format";
import { allSources, getSource, onSourcesChange, type SourceClass, type SourceEntry } from "./sources";

/**
 * Panel «Fuentes» (P1-05): se abre solo si se pide (botón «Fuentes» o cualquier ⓘ).
 * Nada de esto queda fijo sobre la escena (D8).
 */

const GROUP_LABEL: Record<SourceClass, string> = {
  topografica: "Topográfica",
  optica: "Óptica y visual",
  atmosferica: "Atmosférica",
  termica: "Térmica",
  supuesto: "Supuestos y datos de prueba",
};
const GROUP_ORDER: SourceClass[] = ["topografica", "optica", "atmosferica", "termica", "supuesto"];

const KIND_LABEL: Record<string, string> = {
  observado: "Observado",
  derivado: "Derivado",
  modelado: "Modelado",
  supuesto: "Supuesto o simulado",
};
const ORIGIN_LABEL: Record<string, string> = { live: "Consulta en vivo", cache: "Respaldo guardado" };

export function createSourcesPanel(dialog: HTMLDialogElement) {
  let highlighted: string | null = null;

  function row(label: string, value?: string) {
    return value ? `<div><dt>${label}</dt><dd>${value}</dd></div>` : "";
  }

  function entry(s: SourceEntry) {
    const p = s.provenance;
    const url = p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${esc(p.url)}</a>` : undefined;
    return `
      <li id="src-${esc(s.id)}" class="src-entry ${s.id === highlighted ? "highlight" : ""}" tabindex="-1">
        <h4>${esc(s.title)} ${s.fixture ? `<span class="src-tag">fixture</span>` : ""}</h4>
        <p class="src-role">${esc(s.role)}</p>
        <dl>
          ${row("Tipo de sustento", esc(KIND_LABEL[p.kind ?? ""] ?? p.kind ?? "—"))}
          ${row("Misión", p.mission && esc(p.mission))}
          ${row("Instrumento", p.instrument && esc(p.instrument))}
          ${row("Producto", p.product && esc(p.product))}
          ${row("Obtención", p.origin ? esc(ORIGIN_LABEL[p.origin] ?? p.origin) : s.group === "supuesto" ? undefined : "La app no lo consulta: lo usa el motor")}
          ${row("Consultado", p.fetched_at && esc(new Date(p.fetched_at).toLocaleString("es-AR")))}
          ${row("Enlace", url)}
        </dl>
        ${s.notes?.length ? `<ul class="src-notes">${s.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
      </li>`;
  }

  function render() {
    const sources = allSources();
    dialog.innerHTML = `
      <div class="src-head">
        <h2 id="sourcesTitle">Fuentes</h2>
        <button type="button" data-act="close" aria-label="Cerrar fuentes">×</button>
      </div>
      <p class="mp-hint">De dónde sale cada capa, regla o valor y qué tipo de sustento tiene: observado, derivado, modelado o supuesto.</p>
      ${GROUP_ORDER.map((g) => {
        const items = sources.filter((s) => s.group === g);
        if (!items.length) return "";
        return `<section><h3>${GROUP_LABEL[g]}</h3><ul class="src-list">${items.map(entry).join("")}</ul></section>`;
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
    // Clic en el fondo (fuera del contenido) o en «×» cierra.
    if (e.target === dialog || (e.target as HTMLElement).closest('[data-act="close"]')) dialog.close();
  });
  onSourcesChange(() => {
    if (dialog.open) render();
  });

  // Cualquier botón con data-source (los ⓘ) abre el panel en esa fuente.
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
