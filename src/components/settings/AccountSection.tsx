"use client";

import { useEffect } from "react";
import { useI18n } from "@/lib/i18n";
import { useAuthStore } from "@/store/useAuthStore";
import { useDialog } from "@/components/ui/Dialog";
import { SignInPanel } from "@/components/auth/SignInPanel";
import { LogOutIcon } from "@/components/icons";
import { Card } from "./parts";

// Sign in, sign out, and an honest note about what an account currently buys
// you: separate data on a shared device, not sync between devices.

export function AccountSection() {
  const { t } = useI18n();
  const account = useAuthStore((s) => s.account);
  const hydrated = useAuthStore((s) => s.hydrated);
  const hydrate = useAuthStore((s) => s.hydrate);
  const signOut = useAuthStore((s) => s.signOut);
  const dialog = useDialog();

  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrated, hydrate]);

  if (!hydrated) return <div className="skeleton h-24 rounded-[var(--radius-lg)]" />;

  // Signing out reloads the app into the guest's (or nobody's) data, which on
  // a shared laptop looks exactly like everything vanished. One question
  // first, rather than a button that does that on a stray tap.
  async function confirmSignOut() {
    const ok = await dialog.confirm({
      title: t("settings.signOutTitle"),
      description: t("settings.signOutBody"),
      confirmLabel: t("auth.signOut"),
    });
    if (ok) signOut();
  }

  if (account) {
    return (
      <section className="card flex flex-wrap items-center gap-4 p-5">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--accent-soft)]">
          {account.picture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={account.picture} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-lg font-semibold text-[var(--accent-text)]">
              {(account.name || account.email || "?").charAt(0).toUpperCase()}
            </span>
          )}
        </span>

        {/* Name and email stay selectable on purpose: this is the one place a
            student can copy the address their work is filed under. */}
        <div className="min-w-0 flex-1">
          <p className="eyebrow mb-0.5 cursor-default select-none">{t("settings.account")}</p>
          <p className="truncate font-medium text-[var(--text)]">{account.name || t("auth.signedIn")}</p>
          <p className="truncate text-sm text-[var(--text-faint)]">{account.email}</p>
        </div>

        <button type="button" onClick={() => void confirmSignOut()} className="btn btn-outline shrink-0">
          <LogOutIcon />
          {t("auth.signOut")}
        </button>
      </section>
    );
  }

  return (
    <Card title={t("settings.signIn")} description={t("settings.signInHint")}>
      <div className="max-w-sm">
        <SignInPanel />
      </div>
    </Card>
  );
}
