"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { useAuthStore } from "@/store/useAuthStore";
import { SignInPanel } from "./SignInPanel";
import { Wordmark } from "@/components/Wordmark";
import { PandaSitting } from "@/components/Panda";
import { ArrowRightIcon, CalendarCheckIcon, ChatIcon, HammerIcon, UserIcon } from "@/components/icons";

// The first screen anyone sees: sign in, or continue as a guest. Guests aren't
// blocked — this just offers the choice up front instead of burying sign-in in
// Settings.
//
// It is also the first impression for a student who has never heard of Panda,
// so on a screen wide enough it says, in three lines, what the app is for —
// before asking for an email address.

const GUEST_KEY = "sca:guest:v1";

function isGuest(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(GUEST_KEY) === "1";
  } catch {
    return false;
  }
}

function Point({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--accent-soft)] text-[var(--accent-text)] [&>svg]:h-[18px] [&>svg]:w-[18px]">
        {icon}
      </span>
      <span className="pt-1.5 text-[15px] leading-snug text-[var(--text-dim)]">{children}</span>
    </li>
  );
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const account = useAuthStore((s) => s.account);
  const hydrated = useAuthStore((s) => s.hydrated);
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrated, hydrate]);

  if (!hydrated) return <div className="h-dvh bg-[var(--bg)]" />;

  if (account || isGuest()) return <>{children}</>;

  function continueAsGuest() {
    try {
      window.localStorage.setItem(GUEST_KEY, "1");
    } catch {
      // Storage blocked: the reload below will ask again, which is the honest
      // outcome when nothing can be remembered.
    }
    window.location.reload();
  }

  return (
    <div className="h-dvh overflow-y-auto bg-[var(--bg)]">
      <div className="flex min-h-full">
        <aside className="brand-panel hidden w-[46%] max-w-2xl shrink-0 flex-col justify-between border-e border-[var(--line)] p-12 lg:flex">
          <Wordmark size="lg" />
          <div>
            <PandaSitting className="h-[230px] w-[184px]" />
            <h2 className="mt-8 max-w-md text-[32px] font-semibold leading-tight tracking-tight text-[var(--text)]">
              {t("auth.brandTitle")}
            </h2>
            <ul className="mt-7 flex max-w-md flex-col gap-4">
              <Point icon={<ChatIcon />}>{t("auth.pointChat")}</Point>
              <Point icon={<CalendarCheckIcon />}>{t("auth.pointPlan")}</Point>
              <Point icon={<HammerIcon />}>{t("auth.pointBuild")}</Point>
            </ul>
          </div>
          <p className="text-[13px] text-[var(--text-faint)]">{t("app.tagline")}</p>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col items-center justify-center px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(2rem+env(safe-area-inset-top))]">
          <div className="w-full max-w-[24rem] animate-rise">
            <div className="mb-6 flex flex-col items-center text-center lg:items-start lg:text-start">
              <span className="lg:hidden">
                <PandaSitting className="mb-3 h-[96px] w-[77px]" />
              </span>
              <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-[var(--text)]">
                {t("auth.welcomeTitle")}
              </h1>
              <p className="mt-2 text-[15px] leading-relaxed text-[var(--text-dim)]">{t("auth.whySignIn")}</p>
            </div>

            <div className="card p-5">
              <SignInPanel />
            </div>

            <div className="my-5 flex items-center gap-3" aria-hidden="true">
              <span className="h-px flex-1 bg-[var(--line)]" />
              <span className="eyebrow">{t("auth.or")}</span>
              <span className="h-px flex-1 bg-[var(--line)]" />
            </div>

            <button type="button" onClick={continueAsGuest} className="btn btn-outline btn-lg w-full">
              <UserIcon />
              {t("auth.continueAsGuest")}
              <ArrowRightIcon className="ms-auto rtl:rotate-180" />
            </button>
            <p className="mt-2.5 text-center text-[13px] leading-relaxed text-[var(--text-faint)]">{t("auth.guestNote")}</p>

            <p className="mt-8 text-center text-[12.5px] text-[var(--text-faint)]">
              <Link href="/legal/terms" className="underline-offset-4 hover:text-[var(--text-dim)] hover:underline">
                {t("settings.legalTerms")}
              </Link>
              <span aria-hidden="true"> · </span>
              <Link href="/legal/privacy" className="underline-offset-4 hover:text-[var(--text-dim)] hover:underline">
                {t("settings.legalPrivacy")}
              </Link>
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
