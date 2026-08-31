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
 * A Canvas base URL the server is willing to call.
 *
 * Only https, and only something that looks like a real hostname: this string
 * ends up in a server-side fetch, so a crafted value must not be able to point
 * the server at somewhere internal.
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
