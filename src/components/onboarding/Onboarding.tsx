"use client";

import { useState } from "react";
import { useProfileStore } from "@/store/useProfileStore";
import { LanguagePicker } from "./LanguagePicker";
import { Wordmark } from "@/components/Wordmark";
import { detectLocale, translate } from "@/lib/i18n";

// First-run setup. We ask for the few things that make everything after this
// feel personal: what to call them, when their birthday is (year optional),
// and what they're into. Every field can be skipped.

const LIKE_SUGGESTIONS = [
  "Gaming",
  "Basketball",
  "Music",
  "Anime",
  "Art",
  "Soccer",
  "Minecraft",
  "Football",
  "Coding",
  "Skating",
  "Movies",
  "Cars",
];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

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
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) =>
    translate(lang, key, vars);
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
            <Step title={t("onboarding.nameTitle")} hint="This is just so the app knows what to call you.">
              <TextField value={name} onChange={setName} placeholder={t("onboarding.namePlaceholder")} autoFocus onEnter={() => canContinue && setStep(2)} />
            </Step>
          )}

          {step === 2 && (
            <Step
              title={`Nice to meet you${name.trim() ? `, ${name.trim().split(/\s+/)[0]}` : ""}. Got a nickname?`}
              hint="What your friends call you. Skip it and we'll use your name."
            >
              <TextField value={nickname} onChange={setNickname} placeholder="Nickname (optional)" autoFocus onEnter={() => setStep(3)} />
            </Step>
          )}

          {step === 4 && (
            <Step title="When's your birthday?" hint="The year is optional — leave it blank if you'd rather not say.">
              <div className="flex gap-2">
                <select
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="flex-1 rounded-xl border border-[var(--line-strong)] bg-[var(--surface-2)] px-3 py-3 text-sm text-[var(--text)] outline-none focus:border-[var(--focus)]"
                >
                  <option value="">Month</option>
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
                <input
                  value={day}
                  onChange={(e) => setDay(e.target.value.replace(/\D/g, "").slice(0, 2))}
                  placeholder="Day"
                  inputMode="numeric"
                  className="w-20 rounded-xl border border-[var(--line-strong)] bg-[var(--surface-2)] px-3 py-3 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--focus)]"
                />
                <input
                  value={year}
                  onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="Year"
                  inputMode="numeric"
                  className="w-24 rounded-xl border border-[var(--line-strong)] bg-[var(--surface-2)] px-3 py-3 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--focus)]"
                />
              </div>
            </Step>
          )}

          {step === 3 && (
            <Step title="What are you into?" hint="Pick whatever fits. Panda uses this to make examples that actually sound like you.">
              <div className="flex flex-wrap gap-2">
                {[...LIKE_SUGGESTIONS, ...likes.filter((l) => !LIKE_SUGGESTIONS.includes(l))].map((like) => {
                  const on = likes.includes(like);
                  return (
                    <button
                      key={like}
                      onClick={() => toggleLike(like)}
                      className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                        on
                          ? "border-transparent bg-[var(--accent)] text-[var(--accent-contrast)]"
                          : "border-[var(--line-strong)] text-[var(--text-dim)] hover:bg-[var(--surface-2)]"
                      }`}
                    >
                      {like}
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 flex gap-2">
                <input
                  value={customLike}
                  onChange={(e) => setCustomLike(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustomLike())}
                  placeholder="Add your own…"
                  className="flex-1 rounded-xl border border-[var(--line-strong)] bg-[var(--surface-2)] px-3 py-2.5 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--focus)]"
                />
                <button
                  onClick={addCustomLike}
                  className="rounded-xl border border-[var(--line-strong)] px-4 text-sm text-[var(--text-dim)] hover:bg-[var(--surface-2)]"
                >
                  Add
                </button>
              </div>

              <textarea
                value={aboutMe}
                onChange={(e) => setAboutMe(e.target.value)}
                rows={3}
                placeholder="Anything else Panda should always know about you? (optional)"
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
                Back
              </button>
            )}
            <button
              onClick={() => (step === 4 ? finish() : setStep((s) => (s + 1) as Step))}
              disabled={!canContinue}
              className="rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-[var(--accent-contrast)] disabled:opacity-30"
            >
              {step === 4 ? `Let's go${firstName ? `, ${firstName}` : ""}` : t("action.continue")}
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
