"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useProfileStore } from "@/store/useProfileStore";
import { LanguagePicker } from "./LanguagePicker";
import { Wordmark } from "@/components/Wordmark";
import { PandaSitting } from "@/components/Panda";
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, PlusIcon } from "@/components/icons";
import { detectLocale, findLocale, translate, type StringKey } from "@/lib/i18n";
import { birthdayProblem } from "./birthday";

// First-run setup. We ask for the few things that make everything after this
// feel personal: what to call them, what they're into, and when their birthday
// is (year optional). Every field can be skipped — and so can the whole thing.
//
// The same screen is "Redo setup" from Settings. It used to start empty and
// require a name, so redoing it meant retyping everything, and finishing wrote
// blanks over the likes and birthday the student had already given. It now
// starts from what is saved, says Cancel instead of Skip, and changes nothing
// until Finish.

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

const STEPS = 5;
type Step = 0 | 1 | 2 | 3 | 4;

export function Onboarding({ redo = false }: { redo?: boolean }) {
  const completeOnboarding = useProfileStore((s) => s.completeOnboarding);
  const closeSetup = useProfileStore((s) => s.closeSetup);
  const languages = useProfileStore((s) => s.languages);
  const setLanguages = useProfileStore((s) => s.setLanguages);
  const saved = useProfileStore((s) => s.profile);

  const [step, setStep] = useState<Step>(0);
  // Offered, never applied on its own: a school laptop set to English says
  // nothing about what the student actually reads.
  const [detected] = useState(() => detectLocale());
  const lang = languages.interface;
  const t = (key: StringKey, vars?: Record<string, string | number>) => translate(lang, key, vars);
  const months = monthNames(lang);
  const [name, setName] = useState(saved.name);
  const [nickname, setNickname] = useState(saved.nickname);
  const [month, setMonth] = useState<string>(saved.birthday.month ? String(saved.birthday.month) : "");
  const [day, setDay] = useState<string>(saved.birthday.day ? String(saved.birthday.day) : "");
  const [year, setYear] = useState<string>(saved.birthday.year ? String(saved.birthday.year) : "");
  const [likes, setLikes] = useState<string[]>(saved.likes);
  const [customLike, setCustomLike] = useState("");
  const [aboutMe, setAboutMe] = useState(saved.aboutMe);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // A new step starts at its top, and its heading is where a screen reader
  // picks up — otherwise Continue leaves focus on a button that no longer
  // means what it did.
  const firstRender = useRef(true);
  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: 0 });
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus({ preventScroll: true });
  }, [step]);

  // The page is its own dialog while it is up, so Escape means the same as
  // Cancel on a redo. A first run has nowhere to go back to.
  useEffect(() => {
    if (!redo) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) closeSetup();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [redo, closeSetup]);

  const firstName = (nickname.trim() || name.trim().split(/\s+/)[0] || "").trim();
  const problem = birthdayProblem(month, day, year);
  const [yearDone, setYearDone] = useState(false);
  // A year is only wrong once it has been finished: "20" on the way to "2011"
  // is not a mistake worth a red line. Continue still waits for a real one.
  const shown = problem === "year" && year.length < 4 && !yearDone ? null : problem;

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
    // A half-valid birthday keeps the parts that are fine rather than failing
    // the whole setup over one field.
    const ok = birthdayProblem(month, day, year) === null;
    completeOnboarding({
      name: name.trim(),
      nickname: nickname.trim(),
      birthday: {
        month: month ? Number(month) : null,
        day: day && ok ? Number(day) : null,
        year: year && ok ? Number(year) : null,
      },
      likes,
      aboutMe: aboutMe.trim(),
    });
  }

  const canContinue = step === 4 ? problem === null : true;
  const next = () => {
    if (!canContinue) return;
    if (step === STEPS - 1) finish();
    else setStep((s) => (s + 1) as Step);
  };

  const titleId = useId();
  const local = findLocale(lang);

  return (
    <div
      ref={scrollerRef}
      role={redo ? "dialog" : undefined}
      aria-modal={redo || undefined}
      aria-labelledby={titleId}
      dir={local?.rtl ? "rtl" : "ltr"}
      // Scrollable, top to bottom. It was a centred fixed box with no
      // overflow, so on a short phone (or with the keyboard up) Continue was
      // pushed off the screen with no way to reach it.
      className="fixed inset-0 z-50 overflow-y-auto bg-[var(--bg)]"
    >
      <div className="flex min-h-full">
        {/* The brand side, on a screen wide enough to have one. */}
        <aside className="brand-panel hidden w-[38%] max-w-xl shrink-0 flex-col justify-between border-e border-[var(--line)] p-10 lg:flex">
          <Wordmark size="lg" />
          <div>
            <PandaSitting className="h-[220px] w-[176px]" />
            <p className="mt-6 max-w-sm text-[26px] font-semibold leading-tight tracking-tight text-[var(--text)]">
              {t("onboarding.brandTitle")}
            </p>
            <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-[var(--text-dim)]">{t("onboarding.brandBody")}</p>
          </div>
          <p className="text-[13px] text-[var(--text-faint)]">{t("onboarding.privacyNote")}</p>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))] sm:px-8">
          <div className="flex items-center justify-between gap-3">
            <span className="lg:invisible">
              <Wordmark />
            </span>
            <button
              type="button"
              onClick={redo ? closeSetup : finish}
              className="btn btn-ghost btn-sm"
            >
              {redo ? t("action.cancel") : t("onboarding.skipAll")}
            </button>
          </div>

          <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center py-8">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex gap-1.5" aria-hidden="true">
                {Array.from({ length: STEPS }, (_, i) => (
                  <span key={i} className="step-dot" data-current={i === step || undefined} data-done={i < step || undefined} />
                ))}
              </div>
              <span className="text-[13px] text-[var(--text-faint)]">{t("onboarding.stepOf", { step: step + 1, total: STEPS })}</span>
            </div>

            <div key={step} className="animate-rise">
              {step === 0 && (
                <Step id={titleId} headingRef={headingRef} title={t("onboarding.languageTitle")} hint={t("onboarding.languageHint")}>
                  <LanguagePicker
                    selected={lang}
                    detected={detected}
                    onSelect={(code) => setLanguages({ interface: code })}
                  />
                </Step>
              )}

              {step === 1 && (
                <Step id={titleId} headingRef={headingRef} title={t("onboarding.nameTitle")} hint={t("onboarding.nameHint")}>
                  <TextField
                    value={name}
                    onChange={setName}
                    label={t("onboarding.nameTitle")}
                    placeholder={t("onboarding.namePlaceholder")}
                    autoComplete="given-name"
                    onEnter={next}
                  />
                </Step>
              )}

              {step === 2 && (
                <Step
                  id={titleId}
                  headingRef={headingRef}
                  title={
                    name.trim()
                      ? t("onboarding.nicknameTitle", { name: name.trim().split(/\s+/)[0] })
                      : t("onboarding.nicknameTitleNoName")
                  }
                  hint={t("onboarding.nicknameHint")}
                >
                  <TextField
                    value={nickname}
                    onChange={setNickname}
                    label={t("onboarding.nicknamePlaceholder")}
                    placeholder={t("onboarding.nicknamePlaceholder")}
                    autoComplete="nickname"
                    onEnter={next}
                  />
                </Step>
              )}

              {step === 3 && (
                <Step id={titleId} headingRef={headingRef} title={t("onboarding.likesTitle")} hint={t("onboarding.likesHint")}>
                  <div className="flex flex-wrap gap-2" role="group" aria-label={t("onboarding.likesTitle")}>
                    {[
                      ...LIKE_SUGGESTIONS,
                      ...likes
                        .filter((l) => !LIKE_SUGGESTIONS.some((s) => s.value === l))
                        .map((l) => ({ value: l, key: undefined })),
                    ].map(({ value, key }) => {
                      const on = likes.includes(value);
                      return (
                        <button key={value} type="button" onClick={() => toggleLike(value)} aria-pressed={on} className="interest-chip tap">
                          {on && <CheckIcon />}
                          {key ? t(key) : value}
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-4 flex gap-2">
                    <input
                      value={customLike}
                      onChange={(e) => setCustomLike(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustomLike())}
                      placeholder={t("onboarding.addYourOwn")}
                      aria-label={t("onboarding.addYourOwn")}
                      className="input"
                    />
                    <button type="button" onClick={addCustomLike} disabled={!customLike.trim()} className="btn btn-secondary shrink-0">
                      <PlusIcon />
                      {t("action.add")}
                    </button>
                  </div>

                  <label className="mt-5 block">
                    <span className="field-label">{t("onboarding.aboutMeLabel")}</span>
                    <textarea
                      value={aboutMe}
                      onChange={(e) => setAboutMe(e.target.value)}
                      rows={3}
                      placeholder={t("settings.aboutMePlaceholder")}
                      className="input mt-2 resize-none"
                    />
                  </label>
                </Step>
              )}

              {step === 4 && (
                <Step id={titleId} headingRef={headingRef} title={t("onboarding.birthdayTitle")} hint={t("onboarding.birthdayHint")}>
                  <div className="grid grid-cols-[1fr_5rem_6rem] gap-2">
                    <label className="min-w-0">
                      <span className="field-label mb-1.5 text-[13px]">{t("date.month")}</span>
                      <select value={month} onChange={(e) => setMonth(e.target.value)} className="input select">
                        <option value="">—</option>
                        {months.map((m, i) => (
                          <option key={m} value={i + 1}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span className="field-label mb-1.5 text-[13px]">{t("date.day")}</span>
                      <input
                        value={day}
                        onChange={(e) => setDay(e.target.value.replace(/\D/g, "").slice(0, 2))}
                        inputMode="numeric"
                        aria-invalid={shown === "day" || undefined}
                        aria-describedby={shown ? "birthday-problem" : undefined}
                        className="input"
                      />
                    </label>
                    <label>
                      <span className="field-label mb-1.5 text-[13px]">{t("date.year")}</span>
                      <input
                        value={year}
                        onChange={(e) => {
                          setYear(e.target.value.replace(/\D/g, "").slice(0, 4));
                          setYearDone(false);
                        }}
                        onBlur={() => setYearDone(true)}
                        inputMode="numeric"
                        placeholder={t("onboarding.optional")}
                        aria-invalid={shown === "year" || undefined}
                        aria-describedby={shown ? "birthday-problem" : undefined}
                        className="input"
                      />
                    </label>
                  </div>
                  {shown && (
                    <p id="birthday-problem" role="alert" className="mt-2 text-[13px] text-[var(--danger)]">
                      {t(shown === "day" ? "onboarding.badDay" : "onboarding.badYear")}
                    </p>
                  )}
                </Step>
              )}
            </div>

            <div className="mt-8 flex items-center justify-between gap-3">
              {step > 0 ? (
                <button type="button" onClick={() => setStep((s) => (s - 1) as Step)} className="btn btn-ghost">
                  <ArrowLeftIcon className="rtl:rotate-180" />
                  {t("action.back")}
                </button>
              ) : (
                <span />
              )}
              <button type="button" onClick={next} disabled={!canContinue} className="btn btn-primary btn-lg min-w-[8rem]">
                {step === STEPS - 1
                  ? firstName
                    ? t("onboarding.finish", { name: firstName })
                    : t("onboarding.finishNoName")
                  : t("action.continue")}
                {step < STEPS - 1 && <ArrowRightIcon className="rtl:rotate-180" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Step({
  id,
  headingRef,
  title,
  hint,
  children,
}: {
  id: string;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h1 ref={headingRef} id={id} tabIndex={-1} className="text-[26px] font-semibold leading-tight tracking-tight text-[var(--text)] outline-none sm:text-[28px]">
        {title}
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-[var(--text-dim)]">{hint}</p>
      <div className="mt-6">{children}</div>
    </div>
  );
}

function TextField({
  value,
  onChange,
  label,
  placeholder,
  autoComplete,
  onEnter,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder: string;
  autoComplete?: string;
  onEnter?: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  // Focused on arrival on a device with a keyboard. Not on a phone: there the
  // keyboard would cover the question the student is meant to be reading.
  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) ref.current?.focus({ preventScroll: true });
  }, []);
  return (
    <input
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.nativeEvent.isComposing) onEnter?.();
      }}
      aria-label={label}
      placeholder={placeholder}
      autoComplete={autoComplete}
      className="input h-12 text-base"
    />
  );
}
