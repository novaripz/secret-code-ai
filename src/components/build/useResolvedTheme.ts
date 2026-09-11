"use client";

import { useEffect, useState } from "react";
import { useProfileStore } from "@/store/useProfileStore";

// The colour the app is actually wearing right now. The profile store holds the
// student's choice, which can be "system" — and "system" is a live thing, so it
// has to be watched rather than read once. Anything that can't use CSS variables
// (Monaco, canvas, an <iframe> we control) needs this answer.

export function useResolvedTheme(): "dark" | "light" {
  const theme = useProfileStore((s) => s.theme);
  const [systemLight, setSystemLight] = useState(false);

  useEffect(() => {
    if (theme !== "system") return;
    const query = window.matchMedia("(prefers-color-scheme: light)");
    const sync = () => setSystemLight(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, [theme]);

  if (theme === "system") return systemLight ? "light" : "dark";
  return theme;
}
