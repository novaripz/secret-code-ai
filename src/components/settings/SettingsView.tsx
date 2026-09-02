"use client";

import { useState } from "react";
import { useProfileStore } from "@/store/useProfileStore";
import { AvatarPicker } from "./AvatarPicker";
import { AccountSection } from "./AccountSection";
import { LanguageSection } from "./LanguageSection";
import { CanvasSection } from "./CanvasSection";
import { useDialog } from "@/components/ui/Dialog";
import { BrainIcon, MoonIcon, SparkleIcon, SunIcon, UserIcon, XIcon } from "@/components/icons";

const SECTIONS = [
  { key: "profile", label: "Profile", icon: UserIcon },
  { key: "language", label: "Language", icon: SparkleIcon },
  { key: "appearance", label: "Appearance", icon: MoonIcon },
  { key: "memory", label: "Memory", icon: BrainIcon },
] as const;

type SectionKey = (typeof SECTIONS)[number]["key"];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function SettingsView() {
  const [section, setSection] = useState<SectionKey>("profile");

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-[var(--text-faint)]">
          Everything here follows you across every chat and project.
        </p>

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
              {label}
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
  const profile = useProfileStore((s) => s.profile);
  const updateProfile = useProfileStore((s) => s.updateProfile);
  const addLike = useProfileStore((s) => s.addLike);
  const removeLike = useProfileStore((s) => s.removeLike);
  const age = useProfileStore((s) => s.age)();
  const [newLike, setNewLike] = useState("");

  function setBirthday(patch: Partial<typeof profile.birthday>) {
    updateProfile({ birthday: { ...profile.birthday, ...patch } });
  }

  return (
    <div className="space-y-6">
      <AccountSection />
      <CanvasSection />
      <AvatarPicker />

      <Field label="Name" hint="What Panda calls you when it's being formal.">
        <Input value={profile.name} onChange={(v) => updateProfile({ name: v })} placeholder="Your name" />
      </Field>

      <Field label="Nickname" hint="What it calls you the rest of the time.">
        <Input value={profile.nickname} onChange={(v) => updateProfile({ nickname: v })} placeholder="Nickname" />
      </Field>

      <Field
        label="Birthday"
        hint={
          age !== null
            ? `We work out your age from this — you're ${age}. Clear the year to keep it private.`
            : "The year is optional. Add it and Panda knows your age; leave it blank and it won't."
        }
      >
        <div className="flex gap-2">
          <select
            value={profile.birthday.month ?? ""}
            onChange={(e) => setBirthday({ month: e.target.value ? Number(e.target.value) : null })}
            className="flex-1 rounded-xl border border-[var(--line-strong)] bg-[var(--surface-2)] px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[var(--focus)]"
          >
            <option value="">Month</option>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
          <NumberInput
            value={profile.birthday.day}
            onChange={(v) => setBirthday({ day: v })}
            placeholder="Day"
            maxLength={2}
            className="w-20"
          />
          <NumberInput
            value={profile.birthday.year}
            onChange={(v) => setBirthday({ year: v })}
            placeholder="Year"
            maxLength={4}
            className="w-24"
          />
        </div>
      </Field>

      <Field label="Stuff you're into" hint="Panda uses these to make examples sound like you.">
        <div className="flex flex-wrap gap-2">
          {profile.likes.map((like) => (
            <span
              key={like}
              className="flex items-center gap-1.5 rounded-full bg-[var(--surface-2)] py-1.5 pl-3.5 pr-2 text-sm text-[var(--text)]"
            >
              {like}
              <button
                onClick={() => removeLike(like)}
                aria-label={`Remove ${like}`}
                className="rounded-full p-0.5 text-[var(--text-faint)] hover:text-[var(--text)]"
              >
                <XIcon className="h-3 w-3" />
              </button>
            </span>
          ))}
          {profile.likes.length === 0 && (
            <p className="text-sm text-[var(--text-faint)]">Nothing added yet.</p>
          )}
        </div>
        <div className="mt-3 flex gap-2">
          <Input
            value={newLike}
            onChange={setNewLike}
            placeholder="Add something you like…"
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
            Add
          </button>
        </div>
      </Field>

      <Field label="Anything else" hint="Free-form. Whatever you want Panda to always keep in mind.">
        <textarea
          value={profile.aboutMe}
          onChange={(e) => updateProfile({ aboutMe: e.target.value })}
          rows={4}
          placeholder="e.g. I'm in 8th grade, I learn best with examples, I get bored by long explanations…"
          className="w-full resize-none rounded-xl border border-[var(--line-strong)] bg-[var(--surface-2)] px-3.5 py-2.5 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--focus)]"
        />
      </Field>
    </div>
  );
}

