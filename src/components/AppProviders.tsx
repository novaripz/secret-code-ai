"use client";

import { useEffect } from "react";
import { useProfileStore } from "@/store/useProfileStore";
import { DialogProvider } from "@/components/ui/Dialog";
import { Onboarding } from "@/components/onboarding/Onboarding";
import { AuthGate } from "@/components/auth/AuthGate";
import { I18nProvider } from "@/lib/i18n";

// Loads the saved profile, then either shows first-run setup or the app.
// Everything below this renders only after hydration, so we never flash the
// wrong name or theme.

export function AppProviders({ children }: { children: React.ReactNode }) {
  const hydrate = useProfileStore((s) => s.hydrate);
  const hydrated = useProfileStore((s) => s.hydrated);
  const onboarded = useProfileStore((s) => s.onboarded);
  const locale = useProfileStore((s) => s.languages.interface);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <I18nProvider locale={locale}>
      <AuthGate>
        <DialogProvider>
          {!hydrated ? <div className="h-screen bg-[var(--bg)]" /> : onboarded ? children : <Onboarding />}
        </DialogProvider>
      </AuthGate>
    </I18nProvider>
  );
}
