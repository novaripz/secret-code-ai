// The languages Panda's interface is translated into.
//
// `nativeName` is what the language calls itself, because a picker that lists
// "Spanish" to someone who reads Spanish is a picker written for the wrong
// person. `rtl` drives text direction; Arabic is the one here that needs it.

export interface Locale {
  code: string;
  nativeName: string;
  englishName: string;
  rtl?: boolean;
}

export const LOCALES: Locale[] = [
  { code: "en", nativeName: "English", englishName: "English" },
  { code: "es", nativeName: "Español", englishName: "Spanish" },
  { code: "fr", nativeName: "Français", englishName: "French" },
  { code: "pt", nativeName: "Português", englishName: "Portuguese" },
  { code: "zh", nativeName: "中文", englishName: "Chinese" },
  { code: "ar", nativeName: "العربية", englishName: "Arabic", rtl: true },
  { code: "ko", nativeName: "한국어", englishName: "Korean" },
  { code: "de", nativeName: "Deutsch", englishName: "German" },
  { code: "ja", nativeName: "日本語", englishName: "Japanese" },
  { code: "vi", nativeName: "Tiếng Việt", englishName: "Vietnamese" },
  { code: "hi", nativeName: "हिन्दी", englishName: "Hindi" },
  { code: "ru", nativeName: "Русский", englishName: "Russian" },
  { code: "it", nativeName: "Italiano", englishName: "Italian" },
  { code: "pl", nativeName: "Polski", englishName: "Polish" },
  { code: "tl", nativeName: "Tagalog", englishName: "Tagalog" },
  { code: "ht", nativeName: "Kreyòl Ayisyen", englishName: "Haitian Creole" },
];

export const DEFAULT_LOCALE = "en";

export function findLocale(code: string): Locale | undefined {
  return LOCALES.find((l) => l.code === code);
}

/**
 * What the device is asking for, if Panda speaks it.
 *
 * Browsers report things like "es-MX" or "pt-BR"; we match on the base
 * language, so a Mexican student and a Spanish student both land on Español.
 * Returns undefined rather than guessing, because the caller offers this as a
 * suggestion the student can decline — it is never applied silently.
 */
export function detectLocale(): Locale | undefined {
  if (typeof navigator === "undefined") return undefined;
  const candidates = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const tag of candidates) {
    if (!tag) continue;
    const base = tag.toLowerCase().split("-")[0];
    const match = LOCALES.find((l) => l.code === base);
    if (match) return match;
  }
  return undefined;
}
