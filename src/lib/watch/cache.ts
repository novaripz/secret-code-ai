// The two things that stand between a classroom and YouTube's daily quota.
//
// A search costs 100 units of a default 10,000 a day, so a whole school gets
// roughly a hundred fresh searches between midnights. Two mechanisms stretch
// that: a cache that remembers answers (and remembers them in a shared
// spelling, see normaliseQuery), and a budget that stops spending before
// YouTube stops answering, so the last hour of the school day still gets
// results out of the cache instead of a wall of errors.
//
// Both live in the server process and die with it. That is fine: they exist to
// stop thirty students opening the tab at once from spending thirty searches on
// the same three queries, not to be a database.

/**
 * A size-capped map with per-entry expiry, evicting the least recently used.
 *
 * Expired entries are kept (until evicted) rather than deleted on read, because
 * when the budget runs low a stale answer is far better than none — `stale()`
 * hands them out in exactly that case.
 */
export class LruCache<T> {
  private readonly entries = new Map<string, { value: T; expires: number }>();

  constructor(
    private readonly max: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** A fresh value, or undefined. Reading marks it recently used. */
  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expires <= this.now()) return undefined;
    // Map keeps insertion order, so delete-and-set moves it to the young end.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  /** Whatever is stored, fresh or not. Only for cache-only fallbacks. */
  stale(key: string): T | undefined {
    return this.entries.get(key)?.value;
  }

  has(key: string): boolean {
    const entry = this.entries.get(key);
    return Boolean(entry && entry.expires > this.now());
  }

  set(key: string, value: T, ttlMs: number): void {
    this.entries.delete(key);
    this.entries.set(key, { value, expires: this.now() + ttlMs });
    while (this.entries.size > this.max) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  get size(): number {
    return this.entries.size;
  }
}

/**
 * Shares one promise between everyone asking the same question at once.
 *
 * A cache only helps the second request after the first has *finished*; when a
 * teacher says "open Watch" thirty requests for the same starter search arrive
 * inside the same second, all of them miss, and all of them would spend 100
 * units. Holding the promise rather than the result is what makes them one.
 */
export class InFlight {
  private readonly pending = new Map<string, Promise<unknown>>();

  run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const existing = this.pending.get(key);
    if (existing) return existing as Promise<T>;
    const promise = task().finally(() => {
      // Only clear our own entry; a later run under the same key may already
      // have replaced it.
      if (this.pending.get(key) === promise) this.pending.delete(key);
    });
    this.pending.set(key, promise);
    return promise;
  }

  has(key: string): boolean {
    return this.pending.has(key);
  }
}

/** The date in California, which is when YouTube's quota day rolls over. */
export function pacificDay(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ms);
}

/**
 * A running count of the units this process has spent today.
 *
 * It is an estimate — another server instance sharing the key spends from the
 * same pot without telling this one — so it is set below the real 10,000 and
 * YouTube's own "quota exceeded" answer still marks the day as spent.
 */
export class UnitBudget {
  private day = "";
  private used = 0;
  private exhausted = false;

  constructor(
    readonly limit: number,
    private readonly now: () => number = Date.now,
  ) {}

  private roll(): void {
    const today = pacificDay(this.now());
    if (today !== this.day) {
      this.day = today;
      this.used = 0;
      this.exhausted = false;
    }
  }

  /**
   * Whether `units` more may be spent without passing `ceiling`. Cheap lookups
   * pass a higher ceiling than searches, so a watch page can still fetch one
   * video's details (1 unit) after searches have switched to cache-only.
   */
  canSpend(units: number, ceiling = this.limit): boolean {
    this.roll();
    return !this.exhausted && this.used + units <= ceiling;
  }

  spend(units: number): void {
    this.roll();
    this.used += units;
  }

  /** YouTube said the quota is gone; believe it until the day rolls over. */
  exhaust(): void {
    this.roll();
    this.exhausted = true;
  }

  get spent(): number {
    this.roll();
    return this.used;
  }

  get isExhausted(): boolean {
    this.roll();
    return this.exhausted;
  }
}
