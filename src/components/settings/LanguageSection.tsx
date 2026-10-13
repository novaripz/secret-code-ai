"use client";

import { useId } from "react";
import { useProfileStore } from "@/store/useProfileStore";
import { useI18n } from "@/lib/i18n";
import { LOCALES, findLocale } from "@/lib/i18n/locales";
import { LanguagePicker } from "@/components/onboarding/LanguagePicker";
import { Card } from "./parts";

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
  const replyId = useId();
  const ui = findLocale(languages.interface);

  return (
    <div className="space-y-5">
      <Card title={t("settings.interfaceLanguage")} description={t("settings.interfaceLanguageHint")}>
        <LanguagePicker
          selected={languages.interface}
          label={t("settings.interfaceLanguage")}
          onSelect={(code) => setLanguages({ interface: code })}
        />
      </Card>

      <Card title={t("settings.replyLanguage")} description={t("settings.replyLanguageHint")}>
        {/* Every language Panda speaks, not the first six. The list used to be
            cut short, so a student who reads Korean could have the buttons in
            Korean and no way at all to ask for answers in it. */}
        <label htmlFor={replyId} className="sr-only">
          {t("settings.replyLanguage")}
        </label>
        <select
          id={replyId}
          value={languages.reply}
          onChange={(e) => setLanguages({ reply: e.target.value })}
          className="input select max-w-sm"
        >
          <option value="auto">
            {t("settings.sameAsInterface")}
            {ui ? ` (${ui.nativeName})` : ""}
          </option>
          {LOCALES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.nativeName === l.englishName ? l.nativeName : `${l.nativeName} — ${l.englishName}`}
            </option>
          ))}
        </select>
      </Card>
    </div>
  );
}
