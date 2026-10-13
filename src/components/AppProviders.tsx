"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useProfileStore } from "@/store/useProfileStore";
import { DialogProvider } from "@/components/ui/Dialog";
import { Onboarding } from "@/components/onboarding/Onboarding";
import { AuthGate } from "@/components/auth/AuthGate";
import { ShellHost } from "@/components/layout/AppShell";
import { I18nProvider } from "@/lib/i18n";

// Loads the saved profile, then either shows first-run setup or the app.
// Everything below this renders only after hydration, so we never flash the
// wrong name or theme.
//
// The student screens are framed by one shell drawn here (`ShellHost`), not by
// each page, so moving between tabs no longer tears the sidebar down and
// builds it again. See AppShell.tsx.

export function AppProviders({ children }: { children: React.ReactNode }) {
  const hydrate = useProfileStore((s) => s.hydrate);
  const hydrated = useProfileStore((s) => s.hydrated);
  const onboarded = useProfileStore((s) => s.onboarded);
  const setupOpen = useProfileStore((s) => s.setupOpen);
  const locale = useProfileStore((s) => s.languages.interface);
  const pathname = usePathname();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // The legal pages are the one thing that must render before anybody has an
  // account. A district reviewer opens /legal/privacy from an email, signed
  // out, and has to land on the document — not on first-run setup asking a
  // lawyer what language they speak. Gating the terms behind onboarding is how
  // you end up with terms nobody outside the app has ever read.
  //
  // Only the gate is skipped. I18nProvider stays above this so the pages still
  // pick up a saved language, and /legal carries its own layout and theme.
  const isPublicDocument = pathname?.startsWith("/legal") ?? false;
  if (isPublicDocument) {
    return <I18nProvider locale={locale}>{children}</I18nProvider>;
  }

  return (
    <I18nProvider locale={locale}>
      <AuthGate>
        <DialogProvider>
          {!hydrated ? (
            <div className="h-dvh bg-[var(--bg)]" />
          ) : !onboarded ? (
            <Onboarding />
          ) : (
            <>
              {/* "Redo setup" opens over the app rather than replacing it, so
                  Cancel puts the student back exactly where they were. The app
                  behind is inert meanwhile — not focusable, not clickable. */}
              <div className="contents" inert={setupOpen || undefined}>
                <ShellHost>{children}</ShellHost>
              </div>
              {setupOpen && <Onboarding redo />}
            </>
          )}
        </DialogProvider>
      </AuthGate>
    </I18nProvider>
  );
}
