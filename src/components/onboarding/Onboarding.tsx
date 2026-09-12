"use client";

import { useState } from "react";
import { useProfileStore } from "@/store/useProfileStore";
import { LanguagePicker } from "./LanguagePicker";
import { Wordmark } from "@/components/Wordmark";
import { detectLocale, translate, type StringKey } from "@/lib/i18n";

// First-run setup. We ask for the few things that make everything after this
// feel personal: what to call them, when their birthday is (year optional),
// and what they're into. Every field can be skipped.

// The stored value stays English while only the label is translated: a student
// who switches language later would otherwise end up with the same interest
// saved twice under two spellings.
const LIKE_SUGGESTIONS: { value: string; key: StringKey }[] = [
  { value: "Gaming", key: "interest.gaming" },
  { value: "Basketball", key: "interest.basketball" },
  { value: "Music", key: "interest.music" },
  { value: "Anime", key: "interest.anime" },
  { value: "Art", key: "interest.art" },
  { value: "Soccer", key: "interest.soccer" },
  { value: "Minecraft", key: "interest.minecraft" },
  { value: "Football", key: "interest.football" },
  { value: "Coding", key: "interest.coding" },
  { value: "Skating", key: "interest.skating" },
  { value: "Movies", key: "interest.movies" },
  { value: "Cars", key: "interest.cars" },
];

/** Month names in the student's own language, so the picker reads to them. */
function monthNames(locale: string): string[] {
  const format = new Intl.DateTimeFormat(locale, { month: "long" });
  return Array.from({ length: 12 }, (_, i) => format.format(new Date(Date.UTC(2000, i, 1))));
}

type Step = 0 | 1 | 2 | 3 | 4;

