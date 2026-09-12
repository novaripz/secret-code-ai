// Who is asking, and may they ask again this minute.
//
// Panda deliberately lets people "continue as guest" — a student with no
// account, on a school laptop that may never let them make one, still gets the
// tool. That is a product decision, not an oversight, so this file cannot just
// demand a token. Instead it grades:
//
//   - a valid Supabase access token  -> you are a known person, higher limit
//   - no token at all                -> guest, tighter limit, keyed by IP
//   - a token that does not verify   -> rejected outright
//
// The last line is the one worth being deliberate about. Silently treating a
// bad token as a guest would mean an attacker could send garbage tokens and
// still get in; worse, a student whose session quietly expired would get the
// guest limit with no explanation. A 401 that says "sign in again" is both
// safer and kinder.
//
// The tighter guest limit is the point: an unauthenticated caller is the abuse
// path, because there is nothing to revoke and nothing to trace. A signed-in
// person has an account that can be dealt with.

import { NextResponse } from "next/server";
import { bearerToken, createServerClient } from "@/lib/supabase/server";
import { DEVICE_HEADER } from "./device";
import { checkRateLimit, clientIp, tokenKey, type RateLimitRule } from "./rateLimit";

export type Identity =
  | { kind: "user"; id: string }
  | { kind: "guest" };

export interface GuardOk {
  ok: true;
  identity: Identity;
}
export interface GuardFailure {
  ok: false;
  response: NextResponse;
}
export type GuardResult = GuardOk | GuardFailure;

export interface GuardOptions {
  /** Bucket namespace, so /api/ai and /api/watch never share a counter. */
  route: string;
  user: RateLimitRule;
  guest: RateLimitRule;
  /** Shown in the 429 body. Written for a student, not an operator. */
  busyMessage: string;
  /**
   * When false the route never looks at the Authorization header — used by
   * routes that are public by design and only need a per-IP limit.
   */
  authenticate?: boolean;
  /**
   * The whole-address ceiling for guests, which has to fit a classroom sharing
   * one school connection. Defaults to twelve times the per-guest rule, which
   * is roughly a class of thirty working at a normal pace.
   */
  guestCeiling?: RateLimitRule;
}

/**
 * Verifies the token if there is one, then counts the request.
 *
 * Order matters: identity is resolved first so a guest can never spend a
 * signed-in person's budget, and the token check happens before the counter so
 * a rejected token does not consume anyone's allowance.
 */
export async function guardRequest(
  request: Request,
  options: GuardOptions,
): Promise<GuardResult> {
  let identity: Identity = { kind: "guest" };
  let bucketKey: string;

  const token = options.authenticate === false ? null : bearerToken(request);

  if (token) {
    const supabase = createServerClient(token);
    if (!supabase) {
      // No Supabase on this deployment at all. A token here cannot be checked,
      // and accepting an unverifiable token would be worse than ignoring it,
      // so this caller is a guest as far as limits are concerned.
      bucketKey = `${options.route}:ip:${clientIp(request)}`;
    } else {
      let userId: string | null = null;
      try {
        const { data, error } = await supabase.auth.getUser();
        if (!error && data.user) userId = data.user.id;
      } catch {
        // Network trouble reaching Supabase. Treat as unverified rather than
        // trusting the token — failing closed is the whole point of checking.
        userId = null;
      }
      if (!userId) {
        return {
          ok: false,
          response: NextResponse.json(
            { error: "Your sign-in has expired. Sign in again, or keep going as a guest." },
            { status: 401 },
          ),
        };
      }
      identity = { kind: "user", id: userId };
      // Keyed by a fold of the token rather than the user id so no account
      // identifier is held in a long-lived in-process Map.
      bucketKey = `${options.route}:u:${tokenKey(token)}`;
    }
  } else {
    bucketKey = `${options.route}:ip:${clientIp(request)}`;
  }

  const rule = identity.kind === "user" ? options.user : options.guest;

  // Guests get counted twice, and the reason is a school's network.
  //
  // Every student in the building shares one public address, so an address is
  // not a person: counting guests by address alone means a class of thirty
  // trips a limit meant for one caller, and the fix of raising it far enough to
  // fit a class would hand that whole allowance to any single script.
  //
  // So each browser is counted on its own, and the address keeps a ceiling
  // underneath. An honest guest is bounded by the first, which fits one human.
  // Someone rotating device ids to escape it walks into the second, which fits
  // a classroom and not a flood. Neither number is a claim about identity —
  // the device id is client-supplied and forgeable, and nothing is authorised
  // by it.
  if (identity.kind === "guest") {
    const device = request.headers.get(DEVICE_HEADER)?.slice(0, 64);
    if (device) {
      const perDevice = checkRateLimit(`${options.route}:d:${clientIp(request)}:${device}`, rule);
      if (!perDevice.ok) return tooMany(options, perDevice);
    }

    const ceiling = options.guestCeiling ?? {
      limit: rule.limit * 12,
      windowMs: rule.windowMs,
    };
    const perAddress = checkRateLimit(`${options.route}:ipc:${clientIp(request)}`, ceiling);
    if (!perAddress.ok) return tooMany(options, perAddress);

    return { ok: true, identity };
  }

  const result = checkRateLimit(bucketKey, rule);
  if (!result.ok) return tooMany(options, result);

  return { ok: true, identity };
}

/** The same 429 whichever counter ran out, so a caller cannot tell them apart. */
function tooMany(
  options: GuardOptions,
  result: { retryAfterSeconds: number; limit: number },
): GuardResult {
  return {
    ok: false,
    response: NextResponse.json(
      { error: options.busyMessage, retryAfter: result.retryAfterSeconds },
      {
        status: 429,
        headers: {
          "Retry-After": String(result.retryAfterSeconds),
          "RateLimit-Limit": String(result.limit),
          "RateLimit-Remaining": "0",
          "RateLimit-Reset": String(result.retryAfterSeconds),
          "Cache-Control": "no-store",
        },
      },
    ),
  };
}
