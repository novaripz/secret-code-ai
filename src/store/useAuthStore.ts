"use client";

import { create } from "zustand";
import type { Account } from "@/app/api/auth/google/route";

// Who is signed in.
//
// Signing in does two things today: it gives the app a name and picture, and
// it namespaces everything stored on this device by account id. That last part
// is what makes a shared laptop safe — two friends on the same browser get
// separate profiles, chats and memory instead of walking into each other's.
//
// What it does NOT do yet is sync between devices. That needs the data to live
// on a server rather than in the browser, which is a separate piece of work.
// Signing in on your phone gives you your name, not your chat history.

const KEY = "sca:account:v1";

interface AuthState {
  account: Account | null;
  hydrated: boolean;
  error: string | null;
  busy: boolean;

  hydrate: () => void;
  signIn: (credential: string) => Promise<boolean>;
  signOut: () => void;
  clearError: () => void;
}

function read(): Account | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Account;
    return parsed && typeof parsed.id === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function write(account: Account | null) {
  if (typeof window === "undefined") return;
  try {
    if (account) window.localStorage.setItem(KEY, JSON.stringify(account));
    else window.localStorage.removeItem(KEY);
  } catch {
    // Storage blocked. Sign-in still works for this tab, it just won't stick.
  }
}

/**
 * The suffix every other store appends to its storage keys, so each account
 * keeps its own data on a shared device. Signed out is the empty suffix, which
 * is also what everything used before accounts existed — so anyone who never
 * signs in keeps the chats they already have.
 */
export function accountScope(): string {
  const account = read();
  return account ? `:${account.id}` : "";
}

export const useAuthStore = create<AuthState>((set) => ({
  account: null,
  hydrated: false,
  error: null,
  busy: false,

  hydrate: () => set({ account: read(), hydrated: true }),

  signIn: async (credential) => {
    set({ busy: true, error: null });
    try {
      const res = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential }),
      });
      const data = await res.json();

      if (!res.ok) {
        set({ error: data.error ?? "Sign-in failed.", busy: false });
        return false;
      }

      write(data.account);
      set({ account: data.account, busy: false });
      // Every store picks its storage key once, at module load. Reloading is
      // the honest way to swap the whole app onto the new account's data
      // rather than leaving half of it pointed at the previous scope.
      window.location.reload();
      return true;
    } catch {
      set({ error: "Couldn't reach the server.", busy: false });
      return false;
    }
  },

  signOut: () => {
    write(null);
    set({ account: null });
    window.location.reload();
  },

  clearError: () => set({ error: null }),
}));
