"use client";

// A stable id for this browser, sent with API calls so guests in the same room
// are counted separately.
//
// A school puts its whole network behind one public address, so rate limiting
// guests by IP alone counts thirty students in a classroom as one caller. The
// limit that stops a script then also stops the class.
//
// This id is NOT a security claim and nothing may be authorised by it: a caller
// can forge or rotate it freely. It only splits honest guests apart from each
// other. The per-address ceiling is what still bounds someone who rotates it,
// which is why both limits exist rather than this one replacing the other.

import { getSupabase } from "@/lib/supabase/browser";
import { DEVICE_HEADER } from "./deviceHeader";

export { DEVICE_HEADER };

const KEY = "sca:device:v1";

let cached: string | null = null;

export function deviceId(): string {
  if (cached) return cached;
  if (typeof window === "undefined") return "";

  try {
    const existing = window.localStorage.getItem(KEY);
    if (existing) {
      cached = existing;
      return existing;
    }
    const made = crypto.randomUUID();
    window.localStorage.setItem(KEY, made);
    cached = made;
    return made;
  } catch {
    // Storage blocked, as it is in a locked-down private window. A per-session
    // id still separates this tab from the rest of the room; it just won't
    // survive a reload, which costs the student nothing.
    cached = crypto.randomUUID();
    return cached;
  }
}


// --- Who is asking ----------------------------------------------------------
//
// The device id above separates guests; this next part is the opposite job —
// proving a student is signed in, so the API gives them the signed-in rate
// limit instead of the tight guest one. Without the header every signed-in
// student was silently counted as a guest and ran out after a handful of
// messages.
//
// The token is cached rather than fetched per message, because the send path is
// the one place latency is felt. Supabase keeps the session locally, so reading
// it costs nothing after the client exists, and onAuthStateChange keeps the
// cache honest across sign-in, sign-out and a token refresh.

let accessToken: string | null = null;
let priming: Promise<void> | null = null;

function prime(): Promise<void> {
  if (priming) return priming;
  priming = (async () => {
    const supabase = await getSupabase();
    // No Supabase on this deployment: everyone is a guest, on purpose.
    if (!supabase) return;
    const { data } = await supabase.auth.getSession();
    accessToken = data.session?.access_token ?? null;
    supabase.auth.onAuthStateChange((_event, session) => {
      accessToken = session?.access_token ?? null;
    });
  })().catch(() => {
    // Never let this break a send. A missing token means guest limits, which
    // is a worse experience, not a broken one.
  });
  return priming;
}

/**
 * Resolves once the cached token is usable. Only the first call can actually
 * wait, and what it waits for is a memoised config fetch plus a local session
 * read — not a round trip per message. Call it before a fetch; every call after
 * the first returns an already-settled promise.
 */
export function authReady(): Promise<void> {
  return prime();
}

/**
 * Spread into a fetch's headers. Empty for a guest, and that is a supported
 * state rather than an error: the request goes through on the guest limit.
 */
export function authHeader(): Record<string, string> {
  // Starts the cache filling if nobody has yet, but never waits on it.
  void prime();
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

/** Spread into a fetch's headers. Empty on the server, where there is no device. */
export function deviceHeader(): Record<string, string> {
  const id = deviceId();
  return id ? { [DEVICE_HEADER]: id } : {};
}
