"use client";

import { useMemo, useState } from "react";
import { LOCALES, type Locale } from "@/lib/i18n/locales";
import { translate } from "@/lib/i18n";
import { SearchIcon, CheckIcon } from "@/components/icons";

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
}: {
  selected: string;
  detected?: Locale;
  onSelect: (code: string) => void;
  autoFocus?: boolean;
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
          onClick={() => onSelect(detected.code)}
          className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line-strong)] px-4 py-3 text-left transition-colors hover:bg-[var(--surface-2)]"
        >
          <span className="min-w-0">
            <span className="block text-sm font-medium text-[var(--text)]">
              {translate(detected.code, "onboarding.useDetected", { language: detected.nativeName })}
            </span>
            <span className="mt-0.5 block text-xs text-[var(--text-faint)]">
              {translate(selected, "onboarding.detected", { language: detected.nativeName })}
            </span>
          </span>
        </button>
      )}

      <div className="flex items-center gap-2.5 rounded-xl border border-[var(--line-strong)] bg-[var(--surface-2)] px-3.5 py-2.5 focus-within:border-[var(--focus)]">
        <SearchIcon className="h-4 w-4 shrink-0 text-[var(--text-faint)]" />
        <input
          autoFocus={autoFocus}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={translate(selected, "onboarding.searchLanguages")}
          aria-label={translate(selected, "onboarding.searchLanguages")}
          className="w-full bg-transparent text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
        />
      </div>

      <div
        role="listbox"
        aria-label={translate(selected, "settings.language")}
        className="max-h-[280px] overflow-y-auto rounded-xl border border-[var(--line)]"
      >
        {results.map((l) => {
          const on = l.code === selected;
          return (
            <button
              key={l.code}
              role="option"
              aria-selected={on}
              onClick={() => onSelect(l.code)}
              className={`flex w-full items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3 text-left last:border-b-0 transition-colors ${
                on ? "bg-[var(--surface-2)]" : "hover:bg-[var(--surface-2)]"
              }`}
            >
              <span className="min-w-0">
                <span
                  className="block truncate text-sm font-medium text-[var(--text)]"
                  dir={l.rtl ? "rtl" : "ltr"}
                >
                  {l.nativeName}
                </span>
                {l.nativeName !== l.englishName && (
                  <span className="block truncate text-xs text-[var(--text-faint)]">{l.englishName}</span>
                )}
              </span>
              {on && <CheckIcon className="h-4 w-4 shrink-0 text-[var(--text)]" />}
            </button>
          );
        })}

        {results.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-[var(--text-faint)]">
            No languages match “{query}”.
          </p>
        )}
      </div>
    </div>
  );
}
