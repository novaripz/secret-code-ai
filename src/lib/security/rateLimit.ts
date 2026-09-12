// Rate limiting, hand-rolled and in-memory.
//
// The honest description first: this is a fixed-window counter held in a Map
// inside one server process. On a serverless deployment every instance keeps
// its own Map, so the effective limit is roughly `limit x instances` and it
// resets whenever an instance is recycled. It is therefore approximate, and it
// is a speed bump, not a wall. The real fix, when traffic justifies paying for
// it, is a shared store — Upstash/Redis, or a Postgres table with an atomic
// upsert — so every instance counts against the same number. Until then this
// still does the thing that actually matters: it stops one person with a curl
// loop from draining four AI provider quotas in the middle of a lesson, which
// is the failure that costs a classroom its tool.
//
// Nothing here is logged. Keys are hashed-by-truncation only for readability;
// no token, IP or message content is written anywhere.

export interface RateLimitRule {
  /** Requests allowed inside one window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the current window rolls over. Always >= 1 so Retry-After is useful. */
  retryAfterSeconds: number;
}

interface Bucket {
  count: number;
  /** Epoch ms at which this window ends and the count resets. */
  resetAt: number;
}

// Bounded on purpose. An attacker can mint unlimited distinct keys (a new IP
// per request behind a botnet, a new token per request), and an unbounded Map
// would be a memory leak dressed up as a defence. When the map is full we
// sweep expired entries first; if that frees nothing, we drop the oldest
// entries. Dropping a bucket is fail-open for that key for one window, which
// is the right trade: a memory exhaustion crash takes the app down for
// everyone, a forgotten counter costs a handful of extra requests.
const MAX_BUCKETS = 10_000;

const buckets = new Map<string, Bucket>();

function sweep(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

function makeRoom(now: number): void {
  if (buckets.size < MAX_BUCKETS) return;
  sweep(now);
  if (buckets.size < MAX_BUCKETS) return;
  // Map iteration is insertion-ordered, so this evicts the least recently
  // created buckets first.
  const excess = buckets.size - MAX_BUCKETS + 1;
  let dropped = 0;
  for (const key of buckets.keys()) {
    buckets.delete(key);
    if (++dropped >= excess) break;
  }
}

/**
 * Counts one request against `key` and says whether it may proceed.
 * Call this once per request, after you have decided the caller's identity —
 * counting before identity is known would let a guest spend a user's budget.
 */
export function checkRateLimit(key: string, rule: RateLimitRule): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    makeRoom(now);
    buckets.set(key, { count: 1, resetAt: now + rule.windowMs });
    return {
      ok: true,
      limit: rule.limit,
      remaining: rule.limit - 1,
      retryAfterSeconds: Math.ceil(rule.windowMs / 1000),
    };
  }

  existing.count += 1;
  const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
  return {
    ok: existing.count <= rule.limit,
    limit: rule.limit,
    remaining: Math.max(0, rule.limit - existing.count),
    retryAfterSeconds,
  };
}

/**
 * The caller's IP as far as it can be trusted.
 *
 * `x-forwarded-for` is a list the client can prepend to: a request arriving
 * with `x-forwarded-for: 1.2.3.4` gets Vercel's proxy appended to it, giving
 * `1.2.3.4, <real client ip>`. So the *first* entry is attacker-controlled and
 * useless, and the last entry the edge wrote is the one to trust. Vercel puts
 * the connecting address at the end of the list (and also in
 * `x-real-ip`/`x-vercel-forwarded-for`), so we read the last hop, not the
 * first. Behind a different proxy this may need adjusting — there is no way to
 * get this right without knowing how many hops are in front of you.
 */
export function clientIp(request: Request): string {
  const vercel = request.headers.get("x-vercel-forwarded-for")?.trim();
  if (vercel) {
    const parts = vercel.split(",");
    const last = parts[parts.length - 1]?.trim();
    if (last) return last;
  }

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",").map((p) => p.trim()).filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return last;
  }

  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;

  // No proxy headers at all — local dev, or a direct connection. One shared
  // bucket is fine here; it only ever affects a single-machine setup.
  return "unknown";
}

/**
 * A stable, non-reversible-enough bucket key for a bearer token. We never want
 * a raw access token sitting in a long-lived Map, so this folds it to a short
 * hash. Collisions merely merge two people's budgets, which is harmless at
 * this scale, and the token itself is not recoverable from the key.
 */
export function tokenKey(token: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < token.length; i++) {
    const c = token.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 + c, 0x85ebca6b) ^ (h2 >>> 13);
  }
  return ((h1 >>> 0).toString(36) + (h2 >>> 0).toString(36));
}

/** Only exported for tests and for a dev-time reset; not used in request paths. */
export function _resetRateLimits(): void {
  buckets.clear();
}
