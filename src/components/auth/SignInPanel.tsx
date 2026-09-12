"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useAuthStore } from "@/store/useAuthStore";
import { GoogleSignIn } from "./GoogleSignIn";

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
  const { signInWithPassword, signUpWithPassword, signInWithGoogle, busy, error, clearError } =
    useAuthStore();

  const [setup, setSetup] = useState<Setup>("loading");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [note, setNote] = useState<string | null>(null);

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
    return <div className="h-40 animate-pulse rounded-2xl bg-[var(--surface-2)]" />;
  }

  if (setup === "none") {
    return (
      <p className="text-sm leading-relaxed text-[var(--text-faint)]">
        Sign-in isn&apos;t set up yet. Create a project at supabase.com and set{" "}
        <code className="rounded bg-[var(--surface-2)] px-1 py-0.5 font-mono text-xs">SUPABASE_URL</code> and{" "}
        <code className="rounded bg-[var(--surface-2)] px-1 py-0.5 font-mono text-xs">SUPABASE_ANON_KEY</code>.
      </p>
    );
  }

  if (setup === "google-only") {
    return <GoogleSignIn onDone={onDone} />;
  }

  const field =
    "w-full rounded-xl border border-[var(--line-strong)] bg-[var(--surface-2)] px-3.5 py-2.5 text-sm text-[var(--text)] outline-none transition-colors focus:border-[var(--focus)]";

  return (
    <div className="flex w-full flex-col gap-3">
      <form onSubmit={submit} className="flex flex-col gap-2.5 text-left">
        {creating && (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("settings.namePlaceholder")}
            aria-label={t("settings.namePlaceholder")}
            autoComplete="name"
            className={field}
          />
        )}

        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("auth.email")}
          aria-label={t("auth.email")}
          autoComplete="email"
          className={field}
        />

        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t("auth.password")}
          aria-label={t("auth.password")}
          autoComplete={creating ? "new-password" : "current-password"}
          className={field}
        />

        <button
          type="submit"
          disabled={busy || !email.trim() || password.length < 6}
          className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--accent-contrast)] transition-opacity disabled:opacity-40"
        >
          {busy ? t("auth.oneMoment") : t(creating ? "auth.createAccount" : "auth.signIn")}
        </button>
      </form>

      <button
        onClick={() => {
          setCreating((v) => !v);
          setNote(null);
          clearError();
        }}
        className="text-sm text-[var(--text-faint)] underline-offset-4 hover:text-[var(--text-dim)] hover:underline"
      >
        {t(creating ? "auth.haveAccount" : "auth.makeAccount")}
      </button>

      <div className="flex items-center gap-3 py-1">
        <span className="h-px flex-1 bg-[var(--line)]" />
        <span className="text-xs uppercase tracking-wide text-[var(--text-faint)]">{t("auth.or")}</span>
        <span className="h-px flex-1 bg-[var(--line)]" />
      </div>

      <button
        onClick={signInWithGoogle}
        disabled={busy}
        className="rounded-xl border border-[var(--line-strong)] px-4 py-2.5 text-sm text-[var(--text-dim)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)] disabled:opacity-40"
      >
        {t("auth.continueWithGoogle")}
      </button>
      <p className="text-xs leading-relaxed text-[var(--text-faint)]">
        {t("auth.googleNote")}
      </p>

      {note && <p className="text-sm text-[var(--success)]">{note}</p>}
      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
    </div>
  );
}
