// The limiter, held to the classroom it runs in.
//
// This file exists because of a real incident: a student chatting normally --
// four or five short messages over a minute or two -- was refused twice in a
// row with "You're sending messages faster than Panda can answer", and could
// not continue. The guest rule was six a minute, one message every ten seconds,
// and Panda deliberately offers "continue as guest", so in a classroom that was
// most people. The limiter was refusing the person it was built to protect.
//
// So the checks below are written from both ends at once, because either one
// alone is easy to satisfy and useless: a conversation must never be limited,
// AND a loop must be. Every assertion here is one of those two sentences.
//
// Run with `npm run check`.

import { guardRequest } from "../../src/lib/security/apiGuard";
import { DEVICE_HEADER } from "../../src/lib/security/deviceHeader";
import {
  AI_BUSY_MESSAGE,
  AI_GUEST_ADDRESS_CEILING,
  AI_GUEST_RULE,
  AI_USER_RULE,
} from "../../src/lib/security/aiLimits";
import { checkRateLimit, _resetRateLimits, type RateLimitRule } from "../../src/lib/security/rateLimit";

let failures = 0;
function ok(name: string, condition: boolean, detail = ""): void {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures++;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** How many of `n` back-to-back requests against one key are allowed through. */
function spend(key: string, rule: RateLimitRule, n: number): number {
  let allowed = 0;
  for (let i = 0; i < n; i++) if (checkRateLimit(key, rule).ok) allowed++;
  return allowed;
}

// ---------------------------------------------------------------------------
// A conversation is not a flood

console.log("\nhonest use is never limited");

_resetRateLimits();

// The reported case, exactly: five short messages inside a minute or two. Sent
// here with no gap at all, which is stricter than what happened.
ok("five quick messages from a guest all go through",
   spend("conv:a", AI_GUEST_RULE, 5) === 5);

_resetRateLimits();
// A teacher demoing the tool clicks through far faster than a student types.
ok("a twelve-message demo burst from a guest goes through",
   spend("conv:b", AI_GUEST_RULE, 12) === 12, `burst ${AI_GUEST_RULE.burst}`);

_resetRateLimits();
// A full lesson's worth of conversation at a pace no human sustains: a message
// every two seconds for a minute, which the refill rate has to cover on its own
// once the burst is gone.
ok("a guest's sustained rate is at least one message every two seconds",
   AI_GUEST_RULE.limit >= 30, `${AI_GUEST_RULE.limit}/min`);
ok("and a signed-in student's is at least one a second",
   AI_USER_RULE.limit >= 60, `${AI_USER_RULE.limit}/min`);

// Top-level await would make this file ESM, which under this package's
// CommonJS resolution loads rateLimit.ts a second time and gives the checks a
// different Map from the one apiGuard counts in. A plain async function keeps
// one copy of each module, which is what the app has.
async function timedChecks(): Promise<void> {
  // The old shape's unfairness was a clock boundary: a burst that straddled
  // 10:00:59 spent two windows and the student was stranded. A bucket refills
  // continuously instead, so waiting a fraction of a window buys a fraction of
  // the allowance rather than nothing at all.
  _resetRateLimits();
  const edge = { limit: 10, windowMs: 1_000, burst: 10 };
  spend("edge", edge, 10);
  ok("an exhausted bucket refuses immediately", !checkRateLimit("edge", edge).ok);
  await sleep(350);
  const afterPause = spend("edge", edge, 10);
  ok("and a short pause buys back a proportional amount, not nothing and not everything",
     afterPause >= 1 && afterPause <= 6, `${afterPause} allowed after 350ms`);

  // Being refused must not push the wait further out, or a student tapping send
  // again would lock themselves out for longer every time.
  _resetRateLimits();
  spend("nocompound", edge, 10);
  const first = checkRateLimit("nocompound", edge).retryAfterSeconds;
  for (let i = 0; i < 50; i++) checkRateLimit("nocompound", edge);
  const later = checkRateLimit("nocompound", edge).retryAfterSeconds;
  ok("hammering a refusal does not lengthen the wait", later <= first, `${first}s then ${later}s`);

  // ---------------------------------------------------------------------------
  // A loop is

  console.log("\na runaway loop still hits a wall");

  _resetRateLimits();
  const loop = spend("loop", AI_GUEST_RULE, 500);
  ok("a 500-request loop is cut off", loop < 500 && loop <= (AI_GUEST_RULE.burst ?? AI_GUEST_RULE.limit) + 2,
     `${loop} of 500 allowed`);
  ok("a signed-in loop is cut off too",
     spend("loop:user", AI_USER_RULE, 500) <= (AI_USER_RULE.burst ?? AI_USER_RULE.limit) + 2);

  // The point of the whole file: the loop's ongoing cost is the refill rate, and
  // that rate is a bound on provider spend per minute rather than "as fast as the
  // network allows".
  ok("the sustained rate is a real bound, not effectively unlimited",
     AI_GUEST_RULE.limit <= 60 && AI_USER_RULE.limit <= 120);

  // ---------------------------------------------------------------------------
  // Signed in is worth more than anonymous

  console.log("\na signed-in student gets the larger allowance");

  ok("a user may burst further than a guest",
     (AI_USER_RULE.burst ?? AI_USER_RULE.limit) > (AI_GUEST_RULE.burst ?? AI_GUEST_RULE.limit));
  ok("and sustains a higher rate", AI_USER_RULE.limit > AI_GUEST_RULE.limit);

  _resetRateLimits();
  const atUserBurst = AI_USER_RULE.burst ?? AI_USER_RULE.limit;
  ok("a burst that fills a user's allowance is allowed in full",
     spend("who:user", AI_USER_RULE, atUserBurst) === atUserBurst);
  _resetRateLimits();
  ok("the same burst on the guest rule is not",
     spend("who:guest", AI_GUEST_RULE, atUserBurst) < atUserBurst);

  // ---------------------------------------------------------------------------
  // One school, one address, thirty students

  console.log("\na shared address does not lock out a class");

  // Everything below goes through guardRequest itself rather than the counter, so
  // the per-device bucket and the per-address ceiling are checked as they are
  // actually wired, not as they are remembered.
  const SCHOOL_IP = "203.0.113.7";

  function guestRequest(device: string, ip = SCHOOL_IP): Request {
    return new Request("https://panda.test/api/ai", {
      method: "POST",
      headers: { "x-real-ip": ip, [DEVICE_HEADER]: device },
    });
  }

  const AI_GUARD = {
    route: "ai",
    user: AI_USER_RULE,
    guest: AI_GUEST_RULE,
    guestCeiling: AI_GUEST_ADDRESS_CEILING,
    busyMessage: AI_BUSY_MESSAGE,
  };

  _resetRateLimits();

  // Thirty students on one school connection, each asking ten questions, all in
  // the same moment -- the "everyone open Panda now" case a teacher creates on
  // purpose. Not one of them may be refused.
  let refused = 0;
  for (let student = 0; student < 30; student++) {
    for (let message = 0; message < 10; message++) {
      const guard = await guardRequest(guestRequest(`device-${student}`), AI_GUARD);
      if (!guard.ok) refused++;
    }
  }
  ok("thirty guests x ten messages from one address: nobody is refused", refused === 0, `${refused} refused`);

  // The ceiling has to be able to hold the class by arithmetic, not by luck.
  ok("the address ceiling holds a class of thirty at full individual burst",
     (AI_GUEST_ADDRESS_CEILING.burst ?? AI_GUEST_ADDRESS_CEILING.limit)
       >= 30 * (AI_GUEST_RULE.burst ?? AI_GUEST_RULE.limit));
  ok("and at their full individual sustained rate",
     AI_GUEST_ADDRESS_CEILING.limit >= 30 * AI_GUEST_RULE.limit);

  // One browser looping is stopped by its own bucket long before it can spend the
  // class's ceiling -- that is why the per-device bucket exists at all.
  _resetRateLimits();
  let deviceRefusal: Response | null = null;
  for (let i = 0; i < 200; i++) {
    const guard = await guardRequest(guestRequest("one-noisy-device"), AI_GUARD);
    if (!guard.ok) { deviceRefusal = guard.response; break; }
  }
  ok("one looping browser is stopped", deviceRefusal !== null);

  // Rotating the device id escapes the per-device bucket, which is the point of
  // the ceiling underneath it.
  _resetRateLimits();
  let ceilingRefusal: Response | null = null;
  for (let i = 0; i < 2_000; i++) {
    const guard = await guardRequest(guestRequest(`rotating-${i}`), AI_GUARD);
    if (!guard.ok) { ceilingRefusal = guard.response; break; }
  }
  ok("and so is a caller rotating device ids", ceilingRefusal !== null);

  // Another school is another address and must be untouched by the first one's
  // flood -- the ceiling is per address precisely so it cannot become global.
  const other = await guardRequest(guestRequest("device-0", "198.51.100.4"), AI_GUARD);
  ok("a different address is unaffected by it", other.ok);

  // ---------------------------------------------------------------------------
  // What a refusal says, and does not say

  console.log("\nthe 429 tells a caller nothing it should not");

  if (deviceRefusal && ceilingRefusal) {
    ok("both counters return 429", deviceRefusal.status === 429 && ceilingRefusal.status === 429);
    const a = await deviceRefusal.json();
    const b = await ceilingRefusal.json();
    // A caller that could tell the two apart would know which limit to dodge.
    ok("and the same body, so the two are indistinguishable", a.error === b.error);
    ok("with a wait a client can act on", typeof a.retryAfter === "number" && a.retryAfter >= 1);
    ok("and a Retry-After header to match",
       deviceRefusal.headers.get("Retry-After") === String(a.retryAfter));
    ok("nothing is cached", deviceRefusal.headers.get("Cache-Control") === "no-store");
    const body = JSON.stringify(a);
    ok("no IP address is echoed back", !body.includes(SCHOOL_IP));
    ok("no device id is echoed back", !body.includes("rotating-") && !body.includes("one-noisy-device"));
  }

  // The wording is part of the fix. The old sentence blamed the student for
  // typing too fast and never said whether their message survived, which is the
  // part that made people give up rather than wait.
  ok("the message does not blame the person for typing", !/faster than/i.test(AI_BUSY_MESSAGE));
  ok("it says nothing was lost", /nothing you wrote is lost/i.test(AI_BUSY_MESSAGE));
  ok("and it says what to do", /send it again/i.test(AI_BUSY_MESSAGE));
}

void timedChecks().then(() => {
  console.log(failures === 0 ? "\nall good\n" : `\n${failures} failed\n`);
process.exit(failures === 0 ? 0 : 1);
});
