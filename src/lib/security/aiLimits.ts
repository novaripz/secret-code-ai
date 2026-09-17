// What /api/ai costs, and who is allowed to spend it.
//
// These live here rather than in the route file for one practical reason: a
// Next route module may only export its handlers and segment config, so a
// constant declared there cannot be imported by anything — including the checks
// in scripts/checks/rate-limit.test.ts, which exist precisely to hold these
// numbers to a real classroom. Numbers nobody can assert on are numbers that
// drift back to being wrong.

import type { RateLimitRule } from "./rateLimit";

// This route is the expensive one: every call spends real quota on one of four
// AI providers, and until now anyone who found the URL could spend all of it.
// The limiter exists for that caller and for no one else. It is not there to
// pace a conversation, and the numbers below were wrong about that.
//
// What went wrong: the guest rule was six a minute — one message every ten
// seconds — and Panda deliberately offers "continue as guest", so in a
// classroom most people ARE guests. A student asking five quick questions, or a
// teacher demoing the tool, spent the minute in under a minute and then got
// "You're sending messages faster than Panda can answer" twice in a row, with
// no way to continue. That is the limiter refusing the exact person it was
// built to protect.
//
// The numbers now, and why each one:
//
//   burst — what may be sent back to back. Twelve for a guest, twenty for a
//   signed-in student. Nobody types twelve real questions in a row; this is
//   sized so that the fastest honest user anyone has watched is still nowhere
//   near it, including a teacher clicking through a demo and the retry after a
//   flaky network.
//
//   limit — the sustained rate the burst refills at, per minute. Thirty for a
//   guest is one every two seconds, sustained, forever; sixty for a signed-in
//   student is one a second. Both are far above human typing and far below what
//   a loop wants, which is the only line that matters here. A signed-in person
//   gets the higher one because they have an account that can be dealt with,
//   while a guest is anonymous and unrevocable.
//
// A script gets its burst and is then pinned to the refill rate for as long as
// it runs, which is the wall. A human never reaches the burst at all.
export const AI_USER_RULE: RateLimitRule = { limit: 60, windowMs: 60_000, burst: 20 };
export const AI_GUEST_RULE: RateLimitRule = { limit: 30, windowMs: 60_000, burst: 12 };

// The whole-address ceiling, which exists because a school is one public
// address: an address is not a person, and counting guests by address alone
// makes a class of thirty look like one very busy caller.
//
// Sized from the class, not from a multiplier. Thirty students each holding a
// burst of twelve is 360 requests that could in principle land at once, so the
// burst here is 360 — the moment the teacher says "ask Panda" and the room
// obeys must not produce a single 429. The sustained 900 a minute is thirty
// students at the individual guest rate of thirty; a class cannot exceed its
// own members' limits, so this ceiling never fires for legitimate use, which is
// the whole requirement.
//
// It still bounds the abuse it was added for. Someone rotating device ids to
// dodge the per-device bucket walks into this one and is capped at fifteen a
// second — a hard bound on quota burn, and no worse than the thirty real
// students the address is allowed to contain anyway. Making it tighter than the
// class it must hold would just be the original bug at a larger scale.
export const AI_GUEST_ADDRESS_CEILING: RateLimitRule = { limit: 900, windowMs: 60_000, burst: 360 };

// Shown when a counter really does run out, which for a person should now mean
// a genuine flood on the shared school connection and nothing else. The old
// wording blamed the student for typing too fast and told them to "try again in
// a few seconds" without saying whether their message had survived; both were
// wrong, and the second is the part that made people give up. This says what
// happened, that nothing was lost, and what to do. The exact number of seconds
// is in the response's `retryAfter` and the Retry-After header.
export const AI_BUSY_MESSAGE =
  "Panda has hit the limit on how many answers it can start at once on this network. " +
  "Nothing you wrote is lost — wait a few seconds and send it again.";
