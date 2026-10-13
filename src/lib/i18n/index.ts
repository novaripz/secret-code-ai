"use client";

import { createContext, createElement, useContext, useEffect, type ReactNode } from "react";
import { CATALOGS, en, type StringKey } from "./strings";
import { DEFAULT_LOCALE, findLocale } from "./locales";

export { LOCALES, DEFAULT_LOCALE, findLocale, detectLocale, type Locale } from "./locales";
export type { StringKey } from "./strings";

/**
 * Looks a string up in the active locale, falling back to English.
 *
 * `vars` fills {placeholders}. Falling back rather than showing the key means a
 * partially translated locale reads as a mix of two languages, which a student
 * can still use, instead of "chat.greeting" staring back at them.
 */
export function translate(locale: string, key: StringKey, vars?: Record<string, string | number>): string {
  const catalog = CATALOGS[locale];
  let text: string = catalog?.[key] ?? en[key] ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }
  return text;
}

interface I18n {
  locale: string;
  t: (key: StringKey, vars?: Record<string, string | number>) => string;
  dir: "ltr" | "rtl";
}

const I18nContext = createContext<I18n>({
  locale: DEFAULT_LOCALE,
  t: (key, vars) => translate(DEFAULT_LOCALE, key, vars),
  dir: "ltr",
});

export function I18nProvider({ locale, children }: { locale: string; children: ReactNode }) {
  const dir = findLocale(locale)?.rtl ? "rtl" : "ltr";
  const value: I18n = {
    locale,
    t: (key, vars) => translate(locale, key, vars),
    dir,
  };

  // The document has to say which language it is in. `<html lang="en">` was
  // hard-coded, so a screen reader read Spanish buttons with an English voice,
  // the browser offered to translate a page that was already translated, and
  // Arabic — which locales.ts marks right-to-left — was drawn left-to-right.
  // The before-paint script in layout.tsx sets both for the first frame; this
  // keeps them right when the student changes language.
  useEffect(() => {
    const root = document.documentElement;
    root.lang = locale;
    root.dir = dir;
  }, [locale, dir]);

  return createElement(I18nContext.Provider, { value }, children);
}

/** The hook every component uses. `const { t } = useI18n()`. */
export function useI18n(): I18n {
  return useContext(I18nContext);
}
