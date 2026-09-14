// Who Prismly is, in one place, because it is quoted in three documents.
//
// The email is a PLACEHOLDER and is deliberately not a valid address. A legal
// page that prints an inbox nobody reads is worse than one that admits the
// inbox does not exist yet: a parent writes, hears nothing, and concludes the
// company is ignoring them. So the constant is named for what it is, its value
// is unmistakably a fill-in-the-blank, and `contactEmailIsSet()` is what the UI
// asks before it dares render a `mailto:` link.
//
// To go live: replace CONTACT_EMAIL with a real, monitored address. Nothing
// else needs touching — every surface reads this file.

/**
 * Where people write to Prismly, from the environment rather than the source.
 *
 * It lives in an environment variable because the person who has to set it is
 * running this from a phone, and editing a constant means a commit, a review
 * and a deploy; setting a variable is one field in a dashboard. It is read only
 * from server components — the client half of the legal screens needs the
 * company name and the date, never the address — so it does not have to be a
 * public build-time value to work.
 *
 * Unset is a supported state, not a bug: the pages say plainly that contact is
 * not configured instead of printing a dead address. A parent who writes to an
 * inbox nobody reads, hears nothing back, and concludes the company is ignoring
 * them is worse off than one who was told up front where it stands.
 */
export function contactEmail(): string {
  return (process.env.CONTACT_EMAIL ?? "").trim();
}

/**
 * True once a real address is set.
 *
 * The test is "looks like an address", not "differs from some placeholder", so
 * a half-finished value ("prismly.com", "TBD") still reads as unset rather than
 * rendering a mailto that goes nowhere.
 */
export function contactEmailIsSet(): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail());
}

export const COMPANY_NAME = "Prismly";

/** The person accountable for it. Named because a district asks who to call. */
export const FOUNDER_NAME = "Santiago Lopez";

/**
 * The date these documents last changed, as an ISO day.
 *
 * Hand-maintained on purpose. A "last updated" that follows the build clock is
 * a lie with a timestamp on it — it would claim the terms changed every deploy.
 * Bump this only when the wording below actually changes.
 */
export const LEGAL_LAST_UPDATED = "2026-09-14";

/** The same date, spelled out, for reading. */
export function lastUpdatedLabel(): string {
  return new Date(`${LEGAL_LAST_UPDATED}T00:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
