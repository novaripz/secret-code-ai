import type { Metadata } from "next";
import Link from "next/link";
import { COMPANY_NAME, lastUpdatedLabel } from "./contact-details";

// The landing page for /legal.
//
// It exists because "send me your terms and privacy policy" is one email, and
// the answer should be one link. It is not a fourth document: three cards, the
// one sentence each of them is really about, and the date. Anyone who wants
// more is one click away, and nobody has to guess which page holds the part
// about teachers.

export const metadata: Metadata = {
  title: "Legal — Panda by Prismly",
  description: "Terms of Service, Privacy Policy and how to contact Prismly about Panda.",
};

const PAGES = [
  {
    href: "/legal/terms",
    title: "Terms of Service",
    blurb: "The rules for using Panda: what it is, what it is not, and what we are responsible for.",
  },
  {
    href: "/legal/privacy",
    title: "Privacy Policy",
    blurb:
      "What we store, what a teacher can see, where your messages go, and how to delete your data.",
  },
  {
    href: "/legal/contact",
    title: "Contact",
    blurb: `How to reach ${COMPANY_NAME} — about privacy, a district agreement, a bug, or a deletion request.`,
  },
] as const;

export default function LegalIndexPage() {
  return (
    <div className="min-h-dvh bg-[var(--bg)] text-[var(--text)]">
      <main className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <p className="text-sm font-medium uppercase tracking-wider text-[var(--text-faint)]">
          {COMPANY_NAME}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Legal</h1>
        <p className="mt-4 max-w-[65ch] text-lg leading-relaxed text-[var(--text-dim)]">
          Panda is a study tool for high-school students, made by {COMPANY_NAME}. These pages say
          what it does with your work in plain words — short enough that a student will actually read
          them, specific enough that a district can review them.
        </p>

        <ul className="mt-10 space-y-3">
          {PAGES.map((page) => (
            <li key={page.href}>
              <Link
                href={page.href}
                className="block rounded-2xl border border-[var(--line)] p-5 transition-colors hover:bg-[var(--surface-2)]"
              >
                <p className="font-semibold text-[var(--text)]">{page.title}</p>
                <p className="mt-1.5 max-w-[65ch] text-sm leading-relaxed text-[var(--text-dim)]">
                  {page.blurb}
                </p>
              </Link>
            </li>
          ))}
        </ul>

        <p className="mt-10 text-sm text-[var(--text-faint)]">
          Last updated {lastUpdatedLabel()}. Not legal advice — a school should have its own counsel
          review these before adopting Panda.
        </p>
        <p className="mt-6">
          <Link
            href="/"
            className="rounded text-sm font-medium text-[var(--text-dim)] underline underline-offset-4 hover:text-[var(--text)]"
          >
            Back to Panda
          </Link>
        </p>
      </main>
    </div>
  );
}
