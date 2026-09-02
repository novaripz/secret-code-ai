"use client";

import { useEffect, useState } from "react";
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
            placeholder="Your name"
            aria-label="Your name"
            autoComplete="name"
            className={field}
          />
        )}

        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          aria-label="Email"
          autoComplete="email"
          className={field}
        />

        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          aria-label="Password"
          autoComplete={creating ? "new-password" : "current-password"}
          className={field}
        />

        <button
          type="submit"
          disabled={busy || !email.trim() || password.length < 6}
          className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--accent-contrast)] transition-opacity disabled:opacity-40"
        >
          {busy ? "One moment…" : creating ? "Create account" : "Sign in"}
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
        {creating ? "I already have an account" : "Create an account"}
      </button>

      <div className="flex items-center gap-3 py-1">
        <span className="h-px flex-1 bg-[var(--line)]" />
        <span className="text-xs uppercase tracking-wide text-[var(--text-faint)]">or</span>
        <span className="h-px flex-1 bg-[var(--line)]" />
      </div>

      <button
        onClick={signInWithGoogle}
        disabled={busy}
        className="rounded-xl border border-[var(--line-strong)] px-4 py-2.5 text-sm text-[var(--text-dim)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)] disabled:opacity-40"
      >
        Continue with Google
      </button>
      <p className="text-xs leading-relaxed text-[var(--text-faint)]">
        Google sends you to accounts.google.com, which some school networks block. Email works either
        way.
      </p>

      {note && <p className="text-sm text-[var(--success)]">{note}</p>}
      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
    </div>
  );
}
