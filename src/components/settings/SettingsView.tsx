"use client";

import { Suspense, useEffect, useId, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n, type StringKey } from "@/lib/i18n";
import { useProfileStore, type ThemeName } from "@/store/useProfileStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useTeacherStore } from "@/components/teacher/store";
import { AvatarPicker } from "./AvatarPicker";
import { AccountSection } from "./AccountSection";
import { TeacherCodeSection } from "./TeacherCodeSection";
import { DeactivateTeacherSection } from "./DeactivateTeacherSection";
import { LanguageSection } from "./LanguageSection";
import { LegalSection } from "./LegalSection";
import { useDialog } from "@/components/ui/Dialog";
import { PageHeader } from "@/components/ui/primitives";
import { birthdayProblem } from "@/components/onboarding/birthday";
import { Card, Field, Group, ToggleRow } from "./parts";
import {
  BrainIcon,
  CheckIcon,
  ChevronDownIcon,
  EyeIcon,
  GraduationCapIcon,
  LanguagesIcon,
  PaletteIcon,
  PlusIcon,
  RefreshIcon,
  SettingsIcon,
  ShieldIcon,
  TrashIcon,
  UserIcon,
  XIcon,
} from "@/components/icons";

// Settings.
//
// One rule runs through the whole screen: chrome is not content. Labels,
// headings, hints and section titles are furniture, so they get `cursor-default
// select-none` — a text caret over a heading makes it look like a field you can
// type in, which is exactly the confusion this screen had. Anything the student
// might actually want to take away — their name, their email, a memory they
// wrote — stays selectable, because "can't click on text" is only an improvement
// until it eats something you needed to copy.
//
// Each section has an address (`/settings?tab=memory`), so the sidebar, the
// command palette and a teacher's "go to Settings › Language" all land on the
// right one, and Back steps between them. It used to always open on Profile.

const SECTIONS = [
  { key: "profile", label: "settings.profile", icon: UserIcon },
  { key: "language", label: "settings.language", icon: LanguagesIcon },
  { key: "appearance", label: "settings.appearance", icon: PaletteIcon },
  { key: "memory", label: "settings.memory", icon: BrainIcon },
  // Last on purpose: nobody comes to Settings for the terms, but a parent or a
  // district reviewer needs to find them without being told where to look.
  { key: "legal", label: "settings.legal", icon: ShieldIcon },
] as const satisfies readonly { key: string; label: StringKey; icon: unknown }[];

type SectionKey = (typeof SECTIONS)[number]["key"];

function isSection(value: string | null): value is SectionKey {
  return SECTIONS.some((s) => s.key === value);
}

/** Month names in the student's own language, so the picker reads to them. */
function monthNames(locale: string): string[] {
  const format = new Intl.DateTimeFormat(locale, { month: "long" });
  return Array.from({ length: 12 }, (_, i) => format.format(new Date(Date.UTC(2000, i, 1))));
}

export function SettingsView() {
  // `useSearchParams` needs a Suspense boundary above it on a prerendered route.
  return (
    <Suspense fallback={null}>
      <SettingsScreen />
    </Suspense>
  );
}

function SettingsScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = params.get("tab");
  const section: SectionKey = isSection(tab) ? tab : "profile";
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const panelId = useId();

  function select(key: SectionKey, focus = false) {
    router.replace(key === "profile" ? pathname : `${pathname}?tab=${key}`, { scroll: false });
    if (focus) tabRefs.current[key]?.focus();
  }

  // Arrow keys move between sections, as they do in any tab list; Home and
  // End jump to the ends.
  function onTabKey(e: React.KeyboardEvent) {
    const i = SECTIONS.findIndex((s) => s.key === section);
    const go = (n: number) => {
      e.preventDefault();
      select(SECTIONS[(n + SECTIONS.length) % SECTIONS.length].key, true);
    };
    if (e.key === "ArrowDown" || e.key === "ArrowRight") go(i + 1);
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") go(i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(SECTIONS.length - 1);
  }

  // On a phone the tab row scrolls sideways; a link straight to Memory or
  // Legal would otherwise open with the selected tab out of sight.
  useEffect(() => {
    tabRefs.current[section]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [section]);

  const current = SECTIONS.find((s) => s.key === section)!;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 pb-16 pt-6 sm:px-6 md:pt-10">
        <PageHeader
          className="cursor-default select-none"
          icon={<SettingsIcon />}
          title={t("settings.title")}
          description={t("settings.subtitle")}
        />

        <div className="mt-6 md:mt-8 md:grid md:grid-cols-[12.5rem_minmax(0,1fr)] md:gap-10">
          {/* A column of sections on a desktop; a row of tabs that scrolls
              sideways on a phone, pinned under the header so it never
              scrolls away from the section it controls. */}
          <div className="sticky top-0 z-10 -mx-4 mb-6 border-b border-[var(--line)] bg-[var(--bg)] px-4 sm:-mx-6 sm:px-6 md:static md:mx-0 md:mb-0 md:border-0 md:bg-transparent md:px-0">
            <div
              role="tablist"
              aria-label={t("settings.title")}
              aria-orientation="vertical"
              onKeyDown={onTabKey}
              className="settings-tabs scroll-x flex gap-1 py-2 md:sticky md:top-0 md:flex-col md:py-0"
            >
              {SECTIONS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  ref={(el) => {
                    tabRefs.current[key] = el;
                  }}
                  type="button"
                  role="tab"
                  id={`${panelId}-${key}`}
                  aria-selected={section === key}
                  aria-controls={panelId}
                  tabIndex={section === key ? 0 : -1}
                  onClick={() => select(key)}
                  className="settings-tab tap shrink-0"
                >
                  <Icon />
                  {t(label)}
                </button>
              ))}
            </div>
          </div>

          <section
            id={panelId}
            role="tabpanel"
            aria-labelledby={`${panelId}-${section}`}
            className="min-w-0"
          >
            <h2 className="mb-5 hidden cursor-default select-none text-[19px] tracking-tight text-[var(--text)] md:block">
              {t(current.label)}
            </h2>
            <div key={section} className="animate-rise">
              {section === "profile" && <ProfileSection />}
              {section === "language" && <LanguageSection />}
              {section === "appearance" && <AppearanceSection />}
              {section === "memory" && <MemorySection />}
              {section === "legal" && <LegalSection />}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

/* ---------- Profile ---------- */