export function Onboarding() {
  const completeOnboarding = useProfileStore((s) => s.completeOnboarding);
  const languages = useProfileStore((s) => s.languages);
  const setLanguages = useProfileStore((s) => s.setLanguages);

  const [step, setStep] = useState<Step>(0);
  // Offered, never applied on its own: a school laptop set to English says
  // nothing about what the student actually reads.
  const [detected] = useState(() => detectLocale());
  const lang = languages.interface;
  const t = (key: StringKey, vars?: Record<string, string | number>) => translate(lang, key, vars);
  const months = monthNames(lang);
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [month, setMonth] = useState<string>("");
  const [day, setDay] = useState<string>("");
  const [year, setYear] = useState<string>("");
  const [likes, setLikes] = useState<string[]>([]);
  const [customLike, setCustomLike] = useState("");
  const [aboutMe, setAboutMe] = useState("");

  const firstName = (nickname.trim() || name.trim().split(/\s+/)[0] || "").trim();

  function toggleLike(like: string) {
    setLikes((prev) => (prev.includes(like) ? prev.filter((l) => l !== like) : [...prev, like]));
  }

  function addCustomLike() {
    const trimmed = customLike.trim();
    if (!trimmed) return;
    if (!likes.some((l) => l.toLowerCase() === trimmed.toLowerCase())) setLikes((prev) => [...prev, trimmed]);
    setCustomLike("");
  }

  function finish() {
    completeOnboarding({
      name: name.trim(),
      nickname: nickname.trim(),
      birthday: {
        month: month ? Number(month) : null,
        day: day ? Number(day) : null,
        year: year ? Number(year) : null,
      },
      likes,
      aboutMe: aboutMe.trim(),
    });
  }

  const canContinue = step === 1 ? name.trim().length > 0 : true;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[var(--bg)] p-4">
      <div className="w-full max-w-md">
        <div className="mb-8">
          <Wordmark />
        </div>

        <div key={step} className="animate-rise">
          {step === 0 && (
            <Step title={t("onboarding.languageTitle")} hint={t("onboarding.languageHint")}>
              <LanguagePicker
                selected={lang}
                detected={detected}
                onSelect={(code) => setLanguages({ interface: code })}
                autoFocus
              />
            </Step>
          )}

          {step === 1 && (
            <Step title={t("onboarding.nameTitle")} hint={t("onboarding.nameHint")}>
              <TextField value={name} onChange={setName} placeholder={t("onboarding.namePlaceholder")} autoFocus onEnter={() => canContinue && setStep(2)} />
            </Step>
          )}

          {step === 2 && (
            <Step
              title={
                name.trim()
                  ? t("onboarding.nicknameTitle", { name: name.trim().split(/\s+/)[0] })
                  : t("onboarding.nicknameTitleNoName")
              }
              hint={t("onboarding.nicknameHint")}
            >
              <TextField value={nickname} onChange={setNickname} placeholder={t("onboarding.nicknamePlaceholder")} autoFocus onEnter={() => setStep(3)} />
            </Step>
          )}

          {step === 4 && (
            <Step title={t("onboarding.birthdayTitle")} hint={t("onboarding.birthdayHint")}>
              <div className="flex gap-2">
                <select
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="flex-1 rounded-xl border border-[var(--line-strong)] bg-[var(--surface-2)] px-3 py-3 text-sm text-[var(--text)] outline-none focus:border-[var(--focus)]"
                >
                  <option value="">{t("date.month")}</option>
                  {months.map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
                <input
                  value={day}
                  onChange={(e) => setDay(e.target.value.replace(/\D/g, "").slice(0, 2))}
                  placeholder={t("date.day")}
                  inputMode="numeric"
                  className="w-20 rounded-xl border border-[var(--line-strong)] bg-[var(--surface-2)] px-3 py-3 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--focus)]"
                />
                <input
                  value={year}
                  onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder={t("date.year")}
                  inputMode="numeric"
                  className="w-24 rounded-xl border border-[var(--line-strong)] bg-[var(--surface-2)] px-3 py-3 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--focus)]"
                />
              </div>
            </Step>
          )}

          {step === 3 && (
            <Step title={t("onboarding.likesTitle")} hint={t("onboarding.likesHint")}>
              <div className="flex flex-wrap gap-2">
                {[
                  ...LIKE_SUGGESTIONS,
                  ...likes
                    .filter((l) => !LIKE_SUGGESTIONS.some((s) => s.value === l))
                    .map((l) => ({ value: l, key: undefined })),
                ].map(({ value, key }) => {
                  const on = likes.includes(value);
                  return (
                    <button
                      key={value}
                      onClick={() => toggleLike(value)}
                      className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                        on
                          ? "border-transparent bg-[var(--accent)] text-[var(--accent-contrast)]"
                          : "border-[var(--line-strong)] text-[var(--text-dim)] hover:bg-[var(--surface-2)]"
                      }`}
                    >
                      {key ? t(key) : value}
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 flex gap-2">
                <input
                  value={customLike}
                  onChange={(e) => setCustomLike(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustomLike())}
                  placeholder={t("onboarding.addYourOwn")}
                  className="flex-1 rounded-xl border border-[var(--line-strong)] bg-[var(--surface-2)] px-3 py-2.5 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--focus)]"
                />
                <button
                  onClick={addCustomLike}
                  className="rounded-xl border border-[var(--line-strong)] px-4 text-sm text-[var(--text-dim)] hover:bg-[var(--surface-2)]"
                >
                  {t("action.add")}
                </button>
              </div>

              <textarea
                value={aboutMe}
                onChange={(e) => setAboutMe(e.target.value)}
                rows={3}
                placeholder={t("onboarding.aboutMePlaceholder")}
                className="mt-3 w-full resize-none rounded-xl border border-[var(--line-strong)] bg-[var(--surface-2)] px-3 py-2.5 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--focus)]"
              />
            </Step>
          )}
        </div>

        <div className="mt-8 flex items-center justify-between">
          <div className="flex gap-1.5">
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${i === step ? "w-6 bg-[var(--text)]" : "w-1.5 bg-[var(--surface-3)]"}`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep((s) => (s - 1) as Step)}
                className="rounded-full px-4 py-2 text-sm text-[var(--text-dim)] hover:bg-[var(--surface-2)]"
              >
                {t("action.back")}
              </button>
            )}
            <button
              onClick={() => (step === 4 ? finish() : setStep((s) => (s + 1) as Step))}
              disabled={!canContinue}
              className="rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-[var(--accent-contrast)] disabled:opacity-30"
            >
              {step === 4
                ? firstName
                  ? t("onboarding.finish", { name: firstName })
                  : t("onboarding.finishNoName")
                : t("action.continue")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Step({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-[var(--text-faint)]">{hint}</p>
      <div className="mt-6">{children}</div>
    </div>
  );
}

function TextField({
  value,
  onChange,
  placeholder,
  autoFocus,
  onEnter,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoFocus?: boolean;
  onEnter?: () => void;
}) {
  return (
    <input
      autoFocus={autoFocus}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
      placeholder={placeholder}
      className="w-full rounded-xl border border-[var(--line-strong)] bg-[var(--surface-2)] px-4 py-3.5 text-base text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--focus)]"
    />
  );
}
