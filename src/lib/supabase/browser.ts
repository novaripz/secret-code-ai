"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// The Supabase client, built once from config the server hands over at runtime.
//
// Why Supabase at all: the Google Identity Services button loads a script from
// accounts.google.com, and school networks block that domain outright. Supabase
// talks to your own project subdomain instead, so email sign-in works on a
// filtered network where the Google button never even renders.
//
// The URL and anon key are public by design — the anon key is what every
// browser using a Supabase project sends, and row-level security, not secrecy,
// is what protects data behind it. Serving them from /api/auth/config rather
// than inlining them at build time keeps the whole setup to server-side
// variables, matching how GOOGLE_CLIENT_ID is handled.

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

let pending: Promise<SupabaseClient | null> | null = null;

async function build(): Promise<SupabaseClient | null> {
  const res = await fetch("/api/auth/config");
  const data = (await res.json()) as { supabase?: SupabaseConfig | null };
  if (!data.supabase) return null;

  return createClient(data.supabase.url, data.supabase.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Sign-in through Google comes back as a redirect carrying the session in
      // the URL fragment; this is what picks it up and cleans the address bar.
      detectSessionInUrl: true,
    },
  });
}

/**
 * Resolves to the client, or null when Supabase isn't configured for this
 * deployment. Memoised: creating a second client would give it a second copy
 * of the session and a second refresh timer.
 */
export function getSupabase(): Promise<SupabaseClient | null> {
  if (!pending) {
    pending = build().catch(() => null);
  }
  return pending;
}
