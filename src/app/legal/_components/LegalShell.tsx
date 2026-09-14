import Link from "next/link";
import { COMPANY_NAME, LEGAL_LAST_UPDATED, lastUpdatedLabel } from "../contact-details";

// The furniture every legal page shares.
//
// These pages have two readers who want opposite things. A student wants to
// skim one paragraph and get back to their homework. A district administrator
// wants to read all of it, in order, and then send a colleague a link to the
// third paragraph of section four. So: a real heading hierarchy, an id on every
// section, a contents list that is a plain list of links, and a measure of
// about 65 characters so the long version is actually readable.
//
// Deliberately outside AppShell. A district reviewer arrives at this URL from
// an email, often signed out, and should land on a document — not on a study
// app with a sidebar of someone else's chats. The root layout still applies the
// saved theme, so the page matches whatever Panda the student left.
//
// Every colour is a custom property. Five themes exist; a hardcoded hex here
// would be invisible in four of them.

export interface LegalSection {
  /** The URL fragment. Stable — these get pasted into emails. */
  id: string;
  title: string;
}

const DOCS = [
  { href: "/legal/terms", label: "Terms" },
  { href: "/legal/privacy", label: "Privacy" },
  { href: "/legal/contact", label: "Contact" },
] as const;

export function LegalShell({
  title,
  summary,
  sections,
  children,
}: {
  title: string;
  /** One sentence, in plain words, for the reader who stops after the top. */
  summary: string;
  sections: LegalSection[];
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-[var(--bg)] text-[var(--text)]">
      <a
        href="#legal-content"
        className="sr-only rounded-lg bg-[var(--surface-2)] px-4 py-2 text-sm focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10"
      >
        Skip to content
      </a>

      <header className="border-b border-[var(--line)]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 sm:px-6">
          <Link
            href="/"
            className="rounded font-[family-name:var(--font-wordmark)] text-lg font-bold tracking-tight text-[var(--text)]"
          >
            Panda
          </Link>
          <span className="text-sm text-[var(--text-faint)]">by {COMPANY_NAME}</span>
          <nav aria-label="Legal documents" className="ms-auto flex flex-wrap gap-1">
            {DOCS.map((doc) => (
              <Link
                key={doc.href}
                href={doc.href}
                className="rounded-full px-3 py-1.5 text-sm text-[var(--text-dim)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
              >
                {doc.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      {/* The contents column only appears where there is room for it beside the
          prose. Squeezed under the title on a phone it is just a wall of links
          between the reader and the first sentence. */}
      <div className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-10 sm:px-6 lg:flex-row lg:gap-12 lg:py-14">
        <main id="legal-content" className="min-w-0 flex-1">
          <p className="text-sm font-medium uppercase tracking-wider text-[var(--text-faint)]">
            {COMPANY_NAME}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-4 max-w-[65ch] text-lg leading-relaxed text-[var(--text-dim)]">{summary}</p>
          <p className="mt-4 text-sm text-[var(--text-faint)]">
            Last updated <time dateTime={LEGAL_LAST_UPDATED}>{lastUpdatedLabel()}</time>
          </p>

          <nav aria-label="On this page" className="mt-8 lg:hidden">
            <Contents sections={sections} />
          </nav>

          <div className="mt-10 space-y-10">{children}</div>

          <p className="mt-14 max-w-[65ch] border-t border-[var(--line)] pt-6 text-sm leading-relaxed text-[var(--text-faint)]">
            This page is written in plain language so students can read it. It is not legal advice.
            A school or district should have its own counsel review it, and any agreement with{" "}
            {COMPANY_NAME}, before adopting Panda.
          </p>
        </main>

        <nav
          aria-label="On this page"
          className="hidden w-56 shrink-0 lg:block"
        >
          <div className="sticky top-14">
            <Contents sections={sections} />
          </div>
        </nav>
      </div>
    </div>
  );
}

function Contents({ sections }: { sections: LegalSection[] }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] p-4">
      <p className="cursor-default select-none text-xs font-medium uppercase tracking-wider text-[var(--text-faint)]">
        On this page
      </p>
      <ol className="mt-3 space-y-1.5">
        {sections.map((section, i) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              className="block rounded text-sm leading-snug text-[var(--text-dim)] transition-colors hover:text-[var(--text)]"
            >
              <span className="text-[var(--text-faint)]">{i + 1}. </span>
              {section.title}
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * One numbered section, linkable.
 *
 * `scroll-mt` is not decoration: without it, jumping to #what-teachers-see puts
 * the heading under the top edge of the viewport and the reader lands
 * mid-sentence.
 */
export function Section({
  id,
  index,
  title,
  children,
}: {
  id: string;
  index: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-8">
      <h2
        id={`${id}-heading`}
        className="text-xl font-semibold tracking-tight text-[var(--text)] sm:text-2xl"
      >
        <span className="text-[var(--text-faint)]">{index}. </span>
        {title}
      </h2>
      <div className="mt-4 max-w-[65ch] space-y-4 leading-relaxed text-[var(--text-dim)]">
        {children}
      </div>
    </section>
  );
}

/** A sub-point inside a section, for the parts an administrator scans for. */
export function SubHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="pt-2 text-base font-semibold text-[var(--text)]">{children}</h3>;
}

/** A bulleted list with the spacing the prose above it uses. */
export function List({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc space-y-2 ps-5 marker:text-[var(--text-faint)]">{children}</ul>;
}

/**
 * The box for a sentence that changes someone's mind about adopting Panda —
 * what a teacher can see, what we do not claim. Bordered rather than filled
 * with a tinted background, because only two of the five themes have a tint
 * that stays legible under body text.
 */
export function Callout({
  tone = "neutral",
  title,
  children,
}: {
  tone?: "neutral" | "warn";
  title: string;
  children: React.ReactNode;
}) {
  const accent = tone === "warn" ? "var(--warn)" : "var(--text-dim)";
  return (
    <div
      className="max-w-[65ch] rounded-2xl border border-[var(--line)] p-4 ps-5"
      style={{ borderInlineStartWidth: "3px", borderInlineStartColor: accent }}
    >
      <p className="font-semibold text-[var(--text)]">{title}</p>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-[var(--text-dim)]">{children}</div>
    </div>
  );
}
