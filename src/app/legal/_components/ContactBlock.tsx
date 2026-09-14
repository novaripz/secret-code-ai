import { COMPANY_NAME, FOUNDER_NAME, contactEmail, contactEmailIsSet } from "../contact-details";

// How to reach Prismly, rendered honestly in both states.
//
// The interesting half is the `else`. When no address has been configured this
// does not quietly render nothing, and it does not render a plausible-looking
// address that bounces. It says, on the page, that the inbox is not set up yet
// and names the file to fix — because the only people who will see this state
// are the team, and the one thing that must not happen is shipping it unnoticed
// to a district. A visible embarrassment is cheaper than a silent one.

export function ContactBlock({ compact = false }: { compact?: boolean }) {
  const ready = contactEmailIsSet();
  const address = contactEmail();

  return (
    <div
      className="max-w-[65ch] rounded-2xl border border-[var(--line)] p-5"
      style={ready ? undefined : { borderColor: "var(--warn)" }}
    >
      <p className="font-semibold text-[var(--text)]">{COMPANY_NAME}</p>
      <p className="mt-1 text-sm text-[var(--text-dim)]">
        Panda is built and run by {COMPANY_NAME}. {FOUNDER_NAME} is the founder and the person
        accountable for how student data is handled.
      </p>

      {ready ? (
        <p className="mt-4 text-sm text-[var(--text-dim)]">
          Email{" "}
          <a
            href={`mailto:${address}`}
            className="rounded font-medium text-[var(--text)] underline underline-offset-4"
          >
            {address}
          </a>
          . We read everything sent there.
        </p>
      ) : (
        <div className="mt-4 rounded-xl border border-[var(--warn)] p-3.5">
          <p className="text-sm font-semibold" style={{ color: "var(--warn)" }}>
            No contact address is configured yet.
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-dim)]">
            We would rather say this than print an inbox nobody is reading. Until an address is
            published here, reach {COMPANY_NAME} through whoever gave your school Panda.
          </p>
          <p className="mt-2 text-xs text-[var(--text-faint)]">
            To fix: set <code className="font-[family-name:var(--font-geist-mono)]">CONTACT_EMAIL</code> in the hosting environment{" "}
            in <code className="font-[family-name:var(--font-geist-mono)]">src/app/legal/contact-details.ts</code>.
          </p>
        </div>
      )}

      {!compact && (
        <p className="mt-4 text-sm leading-relaxed text-[var(--text-faint)]">
          Schools and districts: a written data protection agreement is available on request. We do
          not have one in force with you unless you have signed one with us.
        </p>
      )}
    </div>
  );
}
