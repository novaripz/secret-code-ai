"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { SignInPanel } from "@/components/auth/SignInPanel";

// Sign in, sign out, and an honest note about what an account currently buys
// you: separate data on a shared device, not sync between devices.

export function AccountSection() {
  const { account, hydrated, hydrate, signOut } = useAuthStore();

  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrated, hydrate]);

  if (!hydrated) return <div className="h-24 rounded-2xl border border-[var(--line)]" />;

  if (account) {
    return (
      <div className="flex items-center gap-4 rounded-2xl border border-[var(--line)] p-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--surface-2)]">
          {account.picture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={account.picture} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-lg font-semibold text-[var(--text-dim)]">
              {(account.name || account.email || "?").charAt(0).toUpperCase()}
            </span>
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-[var(--text)]">{account.name || "Signed in"}</p>
          <p className="truncate text-sm text-[var(--text-faint)]">{account.email}</p>
        </div>

        <button
          onClick={signOut}
          className="shrink-0 rounded-xl border border-[var(--line-strong)] px-3.5 py-2 text-sm text-[var(--text-dim)] transition-colors hover:border-[var(--danger)] hover:text-[var(--danger)]"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--line)] p-4">
      <p className="font-medium text-[var(--text)]">Sign in</p>
      <p className="mt-1 mb-4 text-sm leading-relaxed text-[var(--text-faint)]">
        Keeps your profile, chats and memory separate from anyone else using this browser. It does not sync
        between devices yet, so your history stays on whichever computer you made it on.
      </p>
      <SignInPanel />
    </div>
  );
}
