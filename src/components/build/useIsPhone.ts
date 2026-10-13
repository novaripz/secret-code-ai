"use client";

import { useSyncExternalStore } from "react";

// Phone or not, live — on the same line Tailwind's `md:` starts, so the
// workspace's JavaScript and its CSS always agree about which layout this is.

const PHONE_QUERY = "(max-width: 767px)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** The workspace only renders in the browser, so there is no server answer to disagree with. */
export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(PHONE_QUERY).matches, () => false);
}
