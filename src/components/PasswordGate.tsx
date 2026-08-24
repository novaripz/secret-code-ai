"use client";

import { useState } from "react";
import { SparkleIcon } from "@/components/icons";

// A simple front door for a site that isn't public yet. This is NOT real
// security — the password lives in the client bundle, so anyone who opens
// dev tools can read it. It's meant to keep casual visitors out while the
// app is still being built, nothing more. Swap this for real auth before
// anything sensitive lives behind it.

const SITE_PASSWORD = "OBlaze67";
const UNLOCK_KEY = "sca:gate-unlocked";

function isUnlocked(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(UNLOCK_KEY) === "1";
  } catch {
    return false;
  }
}

export function PasswordGate({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState(isUnlocked);
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password === SITE_PASSWORD) {
      try {
        window.sessionStorage.setItem(UNLOCK_KEY, "1");
      } catch {
        // Private browsing or storage blocked — still unlock for this load.
      }
      setUnlocked(true);
    } else {
      setError(true);
      setPassword("");
    }
  }

  if (unlocked) return <>{children}</>;

  return (
    <div className="flex h-screen items-center justify-center bg-[var(--bg)] p-4">
      <form onSubmit={submit} className="w-full max-w-xs animate-rise">
        <div className="mb-6 flex justify-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--surface-2)]">
            <SparkleIcon className="h-5 w-5 text-[var(--text)]" />
          </span>
        </div>

        <label htmlFor="gate-password" className="block text-center text-sm font-medium text-[var(--text)]">
          Enter password
        </label>

        <input
          id="gate-password"
          type="password"
          autoFocus
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError(false);
          }}
          className={`mt-3 w-full rounded-xl border bg-[var(--surface-2)] px-3.5 py-2.5 text-center text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] ${
            error ? "border-[var(--danger)]" : "border-[var(--line-strong)] focus:border-[var(--focus)]"
          }`}
        />

        {error && <p className="mt-2 text-center text-xs text-[var(--danger)]">That&apos;s not it — try again.</p>}

        <button
          type="submit"
          className="mt-4 w-full rounded-xl bg-[var(--accent)] py-2.5 text-sm font-semibold text-[var(--accent-contrast)] hover:opacity-90"
        >
          Enter
        </button>
      </form>
    </div>
  );
}
