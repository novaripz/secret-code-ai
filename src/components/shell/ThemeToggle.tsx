"use client";

import { useSyncExternalStore } from "react";
import { useI18n } from "@/lib/i18n";
import { isDarkTheme, useProfileStore } from "@/store/useProfileStore";
import { MoonIcon, SunIcon } from "@/components/icons";

// The light/dark switch in the header.
//
// It used to ask `theme === "dark"`, which is wrong for most students: a new
// one is on "system", so on a dark laptop they saw a moon labelled "Switch to
// dark mode", and pressing it went to LIGHT. Ocean and Forest are dark too and
// showed the same lie. It now asks the same question the store's toggle acts on
// — `isDarkTheme` — so the icon, the label and the result always agree.

const query = "(prefers-color-scheme: light)";

/** Re-renders when the OS flips, so "system" shows the right icon live. */
function useOsLight(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", notify);
      return () => mql.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export function useIsDark(): boolean {
  const theme = useProfileStore((s) => s.theme);
  const osLight = useOsLight();
  return theme === "system" ? !osLight : isDarkTheme(theme);
}

export function ThemeToggle() {
  const toggleTheme = useProfileStore((s) => s.toggleTheme);
  const dark = useIsDark();
  const { t } = useI18n();
  const label = t(dark ? "theme.switchToLight" : "theme.switchToDark");

  return (
    <button type="button" onClick={toggleTheme} title={label} aria-label={label} className="icon-btn">
      {/* The icon shows where the button takes you, matching the label. */}
      {dark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
