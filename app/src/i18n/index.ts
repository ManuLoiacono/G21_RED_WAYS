import { en } from "./en";
import { es, type MessageKey } from "./es";

/**
 * UI language (Spanish / English).
 *
 * All user-facing text goes through `t(key)`. Code, identifiers and comments are always English;
 * contract wire values (template ids, `class`, `kind`, …) are data and are never translated.
 *
 * The language is chosen from, in order: `?lang=` in the URL, the last choice saved in
 * localStorage, and the browser language. Switching reloads the page (see `setLanguage`).
 */

export type Language = "es" | "en";
export const LANGUAGES: Language[] = ["es", "en"];

const STORAGE_KEY = "marswalk.lang";
const dictionaries: Record<Language, Record<MessageKey, string>> = { es, en };

function isLanguage(x: unknown): x is Language {
  return x === "es" || x === "en";
}

function detectLanguage(): Language {
  const fromUrl = new URLSearchParams(location.search).get("lang");
  if (isLanguage(fromUrl)) return fromUrl;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLanguage(saved)) return saved;
  } catch {
    // Storage blocked (private window, sandbox): fall back to the browser language.
  }
  return navigator.language.toLowerCase().startsWith("es") ? "es" : "en";
}

export const language: Language = detectLanguage();
document.documentElement.lang = language;

/** Locale for numbers and dates. */
export const numberLocale = language === "es" ? "es-AR" : "en-US";

/** Translated message; `{name}` placeholders are replaced with `vars.name`. */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  const text = dictionaries[language][key] ?? es[key] ?? key;
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

/** Translation if the key exists, otherwise `fallback` (for keys built from data, e.g. statuses). */
export function tOr(key: string, fallback: string): string {
  return key in es ? t(key as MessageKey) : fallback;
}

/**
 * Saves the choice and reloads. A reload keeps every panel consistent without each one having to
 * re-render itself; Cesium tiles come back from the browser cache.
 */
export function setLanguage(next: Language) {
  if (next === language) return;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Without storage the choice still applies through the URL.
  }
  const url = new URL(location.href);
  url.searchParams.set("lang", next);
  location.replace(url);
}

/**
 * Translates the static markup in index.html:
 * `data-i18n` → textContent, `data-i18n-title` → title, `data-i18n-aria` → aria-label.
 */
export function translateStaticDom(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n as MessageKey)));
  root.querySelectorAll<HTMLElement>("[data-i18n-title]").forEach((el) => (el.title = t(el.dataset.i18nTitle as MessageKey)));
  root
    .querySelectorAll<HTMLElement>("[data-i18n-aria]")
    .forEach((el) => el.setAttribute("aria-label", t(el.dataset.i18nAria as MessageKey)));
}

export type { MessageKey };
