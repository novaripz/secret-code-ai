"use client";

import { useState } from "react";
import { useI18n, type StringKey } from "@/lib/i18n";
import { useProfileStore } from "@/store/useProfileStore";
import { AvatarPicker } from "./AvatarPicker";
import { AccountSection } from "./AccountSection";
import { LanguageSection } from "./LanguageSection";
import { CanvasSection } from "./CanvasSection";
import { useDialog } from "@/components/ui/Dialog";
import { BrainIcon, MoonIcon, SparkleIcon, SunIcon, UserIcon, XIcon } from "@/components/icons";

const SECTIONS = [
  { key: "profile", label: "settings.profile", icon: UserIcon },
  { key: "language", label: "settings.language", icon: SparkleIcon },
  { key: "appearance", label: "settings.appearance", icon: MoonIcon },
  { key: "memory", label: "settings.memory", icon: BrainIcon },
] as const satisfies readonly { key: string; label: StringKey; icon: unknown }[];

type SectionKey = (typeof SECTIONS)[number]["key"];

/** Month names in the student's own language, so the picker reads to them. */
function monthNames(locale: string): string[] {
  const format = new Intl.DateTimeFormat(locale, { month: "long" });
  return Array.from({ length: 12 }, (_, i) => format.format(new Date(Date.UTC(2000, i, 1))));
}

export function SettingsView() {
  const { t } = useI18n();
  const [section, setSection] = useState<SectionKey>("profile");

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">{t("settings.title")}</h1>
        <p className="mt-1 text-sm text-[var(--text-faint)]">{t("settings.subtitle")}</p>

        <div className="mt-6 flex flex-wrap gap-1.5 border-b border-[var(--line)] pb-3">
          {SECTIONS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setSection(key)}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                section === key
                  ? "bg-[var(--surface-2)] text-[var(--text)]"
                  : "text-[var(--text-faint)] hover:bg-[var(--surface-2)] hover:text-[var(--text-dim)]"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t(label)}
            </button>
          ))}
        </div>

        <div key={section} className="animate-rise py-6">
          {section === "profile" && <ProfileSection />}
          {section === "language" && <LanguageSection />}
          {section === "appearance" && <AppearanceSection />}
          {section === "memory" && <MemorySection />}
        </div>
      </div>
    </div>
  );
}

