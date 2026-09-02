"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { SignInPanel } from "./SignInPanel";
import { Wordmark } from "@/components/Wordmark";

// The first screen anyone sees: sign in, or continue as a guest. Guests aren't
// blocked — this just offers the choice up front instead of burying sign-in in
// Settings.

const GUEST_KEY = "sca:guest:v1";

function isGuest(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(GUEST_KEY) === "1";
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { account, hydrated, hydrate } = useAuthStore();

  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrated, hydrate]);

  if (!hydrated) return <div className="h-screen bg-[var(--bg)]" />;

  if (!account && !isGuest()) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-8 bg-[var(--bg)] px-4">
        <Wordmark size="lg" />

        <div className="w-full max-w-[19rem] animate-rise text-center">
          <p className="mb-6 text-sm leading-relaxed text-[var(--text-faint)]">
            Sign in to keep your chats separate from anyone else using this device.
          </p>

          <div className="flex flex-col items-center gap-3">
            <SignInPanel />

            <button
              onClick={() => {
                window.localStorage.setItem(GUEST_KEY, "1");
                window.location.reload();
              }}
              className="text-sm text-[var(--text-faint)] underline-offset-4 hover:text-[var(--text-dim)] hover:underline"
            >
              Continue as guest
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
