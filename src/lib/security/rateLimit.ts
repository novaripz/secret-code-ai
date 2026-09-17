// Rate limiting, hand-rolled and in-memory.
//
// The honest description first: this is a token bucket held in a Map inside one
// server process. On a serverless deployment every instance keeps its own Map,
// so the effective limit is roughly `limit x instances` and it resets whenever
// an instance is recycled. It is therefore approximate, and it is a speed bump,
// not a wall. The real fix, when traffic justifies paying for it, is a shared
// store — Upstash/Redis, or a Postgres table with an atomic upsert — so every
// instance counts against the same number. Until then this still does the thing
// that actually matters: it stops one person with a curl loop from draining
// four AI provider quotas in the middle of a lesson, which is the failure that
// costs a classroom its tool.
//
// Why a token bucket and not the fixed window this used to be. A fixed window
// is one counter that resets on the clock, and it is wrong at both ends. A
// student who asked five quick questions at 10:00:55 had spent the 10:00 window
// and was refused until 10:01:00, even though they had been chatting for one
// minute in total; that is the bug this file was rewritten for, reported as
// two messages in a row bouncing off "sending messages faster than Panda can
// answer". At the other end the same shape lets a script spend a full window at
// 10:00:59 and another at 10:01:00, i.e. twice the limit back to back, which is
// exactly the caller the limit is for. A bucket that drains on use and refills
// continuously has neither edge: conversation, which is bursty and then quiet,
// is paid for out of the burst and the refill covers the pauses, while a loop
// that never pauses is pinned to the sustained rate for as long as it runs.
//
// So a rule now says two things: `limit` per `windowMs` is the sustained rate
// the bucket refills at, and `burst` is how much may be spent at once. Rules
// that leave `burst` out behave like the old shape, with the whole allowance
// available immediately.
//
// Rejected: a sliding log (an array of timestamps per key). It is exact, and it
// lets any caller make us allocate one array entry per request, which is the
// memory-exhaustion path this file already goes out of its way to avoid. A
// bucket is two numbers whatever the traffic.
//
// Nothing here is logged. Keys are hashed-by-truncation only for readability;
// no token, IP or message content is written anywhere.

export interface RateLimitRule {
  /** Sustained requests per `windowMs`, which is also the refill rate. */
  limit: number;
  /** The period `limit` is expressed over, in milliseconds. */
  windowMs: number;
  /**
   * How many requests may be spent back to back before the refill rate is what
   * you are living on. Defaults to `limit`, which is the old fixed-window
   * behaviour: everything available at once.
   *
   * This is the number that decides whether honest conversation is ever
   * refused, because humans do not arrive at a steady rate — they ask three
   * questions in twenty seconds and then read for a minute.
   */
  burst?: number;
}

export interface RateLimitResult {
  ok: boolean;
  /** The burst capacity, i.e. the most this key can spend at one moment. */
  limit: number;
  /** Whole requests still available right now. */
  remaining: number;
  /**
   * Seconds until this key may send again — for a refusal, how long until one
   * token has refilled, not until some clock boundary. Always >= 1 so
   * Retry-After is useful, and it is a real number a student can wait out
   * rather than an approximation of one.
   */
  retryAfterSeconds: number;
}

interface Bucket {
  /** Tokens remaining, fractional between refills. */
  tokens: number;
  /** Epoch ms `tokens` was last brought up to date. */
  updatedAt: number;
  /** Copied from the rule so a sweep can tell when this bucket is idle again. */
  capacity: number;
  /** Tokens per millisecond. */
  refillPerMs: number;
}

// Bounded on purpose. An attacker can mint unlimited distinct keys (a new IP
// per request behind a botnet, a new token per request), and an unbounded Map
// would be a memory leak dressed up as a defence. When the map is full we
// sweep expired entries first; if that frees nothing, we drop the oldest
// entries. Dropping a bucket is fail-open for that key — it starts again with a
// full burst — which
// is the right trade: a memory exhaustion crash takes the app down for
// everyone, a forgotten counter costs a handful of extra requests.
const MAX_BUCKETS = 10_000;

const buckets = new Map<string, Bucket>();

/**
 * Drops buckets that have refilled to full. A full bucket is indistinguishable
 * from one that never existed, so forgetting it costs nothing and is what keeps
 * the map from growing with every key that ever appeared.
 */
function sweep(now: number): void {
  for (const [key, bucket] of buckets) {
    const tokens = bucket.tokens + (now - bucket.updatedAt) * bucket.refillPerMs;
    if (tokens >= bucket.capacity) buckets.delete(key);
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
 * Spends one token against `key` and says whether the request may proceed.
 * Call this once per request, after you have decided the caller's identity —
 * counting before identity is known would let a guest spend a user's budget.
 */
export function checkRateLimit(key: string, rule: RateLimitRule): RateLimitResult {
  const now = Date.now();
  const capacity = Math.max(1, rule.burst ?? rule.limit);
  const refillPerMs = rule.limit / rule.windowMs;

  let bucket = buckets.get(key);
  if (!bucket) {
    makeRoom(now);
    bucket = { tokens: capacity, updatedAt: now, capacity, refillPerMs };
    buckets.set(key, bucket);
  } else {
    // Refill for the time that passed, then clamp: idle time banks up to one
    // burst and no more, so going away for an hour does not buy an hour of
    // requests to spend in one second.
    bucket.tokens = Math.min(capacity, bucket.tokens + (now - bucket.updatedAt) * refillPerMs);
    bucket.updatedAt = now;
    // A rule can change under a live bucket when a deployment ships new
    // numbers; take the new shape rather than keeping the old one forever.
    bucket.capacity = capacity;
    bucket.refillPerMs = refillPerMs;
  }

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return {
      ok: true,
      limit: capacity,
      remaining: Math.floor(bucket.tokens),
      // Nothing to wait for, but the field is not optional; one token is always
      // at most this far away.
      retryAfterSeconds: Math.max(1, Math.ceil(1 / refillPerMs / 1000)),
    };
  }

  // Refused. The token is deliberately NOT taken, so a caller that keeps
  // hammering does not push its own wait further out with every rejected
  // request — being refused should not be a punishment that compounds.
  return {
    ok: false,
    limit: capacity,
    remaining: 0,
    retryAfterSeconds: Math.max(1, Math.ceil((1 - bucket.tokens) / refillPerMs / 1000)),
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
