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
 * TODO(prismly): replace with the real, monitored contact address before this
 * ships to any school. Keep the shape `name@domain`; the pages check for the
 * literal placeholder below and switch to an honest "not set up yet" notice.
 */
export const CONTACT_EMAIL = "[[ PLACEHOLDER — SET PRISMLY CONTACT EMAIL ]]";

/** The company behind Panda. */
export const COMPANY_NAME = "Prismly";

/** The person accountable for it. Named because a district asks who to call. */
export const FOUNDER_NAME = "Santiago Lopez";

/**
 * True once a human has replaced the placeholder above.
 *
 * The test is "looks like an address", not "is not the placeholder", so a
 * half-finished edit ("prismly.com", "TBD") still reads as unset rather than
 * rendering a broken mailto.
 */
export function contactEmailIsSet(): boolean {
  return /^[^\s@[\]]+@[^\s@[\]]+\.[^\s@[\]]+$/.test(CONTACT_EMAIL);
}

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