function ProfileSection() {
  const { t } = useI18n();
  const profile = useProfileStore((s) => s.profile);
  const updateProfile = useProfileStore((s) => s.updateProfile);
  const addLike = useProfileStore((s) => s.addLike);
  const removeLike = useProfileStore((s) => s.removeLike);
  const [newLike, setNewLike] = useState("");
  const ids = { name: useId(), nickname: useId(), like: useId(), about: useId() };

  function addTyped() {
    addLike(newLike);
    setNewLike("");
  }

  return (
    <div className="space-y-5">
      <AccountSection />
      <AvatarPicker />

      <Card title={t("settings.aboutYou")} description={t("settings.aboutYouHint")}>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id={ids.name} label={t("settings.name")} hint={t("settings.nameHint")}>
            <input
              id={ids.name}
              value={profile.name}
              onChange={(e) => updateProfile({ name: e.target.value })}
              placeholder={t("settings.namePlaceholder")}
              autoComplete="name"
              className="input"
            />
          </Field>

          <Field id={ids.nickname} label={t("settings.nickname")} hint={t("settings.nicknameHint")}>
            <input
              id={ids.nickname}
              value={profile.nickname}
              onChange={(e) => updateProfile({ nickname: e.target.value })}
              placeholder={t("settings.nickname")}
              autoComplete="nickname"
              className="input"
            />
          </Field>
        </div>

        <BirthdayField />

        <Group label={t("settings.likes")} hint={t("settings.likesHint")}>
          <div className="flex flex-wrap gap-2">
            {profile.likes.map((like) => (
              <span key={like} className="badge badge-accent h-8 gap-1 pe-1 ps-3 text-[13px]">
                {like}
                <button
                  type="button"
                  onClick={() => removeLike(like)}
                  aria-label={t("settings.removeLike", { like })}
                  title={t("settings.removeLike", { like })}
                  className="tap-pad inline-flex h-6 w-6 items-center justify-center rounded-full hover:bg-[var(--surface-2)]"
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
            {profile.likes.length === 0 && (
              <p className="cursor-default select-none text-sm text-[var(--text-faint)]">{t("settings.likesNone")}</p>
            )}
          </div>
          <div className="mt-3 flex gap-2">
            <input
              id={ids.like}
              value={newLike}
              onChange={(e) => setNewLike(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTyped();
                }
              }}
              aria-label={t("settings.likesPlaceholder")}
              placeholder={t("settings.likesPlaceholder")}
              className="input"
            />
            <button type="button" onClick={addTyped} disabled={!newLike.trim()} className="btn btn-secondary shrink-0">
              <PlusIcon />
              {t("action.add")}
            </button>
          </div>
        </Group>

        <Field id={ids.about} label={t("settings.aboutMe")} hint={t("settings.aboutMeHint")}>
          <textarea
            id={ids.about}
            value={profile.aboutMe}
            onChange={(e) => updateProfile({ aboutMe: e.target.value })}
            rows={4}
            placeholder={t("settings.aboutMePlaceholder")}
            className="input resize-y"
          />
        </Field>
      </Card>

      <TeacherArea />
    </div>
  );
}

/**
 * Teacher tools, kept out of a student's way.
 *
 * The teacher-code box was the second card on every signed-in student's
 * profile — a wall of text about rosters between their account and their
 * name. It is a single line now that opens the box, and only an account that
 * already is a teacher sees the full cards.
 */
function TeacherArea() {
  const { t } = useI18n();
  const account = useAuthStore((s) => s.account);
  const role = useTeacherStore((s) => s.role);
  const [open, setOpen] = useState(false);

  if (!account) return null;
  if (role === "teacher") {
    return (
      <>
        <TeacherCodeSection />
        <DeactivateTeacherSection />
      </>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="btn btn-ghost btn-sm -ms-2 text-[var(--text-dim)]"
      >
        <GraduationCapIcon />
        {t("settings.teacherPrompt")}
        <ChevronDownIcon className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-3 animate-rise">
          <TeacherCodeSection />
        </div>
      )}
    </div>
  );
}

/**
 * Month, day and year — each optional, each checked.
 *
 * Typed into local state and saved only when what is there is a real date, so
 * a half-typed "3" on the way to "31" is never stored, and the 31st of
 * February never is either.
 */
function BirthdayField() {
  const { t, locale } = useI18n();
  const birthday = useProfileStore((s) => s.profile.birthday);
  const updateProfile = useProfileStore((s) => s.updateProfile);
  const age = useProfileStore((s) => s.age)();
  const months = monthNames(locale);
  const [day, setDay] = useState(birthday.day ? String(birthday.day) : "");
  const [year, setYear] = useState(birthday.year ? String(birthday.year) : "");
  const [yearDone, setYearDone] = useState(false);
  const month = birthday.month ? String(birthday.month) : "";
  const problem = birthdayProblem(month, day, year);
  // A year is only wrong once it has been finished: "20" on the way to "2011"
  // is not a mistake worth a red line.
  const shown = problem === "year" && year.length < 4 && !yearDone ? null : problem;
  const ids = { month: useId(), day: useId(), year: useId(), error: useId(), label: useId() };

  // Only a complete, valid set of parts is written.
  useEffect(() => {
    if (problem) return;
    const nextDay = day ? Number(day) : null;
    const nextYear = year ? Number(year) : null;
    if (nextDay !== birthday.day || nextYear !== birthday.year) {
      updateProfile({ birthday: { ...birthday, day: nextDay, year: nextYear } });
    }
  }, [day, year, problem, birthday, updateProfile]);

  return (
    <div role="group" aria-labelledby={ids.label}>
      <p id={ids.label} className="field-label cursor-default select-none">
        {t("settings.birthday")}
      </p>
      <p className="field-hint cursor-default select-none">
        {age !== null ? t("settings.birthdayHintAge", { age }) : t("settings.birthdayHint")}
      </p>
      <div className="mt-2.5 grid max-w-md grid-cols-[minmax(0,1fr)_5rem_6rem] gap-2">
        <div>
          <label htmlFor={ids.month} className="mb-1 block text-[12.5px] text-[var(--text-faint)]">
            {t("date.month")}
          </label>
          <select
            id={ids.month}
            value={month}
            onChange={(e) =>
              updateProfile({ birthday: { ...birthday, month: e.target.value ? Number(e.target.value) : null } })
            }
            className="input select"
          >
            <option value="">—</option>
            {months.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={ids.day} className="mb-1 block text-[12.5px] text-[var(--text-faint)]">
            {t("date.day")}
          </label>
          <input
            id={ids.day}
            value={day}
            inputMode="numeric"
            onChange={(e) => setDay(e.target.value.replace(/\D/g, "").slice(0, 2))}
            aria-invalid={shown === "day" || undefined}
            aria-describedby={shown ? ids.error : undefined}
            className="input"
          />
        </div>
        <div>
          <label htmlFor={ids.year} className="mb-1 block text-[12.5px] text-[var(--text-faint)]">
            {t("date.year")}
          </label>
          <input
            id={ids.year}
            value={year}
            inputMode="numeric"
            onChange={(e) => {
              setYear(e.target.value.replace(/\D/g, "").slice(0, 4));
              setYearDone(false);
            }}
            onBlur={() => setYearDone(true)}
            aria-invalid={shown === "year" || undefined}
            aria-describedby={shown ? ids.error : undefined}
            className="input"
          />
        </div>
      </div>
      {shown && (
        <p id={ids.error} role="alert" className="mt-2 text-[13px] text-[var(--danger)]">
          {t(shown === "day" ? "onboarding.badDay" : "onboarding.badYear")}
        </p>
      )}
    </div>
  );
}

/* ---------- Appearance ---------- */

function AppearanceSection() {
  const { t } = useI18n();
  const theme = useProfileStore((s) => s.theme);
  const setTheme = useProfileStore((s) => s.setTheme);
  const appearance = useProfileStore((s) => s.appearance);
  const setAppearance = useProfileStore((s) => s.setAppearance);

  // Names, not translated strings: Ocean, Forest and Sepia are proper nouns for
  // the palettes, and the swatch does the explaining anyway.
  const themes: { key: ThemeName; label: string; swatch: ThemeName }[] = [
    { key: "system", label: t("settings.themeSystem"), swatch: "system" },
    { key: "dark", label: t("settings.themeDark"), swatch: "dark" },
    { key: "light", label: t("settings.themeLight"), swatch: "light" },
    { key: "ocean", label: "Ocean", swatch: "ocean" },
    { key: "forest", label: "Forest", swatch: "forest" },
    { key: "sepia", label: "Sepia", swatch: "sepia" },
  ];

  const sizes = [
    { key: "small" as const, label: t("settings.textSmall") },
    { key: "normal" as const, label: t("settings.textNormal") },
    { key: "large" as const, label: t("settings.textLarge") },
  ];

  return (
    <div className="space-y-5">
      <Card title={t("settings.theme")} description={t("settings.themeHint")}>
        {/* Two columns on a phone, three when there is room — a swatch has to
            stay big enough to actually read as a palette. */}
        <div role="radiogroup" aria-label={t("settings.theme")} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {themes.map(({ key, label, swatch }) => {
            const active = theme === key;
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setTheme(key)}
                className={`overflow-hidden rounded-[var(--radius)] border text-start transition-[border-color,box-shadow] ${
                  active
                    ? "border-[var(--accent)] shadow-[0_0_0_1px_var(--accent)]"
                    : "border-[var(--line)] hover:border-[var(--line-strong)]"
                }`}
              >
                <ThemeSwatch theme={swatch} />
                <span className="flex items-center justify-between gap-2 bg-[var(--surface-1)] px-3 py-2.5">
                  <span className="cursor-default select-none text-sm font-medium text-[var(--text)]">{label}</span>
                  {active && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-contrast)]">
                      <CheckIcon className="h-3 w-3" strokeWidth={3} />
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      <Card title={t("settings.textSize")} description={t("settings.textSizeHint")}>
        <div role="radiogroup" aria-label={t("settings.textSize")} className="flex flex-wrap gap-2">
          {sizes.map(({ key, label }, i) => {
            const active = appearance.textSize === key;
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setAppearance({ textSize: key })}
                className="option-card tap"
              >
                <span aria-hidden="true" className="font-semibold" style={{ fontSize: 13 + i * 2.5 }}>
                  Aa
                </span>
                {label}
              </button>
            );
          })}
        </div>
      </Card>

      <Card title={t("settings.motion")}>
        <div className="divide-y divide-[var(--line)]">
          <ToggleRow
            label={t("settings.reduceMotion")}
            hint={t("settings.reduceMotionHint")}
            on={appearance.reduceMotion}
            onChange={(on) => setAppearance({ reduceMotion: on })}
          />
          <ToggleRow
            label={t("settings.pandaMotion")}
            hint={t("settings.pandaMotionHint")}
            on={appearance.pandaMotion}
            onChange={(on) => setAppearance({ pandaMotion: on })}
          />
        </div>
      </Card>
    </div>
  );
}

/* ---------- Memory ---------- */

function MemorySection() {
  const { t } = useI18n();
  const memory = useProfileStore((s) => s.memory);
  const addMemory = useProfileStore((s) => s.addMemory);
  const removeMemory = useProfileStore((s) => s.removeMemory);
  const clearMemory = useProfileStore((s) => s.clearMemory);
  const resetOnboarding = useProfileStore((s) => s.resetOnboarding);
  const memoryBlock = useProfileStore((s) => s.memoryBlock);
  const dialog = useDialog();
  const [draft, setDraft] = useState("");
  const [preview, setPreview] = useState(false);
  const inputId = useId();

  async function handleClear() {
    const ok = await dialog.confirm({
      title: t("settings.forgetAllTitle"),
      description: t("settings.forgetAllBody"),
      confirmLabel: t("settings.forgetAllConfirm"),
      danger: true,
    });
    if (ok) clearMemory();
  }

  async function handleRedo() {
    const ok = await dialog.confirm({
      title: t("settings.redoTitle"),
      description: t("settings.redoBody"),
      confirmLabel: t("settings.redoConfirm"),
    });
    if (ok) resetOnboarding();
  }

  function add() {
    addMemory(draft);
    setDraft("");
  }

  return (
    <div className="space-y-5">
      <Card title={t("settings.memoryTitle")} description={t("settings.memoryIntro")}>
        <label htmlFor={inputId} className="sr-only">
          {t("settings.memoryPlaceholder")}
        </label>
        <div className="flex gap-2">
          <input
            id={inputId}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder={t("settings.memoryPlaceholder")}
            className="input"
          />
          <button type="button" onClick={add} disabled={!draft.trim()} className="btn btn-primary shrink-0">
            <PlusIcon />
            {t("settings.remember")}
          </button>
        </div>

        {memory.length === 0 ? (
          <div className="rounded-[var(--radius)] border border-dashed border-[var(--line-strong)] px-4 py-8 text-center">
            <BrainIcon className="mx-auto h-6 w-6 text-[var(--text-faint)]" />
            <p className="mt-2 cursor-default select-none text-sm text-[var(--text-faint)]">{t("settings.memoryNone")}</p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--line)] overflow-hidden rounded-[var(--radius)] border border-[var(--line)]">
            {memory.map((fact) => (
              <li key={fact.id} className="flex items-center gap-3 bg-[var(--surface-1)] py-2 pe-2 ps-4">
                <p className="min-w-0 flex-1 text-sm text-[var(--text)]">{fact.text}</p>
                <span className={`badge shrink-0 ${fact.source === "chat" ? "badge-accent" : ""}`}>
                  {t(fact.source === "chat" ? "settings.fromChat" : "settings.fromYou")}
                </span>
                <button
                  type="button"
                  onClick={() => removeMemory(fact.id)}
                  aria-label={`${t("settings.forgetThis")}: ${fact.text}`}
                  title={t("settings.forgetThis")}
                  className="icon-btn icon-btn-sm tap-pad hover:!text-[var(--danger)]"
                >
                  <XIcon />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* What actually goes out with every message. Memory is only
          trustworthy if the student can see all of it — the profile lines as
          well as the facts — in the exact words Panda is given. */}
      <Card title={t("settings.memoryPreviewTitle")} description={t("settings.memoryPreviewHint")}>
        <button type="button" onClick={() => setPreview((v) => !v)} aria-expanded={preview} className="btn btn-outline btn-sm self-start">
          <EyeIcon />
          {preview ? t("settings.memoryPreviewHide") : t("settings.memoryPreviewShow")}
        </button>
        {preview && (
          <pre className="scroll-x max-h-72 overflow-y-auto whitespace-pre-wrap rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-0)] p-3.5 font-mono text-[12.5px] leading-relaxed text-[var(--text-dim)]">
            {memoryBlock() || t("settings.memoryPreviewEmpty")}
          </pre>
        )}
      </Card>

      <Card title={t("settings.startOver")}>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={handleRedo} className="btn btn-outline">
            <RefreshIcon />
            {t("settings.redoSetup")}
          </button>
          <button type="button" onClick={handleClear} disabled={memory.length === 0} className="btn btn-danger">
            <TrashIcon />
            {t("settings.clearMemories")}
          </button>
        </div>
      </Card>
    </div>
  );
}

/* ---------- small shared bits ---------- */

/** A real miniature of the palette — paper, a raised surface, ink and the
 *  accent — because a theme called "Ocean" tells a twelve-year-old nothing.
 *  "system" shows both halves it can turn into. */
function ThemeSwatch({ theme }: { theme: ThemeName }) {
  if (theme === "system") {
    return (
      <span className="flex h-16 w-full" aria-hidden="true">
        <Swatch theme="dark" className="w-1/2" />
        <Swatch theme="light" className="w-1/2" />
      </span>
    );
  }
  return <Swatch theme={theme} className="w-full" />;
}

function Swatch({ theme, className = "" }: { theme: ThemeName; className?: string }) {
  return (
    <span className={`theme-swatch flex h-16 items-end gap-1 bg-[var(--sw-bg)] p-2 ${className}`} data-swatch={theme} aria-hidden="true">
      <span className="h-6 flex-1 rounded bg-[var(--sw-surface)]" />
      <span className="h-3 w-3 rounded-full bg-[var(--sw-text)]" />
      <span className="h-3 w-3 rounded-full bg-[var(--sw-accent)]" />
    </span>
  );
}
