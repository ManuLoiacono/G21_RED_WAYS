import { en } from "./en";
import { es, type MessageKey } from "./es";

/**
 * UI language (Spanish / English), switchable live without reloading the page.
 *
 * All user-facing text goes through `t(key)`. Code, identifiers and comments are always English;
 * contract wire values (template ids, `class`, `kind`, …) are data and are never translated.
 *
 * The initial language comes from, in order: `?lang=` in the URL, the last choice saved in
 * localStorage, and the browser language. `setLanguage` switches it and notifies every module
 * registered with `onLanguageChange`, which re-render their own text.
 */

export type Language = "es" | "en";
export const LANGUAGES: Language[] = ["es", "en"];

const STORAGE_KEY = "marswalk.lang";
const dictionaries: Record<Language, Record<MessageKey, string>> = { es, en };
const listeners: ((lang: Language) => void)[] = [];

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

let current: Language = detectLanguage();
document.documentElement.lang = current;

export function getLanguage(): Language {
  return current;
}

/** Locale for numbers and dates in the current language. */
export function numberLocale(): string {
  return current === "es" ? "es-AR" : "en-US";
}

function format(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

/** Translated message in the current language; `{name}` placeholders are replaced with `vars.name`. */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  return format(dictionaries[current][key] ?? es[key] ?? key, vars);
}

/** Same message in a given language (to recognize text that was generated before a switch). */
export function tIn(lang: Language, key: MessageKey, vars?: Record<string, string | number>): string {
  return format(dictionaries[lang][key] ?? es[key] ?? key, vars);
}

/** True if `text` is the translation of `key` in any language. */
export function isAnyTranslation(text: string, key: MessageKey, vars?: Record<string, string | number>): boolean {
  return LANGUAGES.some((lang) => tIn(lang, key, vars) === text);
}

/** Translation if the key exists, otherwise `fallback` (for keys built from data, e.g. statuses). */
export function tOr(key: string, fallback: string): string {
  return key in es ? t(key as MessageKey) : fallback;
}

/** Registers a callback that runs after every language switch. */
export function onLanguageChange(cb: (lang: Language) => void) {
  listeners.push(cb);
}

/** Switches the language in place: saves the choice, translates the static markup and notifies modules. */
export function setLanguage(next: Language) {
  if (next === current) return;
  current = next;
  document.documentElement.lang = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Without storage the choice lasts until the page is closed.
  }
  // Keep an explicit ?lang= in sync so a reload shows the same language.
  const url = new URL(location.href);
  if (url.searchParams.has("lang")) {
    url.searchParams.set("lang", next);
    history.replaceState(history.state, "", url);
  }
  translateStaticDom();
  listeners.forEach((cb) => cb(next));
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
