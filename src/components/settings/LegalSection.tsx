"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { ChevronRightIcon, FileTextIcon, HelpIcon, LockIcon, ShieldCheckIcon } from "@/components/icons";
import { COMPANY_NAME, lastUpdatedLabel } from "@/app/legal/contact-details";

// The Legal tab in Settings.
//
// Two jobs, and only two. Get a student to the documents in one tap, and tell
// them the one fact they would otherwise have to read nine sections to find:
// their teacher cannot see their messages. That sentence is the reason a
// sixteen-year-old will use this honestly instead of carefully, so it is stated
// here rather than left behind a link nobody opens.
//
// Everything else lives on /legal. A settings panel is a bad place to read two
// thousand words: it is narrow, it scrolls inside another scroller, and it
// cannot be linked to or sent to a parent. The links open the real pages, which
// have anchors, a contents list and a URL worth pasting into an email.

export function LegalSection() {
  const { t } = useI18n();

  const links = [
    { href: "/legal/terms", label: t("settings.legalTerms"), hint: t("settings.legalTermsHint"), icon: FileTextIcon },
    { href: "/legal/privacy", label: t("settings.legalPrivacy"), hint: t("settings.legalPrivacyHint"), icon: LockIcon },
    { href: "/legal/contact", label: t("settings.legalContact"), hint: t("settings.legalContactHint"), icon: HelpIcon },
  ];

  return (
    <div className="space-y-5">
      <p className="max-w-[65ch] cursor-default select-none text-[15px] leading-relaxed text-[var(--text-dim)]">
        {t("settings.legalIntro", { company: COMPANY_NAME })}
      </p>

      {/* The headline promise, above the links. A student who reads nothing
          else on this screen should leave knowing this. */}
      <div className="flex max-w-[65ch] items-start gap-3 rounded-[var(--radius-lg)] border border-[color-mix(in_srgb,var(--success)_30%,transparent)] bg-[var(--success-soft)] p-4">
        <ShieldCheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--success)]" />
        <div className="min-w-0">
          <p className="cursor-default select-none font-medium text-[var(--text)]">{t("settings.legalTeacherTitle")}</p>
          <p className="mt-1 cursor-default select-none text-sm leading-relaxed text-[var(--text-dim)]">
            {t("settings.legalTeacherBody")}
          </p>
        </div>
      </div>

      <nav aria-label={t("settings.legal")}>
        <ul className="grid gap-2.5">
          {links.map(({ icon: Icon, ...link }) => (
            <li key={link.href}>
              <Link href={link.href} className="card card-interactive flex items-center gap-3.5 px-4 py-3.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--surface-2)] text-[var(--text-dim)]">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-[var(--text)]">{link.label}</span>
                  <span className="mt-0.5 block text-sm leading-relaxed text-[var(--text-faint)]">{link.hint}</span>
                </span>
                <ChevronRightIcon className="h-4 w-4 shrink-0 text-[var(--text-faint)] rtl:rotate-180" />
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <p className="max-w-[65ch] cursor-default select-none border-t border-[var(--line)] pt-5 text-xs leading-relaxed text-[var(--text-faint)]">
        {t("settings.legalUpdated", { date: lastUpdatedLabel() })} {t("settings.legalNotAdvice")}
      </p>
    </div>
  );
}
