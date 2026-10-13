"use client";

import { useMemo, useState } from "react";
import { LOCALES, type Locale } from "@/lib/i18n/locales";
import { translate } from "@/lib/i18n";
import { SearchIcon, CheckIcon, SparkleIcon } from "@/components/icons";

// Language selection.
//
// Two rules shape this. The detected language is offered, never applied: a
// school laptop set to English does not mean the student reads English. And
// every language is listed in its own script, because "Spanish" is the wrong
// word to show someone who is looking for "Español".

export function LanguagePicker({
  selected,
  detected,
  onSelect,
  autoFocus,
  label,
}: {
  selected: string;
  detected?: Locale;
  onSelect: (code: string) => void;
  autoFocus?: boolean;
  /** The list's accessible name, when "Language" alone is ambiguous. */
  label?: string;
}) {
  const [query, setQuery] = useState("");

  // Search matches either name, so "spanish" and "español" both find it.
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return LOCALES;
    return LOCALES.filter(
      (l) =>
        l.nativeName.toLowerCase().includes(q) ||
        l.englishName.toLowerCase().includes(q) ||
        l.code === q,
    );
  }, [query]);

  return (
    <div className="flex flex-col gap-3">
      {detected && detected.code !== selected && (
        <button
          type="button"
          onClick={() => onSelect(detected.code)}
          className="card card-interactive flex items-center gap-3 px-4 py-3 text-start"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--accent-soft)] text-[var(--accent-text)]">
            <SparkleIcon className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium text-[var(--text)]">
              {translate(detected.code, "onboarding.useDetected", { language: detected.nativeName })}
            </span>
            <span className="mt-0.5 block text-[13px] text-[var(--text-faint)]">
              {translate(selected, "onboarding.detected", { language: detected.nativeName })}
            </span>
          </span>
        </button>
      )}

      <div className="relative">
        <SearchIcon className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-faint)]" />
        <input
          type="search"
          autoFocus={autoFocus}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={translate(selected, "onboarding.searchLanguages")}
          aria-label={translate(selected, "onboarding.searchLanguages")}
          className="input ps-9"
        />
      </div>

      <div
        role="listbox"
        aria-label={label ?? translate(selected, "settings.language")}
        className="max-h-[300px] overflow-y-auto rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-1)] p-1"
      >
        {results.map((l) => {
          const on = l.code === selected;
          return (
            <button
              key={l.code}
              type="button"
              role="option"
              aria-selected={on}
              onClick={() => onSelect(l.code)}
              className={`tap flex w-full items-center justify-between gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 text-start transition-colors ${
                on ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--surface-2)]"
              }`}
            >
              <span className="min-w-0">
                <span
                  className={`block truncate text-sm font-medium ${on ? "text-[var(--accent-text)]" : "text-[var(--text)]"}`}
                  dir={l.rtl ? "rtl" : "ltr"}
                >
                  {l.nativeName}
                </span>
                {l.nativeName !== l.englishName && (
                  <span className="block truncate text-xs text-[var(--text-faint)]">{l.englishName}</span>
                )}
              </span>
              {on && <CheckIcon className="h-4 w-4 shrink-0 text-[var(--accent-text)]" />}
            </button>
          );
        })}

        {results.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-[var(--text-faint)]">
            {translate(selected, "onboarding.noLanguageMatch", { query })}
          </p>
        )}
      </div>
    </div>
  );
}