function ProfileSection() {
  const { t, locale } = useI18n();
  const profile = useProfileStore((s) => s.profile);
  const updateProfile = useProfileStore((s) => s.updateProfile);
  const addLike = useProfileStore((s) => s.addLike);
  const removeLike = useProfileStore((s) => s.removeLike);
  const age = useProfileStore((s) => s.age)();
  const [newLike, setNewLike] = useState("");
  const months = monthNames(locale);

  function setBirthday(patch: Partial<typeof profile.birthday>) {
    updateProfile({ birthday: { ...profile.birthday, ...patch } });
  }

  return (
    <div className="space-y-6">
      <AccountSection />
      <CanvasSection />
      <AvatarPicker />

      <Field label={t("settings.name")} hint={t("settings.nameHint")}>
        <Input
          value={profile.name}
          onChange={(v) => updateProfile({ name: v })}
          placeholder={t("settings.namePlaceholder")}
        />
      </Field>

      <Field label={t("settings.nickname")} hint={t("settings.nicknameHint")}>
        <Input
          value={profile.nickname}
          onChange={(v) => updateProfile({ nickname: v })}
          placeholder={t("settings.nickname")}
        />
      </Field>

      <Field
        label={t("settings.birthday")}
        hint={age !== null ? t("settings.birthdayHintAge", { age }) : t("settings.birthdayHint")}
      >
        <div className="flex gap-2">
          <select
            value={profile.birthday.month ?? ""}
            onChange={(e) => setBirthday({ month: e.target.value ? Number(e.target.value) : null })}
            className="flex-1 rounded-xl border border-[var(--line-strong)] bg-[var(--surface-2)] px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[var(--focus)]"
          >
            <option value="">{t("date.month")}</option>
            {months.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
          <NumberInput
            value={profile.birthday.day}
            onChange={(v) => setBirthday({ day: v })}
            placeholder={t("date.day")}
            maxLength={2}
            className="w-20"
          />
          <NumberInput
            value={profile.birthday.year}
            onChange={(v) => setBirthday({ year: v })}
            placeholder={t("date.year")}
            maxLength={4}
            className="w-24"
          />
        </div>
      </Field>

      <Field label={t("settings.likes")} hint={t("settings.likesHint")}>
        <div className="flex flex-wrap gap-2">
          {profile.likes.map((like) => (
            <span
              key={like}
              className="flex items-center gap-1.5 rounded-full bg-[var(--surface-2)] py-1.5 pl-3.5 pr-2 text-sm text-[var(--text)]"
            >
              {like}
              <button
                onClick={() => removeLike(like)}
                aria-label={t("settings.removeLike", { like })}
                className="rounded-full p-0.5 text-[var(--text-faint)] hover:text-[var(--text)]"
              >
                <XIcon className="h-3 w-3" />
              </button>
            </span>
          ))}
          {profile.likes.length === 0 && (
            <p className="text-sm text-[var(--text-faint)]">{t("settings.likesNone")}</p>
          )}
        </div>
        <div className="mt-3 flex gap-2">
          <Input
            value={newLike}
            onChange={setNewLike}
            placeholder={t("settings.likesPlaceholder")}
            onEnter={() => {
              addLike(newLike);
              setNewLike("");
            }}
          />
          <button
            onClick={() => {
              addLike(newLike);
              setNewLike("");
            }}
            className="shrink-0 rounded-xl border border-[var(--line-strong)] px-4 text-sm text-[var(--text-dim)] hover:bg-[var(--surface-2)]"
          >
            {t("action.add")}
          </button>
        </div>
      </Field>

      <Field label={t("settings.aboutMe")} hint={t("settings.aboutMeHint")}>
        <textarea
          value={profile.aboutMe}
          onChange={(e) => updateProfile({ aboutMe: e.target.value })}
          rows={4}
          placeholder={t("settings.aboutMePlaceholder")}
          className="w-full resize-none rounded-xl border border-[var(--line-strong)] bg-[var(--surface-2)] px-3.5 py-2.5 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--focus)]"
        />
      </Field>
    </div>
  );
}

function AppearanceSection() {
  const { t } = useI18n();
  const theme = useProfileStore((s) => s.theme);
  const setTheme = useProfileStore((s) => s.setTheme);
  const appearance = useProfileStore((s) => s.appearance);
  const setAppearance = useProfileStore((s) => s.setAppearance);

  const themes = [
    { key: "dark" as const, label: t("settings.themeDark"), hint: t("settings.themeDarkHint"), icon: MoonIcon },
    { key: "light" as const, label: t("settings.themeLight"), hint: t("settings.themeLightHint"), icon: SunIcon },
    { key: "system" as const, label: t("settings.themeSystem"), hint: t("settings.themeSystemHint"), icon: SparkleIcon },
  ];

  const sizes = [
    { key: "small" as const, label: t("settings.textSmall") },
    { key: "normal" as const, label: t("settings.textNormal") },
    { key: "large" as const, label: t("settings.textLarge") },
  ];

  return (
    <div className="space-y-8">
      <div>
        <p className="mb-3 text-sm font-medium text-[var(--text)]">{t("settings.theme")}</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {themes.map(({ key, label, hint, icon: Icon }) => {
            const active = theme === key;
            return (
              <button
                key={key}
                onClick={() => setTheme(key)}
                className={`rounded-2xl border p-4 text-left transition-colors ${
                  active
                    ? "border-[var(--text)] bg-[var(--surface-2)]"
                    : "border-[var(--line)] hover:bg-[var(--surface-2)]"
                }`}
              >
                <span className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-[var(--text)]" />
                  <span className="font-medium text-[var(--text)]">{label}</span>
                </span>
                <span className="mt-1.5 block text-sm text-[var(--text-faint)]">{hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-1 text-sm font-medium text-[var(--text)]">{t("settings.textSize")}</p>
        <p className="mb-3 text-sm text-[var(--text-faint)]">{t("settings.textSizeHint")}</p>
        <div className="flex gap-2">
          {sizes.map(({ key, label }) => {
            const active = appearance.textSize === key;
            return (
              <button
                key={key}
                onClick={() => setAppearance({ textSize: key })}
                className={`rounded-xl border px-4 py-2.5 text-sm transition-colors ${
                  active
                    ? "border-[var(--text)] bg-[var(--surface-2)] font-medium text-[var(--text)]"
                    : "border-[var(--line)] text-[var(--text-dim)] hover:bg-[var(--surface-2)]"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-[var(--line)] p-4">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-[var(--text)]">{t("settings.reduceMotion")}</p>
          <p className="mt-1 text-sm leading-relaxed text-[var(--text-faint)]">{t("settings.reduceMotionHint")}</p>
        </div>
        <Toggle
          on={appearance.reduceMotion}
          onChange={(on) => setAppearance({ reduceMotion: on })}
          label={t("settings.reduceMotion")}
        />
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-[var(--line)] p-4">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-[var(--text)]">{t("settings.pandaMotion")}</p>
          <p className="mt-1 text-sm leading-relaxed text-[var(--text-faint)]">{t("settings.pandaMotionHint")}</p>
        </div>
        <Toggle
          on={appearance.pandaMotion}
          onChange={(on) => setAppearance({ pandaMotion: on })}
          label={t("settings.pandaMotion")}
        />
      </div>
    </div>
  );
}

function MemorySection() {
  const { t } = useI18n();
  const memory = useProfileStore((s) => s.memory);
  const addMemory = useProfileStore((s) => s.addMemory);
  const removeMemory = useProfileStore((s) => s.removeMemory);
  const clearMemory = useProfileStore((s) => s.clearMemory);
  const resetOnboarding = useProfileStore((s) => s.resetOnboarding);
  const dialog = useDialog();
  const [draft, setDraft] = useState("");

  async function handleClear() {
    const ok = await dialog.confirm({
      title: t("settings.forgetAllTitle"),
      description: t("settings.forgetAllBody"),
      confirmLabel: t("settings.forgetAllConfirm"),
      danger: true,
    });
    if (ok) clearMemory();
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm leading-relaxed text-[var(--text-dim)]">{t("settings.memoryIntro")}</p>
        <div className="mt-3 flex gap-2">
          <Input
            value={draft}
            onChange={setDraft}
            placeholder={t("settings.memoryPlaceholder")}
            onEnter={() => {
              addMemory(draft);
              setDraft("");
            }}
          />
          <button
            onClick={() => {
              addMemory(draft);
              setDraft("");
            }}
            className="shrink-0 rounded-xl border border-[var(--line-strong)] px-4 text-sm text-[var(--text-dim)] hover:bg-[var(--surface-2)]"
          >
            {t("settings.remember")}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {memory.length === 0 ? (
          <p className="text-sm text-[var(--text-faint)]">{t("settings.memoryNone")}</p>
        ) : (
          memory.map((fact) => (
            <div
              key={fact.id}
              className="flex items-start gap-3 rounded-xl border border-[var(--line)] px-3.5 py-3"
            >
              <p className="min-w-0 flex-1 text-sm text-[var(--text)]">{fact.text}</p>
              <button
                onClick={() => removeMemory(fact.id)}
                aria-label={t("settings.forgetThis")}
                className="rounded p-1 text-[var(--text-faint)] hover:text-[var(--danger)]"
              >
                <XIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-t border-[var(--line)] pt-5">
        <button
          onClick={handleClear}
          disabled={memory.length === 0}
          className="rounded-full border border-[var(--line-strong)] px-4 py-2 text-sm text-[var(--danger)] hover:bg-[var(--surface-2)] disabled:opacity-30"
        >
          {t("settings.clearMemories")}
        </button>
        <button
          onClick={resetOnboarding}
          className="rounded-full border border-[var(--line-strong)] px-4 py-2 text-sm text-[var(--text-dim)] hover:bg-[var(--surface-2)]"
        >
          {t("settings.redoSetup")}
        </button>
      </div>
    </div>
  );
}

/* ---------- small shared bits ---------- */

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-[var(--text)]">{label}</label>
      {hint && <p className="mt-1 text-xs leading-relaxed text-[var(--text-faint)]">{hint}</p>}
      <div className="mt-2.5">{children}</div>
    </div>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  onEnter,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  onEnter?: () => void;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
      placeholder={placeholder}
      className="w-full rounded-xl border border-[var(--line-strong)] bg-[var(--surface-2)] px-3.5 py-2.5 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--focus)]"
    />
  );
}

function NumberInput({
  value,
  onChange,
  placeholder,
  maxLength,
  className = "",
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder: string;
  maxLength: number;
  className?: string;
}) {
  return (
    <input
      value={value ?? ""}
      inputMode="numeric"
      placeholder={placeholder}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, "").slice(0, maxLength);
        onChange(digits ? Number(digits) : null);
      }}
      className={`rounded-xl border border-[var(--line-strong)] bg-[var(--surface-2)] px-3 py-2.5 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--focus)] ${className}`}
    />
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
        on ? "bg-[var(--accent)]" : "bg-[var(--surface-3)]"
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full transition-transform ${
          on ? "translate-x-[1.375rem] bg-[var(--accent-contrast)]" : "translate-x-0.5 bg-[var(--text-faint)]"
        }`}
      />
    </button>
  );
}
