"use client";

import { create } from "zustand";
import type { User } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase/browser";
import type { Account } from "@/lib/auth/types";

// Who is signed in.
//
// Sign-in does two things today: it gives the app a name and picture, and it
// namespaces everything stored on this device by account id. That last part is
// what makes a shared laptop safe — two friends in the same browser get
// separate profiles, chats and memory instead of walking into each other's.
//
// There are two ways in, and the order matters. Supabase is first because it
// works on a filtered school network: the browser only ever talks to your own
// Supabase subdomain, so an email and password get through where Google's
// script does not. Google Identity Services stays as a fallback for
// deployments that never set Supabase up, and it needs accounts.google.com to
// be reachable.
//
// What none of this does yet is sync between devices. The data still lives in
// this browser, so signing in on your phone gives you your name, not your chat
// history. Supabase being here is the first half of fixing that.

const KEY = "sca:account:v1";

interface AuthState {
  account: Account | null;
  hydrated: boolean;
  error: string | null;
  busy: boolean;
  /** Whether Supabase is configured, so the UI knows which form to offer. */
  supabaseReady: boolean;

  hydrate: () => void;
  signInWithPassword: (email: string, password: string) => Promise<boolean>;
  signUpWithPassword: (email: string, password: string, name: string) => Promise<string | null>;
  signInWithGoogle: () => Promise<void>;
  /** Google Identity Services fallback: a verified ID token from the button. */
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

/**
 * A failed Google sign-in comes back as a redirect carrying the reason in the
 * URL rather than as a thrown error, so without this the student lands on the
 * sign-in screen again with no explanation at all. Reads both shapes Supabase
 * uses — query string and fragment — and tidies the address bar afterwards.
 */
let readOauthError = false;
let oauthErrorValue: string | null = null;

function oauthError(): string | null {
  if (typeof window === "undefined") return null;

  // Reading it clears it from the address bar, so a second call — React runs
  // effects twice in development — would find nothing and wipe the message
  // that the first call found. Answer from the first read instead.
  if (readOauthError) return oauthErrorValue;
  readOauthError = true;

  const query = new URLSearchParams(window.location.search);
  const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const description = query.get("error_description") ?? fragment.get("error_description");
  const code = query.get("error") ?? fragment.get("error");
  if (!description && !code) return null;

  window.history.replaceState({}, "", window.location.pathname);
  oauthErrorValue = description ?? "That sign-in didn't complete.";
  return oauthErrorValue;
}

/** A Supabase user, flattened into the shape the rest of the app already uses. */
function toAccount(user: User): Account {
  const meta = user.user_metadata ?? {};
  const name =
    (typeof meta.full_name === "string" && meta.full_name) ||
    (typeof meta.name === "string" && meta.name) ||
    "";
  const picture =
    (typeof meta.avatar_url === "string" && meta.avatar_url) ||
    (typeof meta.picture === "string" && meta.picture) ||
    undefined;

  return { id: user.id, name, email: user.email ?? "", picture };
}

/**
 * Every store picks its storage key once, at module load, so swapping accounts
 * mid-session would leave half the app pointed at the previous scope. Reloading
 * is the honest fix — but only when the scope actually changed, or a session
 * restored on page load would reload forever.
 */
function adopt(account: Account | null) {
  const before = read()?.id ?? null;
  const after = account?.id ?? null;
  write(account);
  if (before !== after) window.location.reload();
}

export const useAuthStore = create<AuthState>((set, get) => ({
  account: null,
  hydrated: false,
  error: null,
  busy: false,
  supabaseReady: false,

  hydrate: () => {
    // Show whatever this browser already had straight away, so a signed-in
    // student never sees the sign-in screen flash while we check with Supabase.
    const cached = read();
    set({ account: cached, hydrated: true, error: oauthError() });

    void (async () => {
      const supabase = await getSupabase();
      if (!supabase) return;
      set({ supabaseReady: true });

      // getUser() asks Supabase rather than trusting the stored JWT, so an
      // expired or revoked session is caught here instead of being believed.
      const { data, error } = await supabase.auth.getUser();

      if (error || !data.user) {
        // Only clear an account Supabase is responsible for. A Google Identity
        // sign-in from before Supabase existed isn't its to invalidate, and a
        // network blip shouldn't sign anyone out either.
        const { data: local } = await supabase.auth.getSession();
        if (local.session === null && cached && cached.id.includes("-")) {
          // Supabase ids are UUIDs; Google's are numeric strings.
          adopt(null);
        }
        return;
      }

      const account = toAccount(data.user);
      set({ account });
      adopt(account);
    })();
  },

  signInWithPassword: async (email, password) => {
    set({ busy: true, error: null });
    const supabase = await getSupabase();
    if (!supabase) {
      set({ error: "Sign-in isn't set up yet.", busy: false });
      return false;
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error || !data.user) {
      set({ error: error?.message ?? "That email and password didn't match.", busy: false });
      return false;
    }

    const account = toAccount(data.user);
    set({ account, busy: false });
    adopt(account);
    return true;
  },

  signUpWithPassword: async (email, password, name) => {
    set({ busy: true, error: null });
    const supabase = await getSupabase();
    if (!supabase) {
      set({ error: "Sign-in isn't set up yet.", busy: false });
      return null;
    }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: name.trim() } },
    });

    if (error) {
      set({ error: error.message, busy: false });
      return null;
    }

    // With email confirmation switched on, Supabase creates the user but hands
    // back no session until they click the link. Saying so is better than
    // dropping them on a screen that looks like nothing happened.
    if (!data.session || !data.user) {
      set({ busy: false });
      return "Check your email for a confirmation link, then sign in.";
    }

    const account = toAccount(data.user);
    set({ account, busy: false });
    adopt(account);
    return null;
  },

  signInWithGoogle: async () => {
    set({ busy: true, error: null });
    const supabase = await getSupabase();
    if (!supabase) {
      set({ error: "Sign-in isn't set up yet.", busy: false });
      return;
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });

    if (error) set({ error: error.message, busy: false });
    // On success the browser is already navigating away.
  },

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

      set({ account: data.account, busy: false });
      adopt(data.account);
      return true;
    } catch {
      set({ error: "Couldn't reach the server.", busy: false });
      return false;
    }
  },

  signOut: () => {
    void (async () => {
      if (get().supabaseReady) {
        const supabase = await getSupabase();
        await supabase?.auth.signOut();
      }
      set({ account: null });
      adopt(null);
      // adopt() only reloads when the scope changed, which it has unless there
      // was nothing to sign out of.
      window.location.reload();
    })();
  },

  clearError: () => set({ error: null }),
}));