function AppearanceSection() {
  const theme = useProfileStore((s) => s.theme);
  const setTheme = useProfileStore((s) => s.setTheme);
  const appearance = useProfileStore((s) => s.appearance);
  const setAppearance = useProfileStore((s) => s.setAppearance);

  const themes = [
    { key: "dark" as const, label: "Dark", hint: "The default. Easier on your eyes at night.", icon: MoonIcon },
    { key: "light" as const, label: "Light", hint: "Bright and high contrast.", icon: SunIcon },
    { key: "system" as const, label: "System", hint: "Follows whatever your device is set to.", icon: SparkleIcon },
  ];

  const sizes = [
    { key: "small" as const, label: "Small" },
    { key: "normal" as const, label: "Normal" },
    { key: "large" as const, label: "Large" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <p className="mb-3 text-sm font-medium text-[var(--text)]">Theme</p>
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
        <p className="mb-1 text-sm font-medium text-[var(--text)]">Text size</p>
        <p className="mb-3 text-sm text-[var(--text-faint)]">How big replies are in the chat.</p>
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
          <p className="font-medium text-[var(--text)]">Reduce motion</p>
          <p className="mt-1 text-sm leading-relaxed text-[var(--text-faint)]">
            Turns off animations across the app. Your device setting is already respected; this
            turns them off even when it isn&apos;t set.
          </p>
        </div>
        <Toggle
          on={appearance.reduceMotion}
          onChange={(on) => setAppearance({ reduceMotion: on })}
          label="Reduce motion"
        />
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-[var(--line)] p-4">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-[var(--text)]">Panda movement</p>
          <p className="mt-1 text-sm leading-relaxed text-[var(--text-faint)]">
            The mascot bobs, blinks and twitches its ears. Turn it off to keep it still.
          </p>
        </div>
        <Toggle
          on={appearance.pandaMotion}
          onChange={(on) => setAppearance({ pandaMotion: on })}
          label="Panda movement"
        />
      </div>
    </div>
  );
}

function MemorySection() {
  const memory = useProfileStore((s) => s.memory);
  const addMemory = useProfileStore((s) => s.addMemory);
  const removeMemory = useProfileStore((s) => s.removeMemory);
  const clearMemory = useProfileStore((s) => s.clearMemory);
  const resetOnboarding = useProfileStore((s) => s.resetOnboarding);
  const dialog = useDialog();
  const [draft, setDraft] = useState("");

  async function handleClear() {
    const ok = await dialog.confirm({
      title: "Forget everything?",
      description: "This clears the saved memories below. Your profile and chats stay.",
      confirmLabel: "Forget it all",
      danger: true,
    });
    if (ok) clearMemory();
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm leading-relaxed text-[var(--text-dim)]">
          Things Panda keeps in mind no matter which chat or project you&apos;re in. Add anything you find
          yourself repeating.
        </p>
        <div className="mt-3 flex gap-2">
          <Input
            value={draft}
            onChange={setDraft}
            placeholder="e.g. I prefer short answers"
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
            Remember
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {memory.length === 0 ? (
          <p className="text-sm text-[var(--text-faint)]">Nothing saved yet.</p>
        ) : (
          memory.map((fact) => (
            <div
              key={fact.id}
              className="flex items-start gap-3 rounded-xl border border-[var(--line)] px-3.5 py-3"
            >
              <p className="min-w-0 flex-1 text-sm text-[var(--text)]">{fact.text}</p>
              <button
                onClick={() => removeMemory(fact.id)}
                aria-label="Forget this"
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
          Clear all memories
        </button>
        <button
          onClick={resetOnboarding}
          className="rounded-full border border-[var(--line-strong)] px-4 py-2 text-sm text-[var(--text-dim)] hover:bg-[var(--surface-2)]"
        >
          Redo the setup questions
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
