"use client";

import { useEffect, useId, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useAuthStore } from "@/store/useAuthStore";
import { GoogleSignIn } from "./GoogleSignIn";
import { GlobeIcon, InfoIcon } from "@/components/icons";

// The sign-in form.
//
// Email and password lead, because that is the path that survives a school
// filter: the browser only ever talks to your own Supabase subdomain. The
// Google button is underneath and honestly labelled, because whichever way you
// start it, signing in with Google means a trip to accounts.google.com — and if
// that domain is blocked, no amount of wiring on this end changes it.

type Setup = "loading" | "supabase" | "google-only" | "none";

export function SignInPanel({ onDone }: { onDone?: () => void }) {
  const { t } = useI18n();
  const signInWithPassword = useAuthStore((s) => s.signInWithPassword);
  const signUpWithPassword = useAuthStore((s) => s.signUpWithPassword);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const busy = useAuthStore((s) => s.busy);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);

  const [setup, setSetup] = useState<Setup>("loading");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const ids = { name: useId(), email: useId(), password: useId() };

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/config")
      .then((r) => r.json())
      .then((d: { clientId: string | null; supabase: unknown }) => {
        if (cancelled) return;
        setSetup(d.supabase ? "supabase" : d.clientId ? "google-only" : "none");
      })
      .catch(() => {
        if (!cancelled) setSetup("none");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setNote(null);
    clearError();

    if (creating) {
      const message = await signUpWithPassword(email, password, name);
      if (message) setNote(message);
      else onDone?.();
    } else if (await signInWithPassword(email, password)) {
      onDone?.();
    }
  }

  if (setup === "loading") {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <div className="skeleton h-10" />
        <div className="skeleton h-10" />
        <div className="skeleton h-10" />
      </div>
    );
  }

  if (setup === "none") {
    // Said to the student in their language, without the setup jargon; the
    // variable names are for whoever runs this copy, one click further in.
    return (
      <div className="text-start">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--info-soft)] text-[var(--info)]">
            <InfoIcon className="h-[18px] w-[18px]" />
          </span>
          <div>
            <p className="font-medium text-[var(--text)]">{t("auth.notSetUpTitle")}</p>
            <p className="mt-1 text-sm leading-relaxed text-[var(--text-dim)]">{t("auth.notSetUpBody")}</p>
          </div>
        </div>
        <details className="mt-4 text-[13px] leading-relaxed text-[var(--text-faint)]">
          <summary className="cursor-pointer select-none font-medium text-[var(--text-dim)]">{t("auth.forAdmins")}</summary>
          <p className="mt-2">
            Create a project at supabase.com and set{" "}
            <code className="rounded bg-[var(--surface-2)] px-1 py-0.5 font-mono text-xs">SUPABASE_URL</code> and{" "}
            <code className="rounded bg-[var(--surface-2)] px-1 py-0.5 font-mono text-xs">SUPABASE_ANON_KEY</code>.
          </p>
        </details>
      </div>
    );
  }

  if (setup === "google-only") {
    return <GoogleSignIn onDone={onDone} />;
  }

  return (
    <div className="flex w-full flex-col gap-4 text-start">
      <form onSubmit={submit} className="flex flex-col gap-3">
        {creating && (
          <div>
            <label htmlFor={ids.name} className="field-label mb-1.5">
              {t("settings.name")}
            </label>
            <input
              id={ids.name}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("settings.namePlaceholder")}
              autoComplete="name"
              className="input"
            />
          </div>
        )}

        <div>
          <label htmlFor={ids.email} className="field-label mb-1.5">
            {t("auth.email")}
          </label>
          <input
            id={ids.email}
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className="input"
          />
        </div>

        <div>
          <label htmlFor={ids.password} className="field-label mb-1.5">
            {t("auth.password")}
          </label>
          <input
            id={ids.password}
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={creating ? "new-password" : "current-password"}
            className="input"
          />
        </div>

        <button type="submit" disabled={busy || !email.trim() || password.length < 6} className="btn btn-primary mt-1 w-full">
          {busy ? t("auth.oneMoment") : t(creating ? "auth.createAccount" : "auth.signIn")}
        </button>
      </form>

      {note && (
        <p role="status" className="rounded-[var(--radius)] bg-[var(--success-soft)] px-3.5 py-2.5 text-sm text-[var(--success)]">
          {note}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-[var(--radius)] bg-[var(--danger-soft)] px-3.5 py-2.5 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => {
          setCreating((v) => !v);
          setNote(null);
          clearError();
        }}
        className="btn btn-ghost btn-sm self-center"
      >
        {t(creating ? "auth.haveAccount" : "auth.makeAccount")}
      </button>

      <div className="border-t border-[var(--line)] pt-4">
        <button type="button" onClick={signInWithGoogle} disabled={busy} className="btn btn-secondary w-full">
          <GlobeIcon />
          {t("auth.continueWithGoogle")}
        </button>
        <p className="mt-2 text-xs leading-relaxed text-[var(--text-faint)]">{t("auth.googleNote")}</p>
      </div>
    </div>
  );
}
