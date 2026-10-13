// Canvas LMS integration.
//
// Two rules shape this. Students never see a Canvas password or paste a raw
// API token — it goes through Canvas's own OAuth2, like every other real
// integration. And Canvas responses are normalised into Panda's own entities
// rather than being passed around raw, so one API change does not ripple
// through every screen.
//
// Setup is a developer key from a Canvas admin. Schools each run their own
// Canvas, so the base URL is per-connection rather than a constant.

export interface CanvasConnection {
  /** e.g. https://myschool.instructure.com — schools each have their own. */
  baseUrl: string;
  accessToken: string;
  refreshToken?: string;
  /** Epoch millis. Canvas tokens are short-lived; refresh before this. */
  expiresAt?: number;
  userName?: string;
  connectedAt: number;
  lastSyncedAt?: number;
}

/** The subset of a Canvas course Panda actually uses. */
export interface CanvasCourse {
  id: number;
  name: string;
  course_code?: string;
}

/** The subset of a Canvas assignment Panda actually uses. */
export interface CanvasAssignment {
  id: number;
  course_id: number;
  name: string;
  description?: string | null;
  due_at?: string | null;
  points_possible?: number | null;
  html_url?: string;
}

/** Canvas sends HTML descriptions; assignments here are plain text. */
export function stripHtml(html: string | null | undefined): string | undefined {
  if (!html) return undefined;
  const text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text || undefined;
}

/**
 * A Canvas base URL in its one canonical spelling, or null.
 *
 * Only https, and only something that looks like a real hostname. This alone
 * is NOT permission to call the host -- see `allowedCanvasBase`, which is.
 */
export function normalizeBaseUrl(input: string): string | null {
  const trimmed = input.trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.)/i.test(url.hostname)) return null;
    return `https://${url.hostname}`;
  } catch {
    return null;
  }
}

/**
 * The Canvas hosts this deployment has agreed to talk to, from
 * `CANVAS_BASE_URLS` (comma-separated, e.g. "myschool.instructure.com").
 *
 * Why an allowlist and not "any https host": the token exchange sends this
 * deployment's client id AND client secret to `${baseUrl}/login/oauth2/token`.
 * When the base URL came from the request body, anybody could type their own
 * server into the connect box and be handed the secret. A school runs one
 * Canvas (two at most), so the people who set up the developer key name it
 * here, and every other host is refused before a single byte leaves.
 *
 * Unset or empty means nothing is allowed, which is the safe way round: a
 * deployment that forgot this setting cannot leak anything, it can only fail
 * to connect -- and the error says which variable to set.
 */
export function allowedCanvasBases(raw: string | undefined = process.env.CANVAS_BASE_URLS): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const base = normalizeBaseUrl(part);
    if (base) seen.add(base);
  }
  return [...seen];
}

/**
 * The canonical base URL when `input` is on the allowlist, otherwise null.
 * Every route that is about to send a secret or a token calls this first,
 * including the ones whose base URL came out of our own cookie: a cookie set
 * before the allowlist existed is exactly the stale input this has to catch.
 */
export function allowedCanvasBase(
  input: string | null | undefined,
  raw: string | undefined = process.env.CANVAS_BASE_URLS,
): string | null {
  if (!input) return null;
  const base = normalizeBaseUrl(input);
  if (!base) return null;
  return allowedCanvasBases(raw).includes(base) ? base : null;
}

/**
 * The `rel="next"` URL from a Canvas `Link` header, or null.
 *
 * Canvas paginates every list (ten items by default, a hundred at most) and
 * says where the next page is only in this header. Ignoring it is how a
 * student with sixty assignments in one course used to see the first fifty.
 *
 * The URL is only returned when it is on the same origin as `base`. The
 * request that follows it carries the student's bearer token, and a header
 * that points somewhere else is a header we do not follow.
 */
export function nextPageUrl(linkHeader: string | null | undefined, base: string): string | null {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(",")) {
    const match = /<([^>]+)>\s*;\s*(.*)$/.exec(part.trim());
    if (!match) continue;
    const rels = /rel="?([^";]+)"?/i.exec(match[2])?.[1]?.split(/\s+/) ?? [];
    if (!rels.includes("next")) continue;
    try {
      const url = new URL(match[1], base);
      return url.origin === new URL(base).origin ? url.toString() : null;
    } catch {
      return null;
    }
  }
  return null;
}
