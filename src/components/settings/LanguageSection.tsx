"use client";

import { useProfileStore } from "@/store/useProfileStore";
import { useI18n } from "@/lib/i18n";
import { LOCALES, findLocale } from "@/lib/i18n/locales";
import { LanguagePicker } from "@/components/onboarding/LanguagePicker";

// Two separate settings, because they are genuinely different questions.
//
// A student learning English often wants the app in Spanish but answers in
// English, so they can read the interface easily while still practising. The
// reverse happens too. Tying them together would force a choice neither of
// them wants.

export function LanguageSection() {
  const languages = useProfileStore((s) => s.languages);
  const setLanguages = useProfileStore((s) => s.setLanguages);
  const { t } = useI18n();

  return (
    <div className="space-y-8">
      <div>
        <p className="mb-1 text-sm font-medium text-[var(--text)]">{t("settings.interfaceLanguage")}</p>
        <p className="mb-3 text-sm text-[var(--text-faint)]">
          Buttons, menus and everything else Panda writes on screen.
        </p>
        <LanguagePicker
          selected={languages.interface}
          onSelect={(code) => setLanguages({ interface: code })}
        />
      </div>

      <div>
        <p className="mb-1 text-sm font-medium text-[var(--text)]">{t("settings.replyLanguage")}</p>
        <p className="mb-3 text-sm text-[var(--text-faint)]">
          The language of Panda&apos;s answers. Keep these different if you want the app in one
          language and your answers in another.
        </p>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setLanguages({ reply: "auto" })}
            aria-pressed={languages.reply === "auto"}
            className={`rounded-xl border px-3.5 py-2 text-sm transition-colors ${
              languages.reply === "auto"
                ? "border-[var(--text)] bg-[var(--surface-2)] font-medium text-[var(--text)]"
                : "border-[var(--line)] text-[var(--text-dim)] hover:bg-[var(--surface-2)]"
            }`}
          >
            {t("settings.sameAsInterface")}
            <span className="ml-1.5 text-xs text-[var(--text-faint)]">
              ({findLocale(languages.interface)?.nativeName})
            </span>
          </button>

          {LOCALES.slice(0, 6).map((l) => (
            <button
              key={l.code}
              onClick={() => setLanguages({ reply: l.code })}
              aria-pressed={languages.reply === l.code}
              className={`rounded-xl border px-3.5 py-2 text-sm transition-colors ${
                languages.reply === l.code
                  ? "border-[var(--text)] bg-[var(--surface-2)] font-medium text-[var(--text)]"
                  : "border-[var(--line)] text-[var(--text-dim)] hover:bg-[var(--surface-2)]"
              }`}
            >
              {l.nativeName}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
