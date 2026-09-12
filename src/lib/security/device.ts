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



/** Spread into a fetch's headers. Empty on the server, where there is no device. */
export function deviceHeader(): Record<string, string> {
  const id = deviceId();
  return id ? { [DEVICE_HEADER]: id } : {};
}
