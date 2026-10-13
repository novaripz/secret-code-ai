import type { NextRequest, NextResponse } from "next/server";
import { allowedCanvasBase, nextPageUrl, type CanvasConnection } from "./types";

// The server half of the Canvas integration: the connection cookie, the two
// token grants, and paginated reads.
//
// Every function that is about to send a secret or a token re-checks the base
// URL against the allowlist first, even when that URL came out of our own
// httpOnly cookie. The check is cheap and the cookie can be older than the
// allowlist, so trusting it would leave the one gap the allowlist exists to
// close.
//
// Every outbound request also refuses redirects. A 307 from an allowed host to
// somewhere else would replay the POST body -- client secret and all -- to the
// new address, and a redirect on a GET would carry the bearer token along. A
// real Canvas never redirects these endpoints, so refusing costs nothing.

export const CONNECTION_COOKIE = "canvas_conn";
export const OAUTH_COOKIE = "canvas_oauth";

/** Ninety days, the same as before: the refresh token is what keeps it alive. */
const CONNECTION_MAX_AGE = 60 * 60 * 24 * 90;

/** Refresh a little early, so a token does not expire between check and use. */
const EXPIRY_SLACK_MS = 60_000;

/** Insurance against a Link header that never stops saying "next". */
const MAX_PAGES = 20;

export class CanvasAuthError extends Error {}
export class CanvasForbiddenError extends Error {}

/** The stored connection, or null when there is none or it is not usable. */
export function readConnection(req: NextRequest): CanvasConnection | null {
  const raw = req.cookies.get(CONNECTION_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CanvasConnection>;
    if (typeof parsed.baseUrl !== "string" || typeof parsed.accessToken !== "string") return null;
    const baseUrl = allowedCanvasBase(parsed.baseUrl);
    if (!baseUrl) return null;
    return {
      baseUrl,
      accessToken: parsed.accessToken,
      refreshToken: typeof parsed.refreshToken === "string" ? parsed.refreshToken : undefined,
      expiresAt: typeof parsed.expiresAt === "number" ? parsed.expiresAt : undefined,
      userName: typeof parsed.userName === "string" ? parsed.userName : undefined,
      connectedAt: typeof parsed.connectedAt === "number" ? parsed.connectedAt : Date.now(),
      lastSyncedAt: typeof parsed.lastSyncedAt === "number" ? parsed.lastSyncedAt : undefined,
    };
  } catch {
    return null;
  }
}

/** The token goes into an httpOnly cookie rather than to the page, so a script on the page can never read it. */
export function writeConnection(res: NextResponse, conn: CanvasConnection): void {
  res.cookies.set(CONNECTION_COOKIE, JSON.stringify(conn), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: CONNECTION_MAX_AGE,
  });
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user?: { name?: string };
}

function credentials(): { clientId: string; clientSecret: string; redirectUri: string } | null {
  const clientId = process.env.CANVAS_CLIENT_ID;
  const clientSecret = process.env.CANVAS_CLIENT_SECRET;
  const redirectUri = process.env.CANVAS_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

async function tokenRequest(baseUrl: string, body: Record<string, string>): Promise<TokenResponse> {
  // Re-checked here, at the last line before the secret is sent, rather than
  // only where the base URL first arrived.
  const allowed = allowedCanvasBase(baseUrl);
  if (!allowed) throw new CanvasAuthError("That Canvas address is not one this server is set up for.");
  const res = await fetch(new URL("/login/oauth2/token", allowed), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    redirect: "error",
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !data.access_token) throw new CanvasAuthError("Canvas wouldn't issue a token.");
  return data;
}

/** The authorization-code grant, at the end of the OAuth redirect. */
export async function exchangeCode(baseUrl: string, code: string): Promise<CanvasConnection> {
  const creds = credentials();
  if (!creds) throw new CanvasAuthError("Canvas isn't configured on the server.");
  const data = await tokenRequest(baseUrl, {
    grant_type: "authorization_code",
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    redirect_uri: creds.redirectUri,
    code,
  });
  const now = Date.now();
  return {
    baseUrl: allowedCanvasBase(baseUrl) as string,
    accessToken: data.access_token as string,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_in ? now + data.expires_in * 1000 : undefined,
    userName: data.user?.name,
    connectedAt: now,
  };
}

/**
 * The refresh grant. Canvas access tokens last about an hour; without this
 * every sync after the first hour came back 401 and asked the student to
 * connect again. Canvas keeps the same refresh token, so only the access
 * token and its expiry change.
 */
export async function refreshConnection(conn: CanvasConnection): Promise<CanvasConnection> {
  const creds = credentials();
  if (!creds || !conn.refreshToken) throw new CanvasAuthError("No way to refresh this connection.");
  const data = await tokenRequest(conn.baseUrl, {
    grant_type: "refresh_token",
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    refresh_token: conn.refreshToken,
  });
  return {
    ...conn,
    accessToken: data.access_token as string,
    refreshToken: data.refresh_token ?? conn.refreshToken,
    expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
  };
}

export function needsRefresh(conn: CanvasConnection, now = Date.now()): boolean {
  return conn.expiresAt !== undefined && conn.refreshToken !== undefined && conn.expiresAt - EXPIRY_SLACK_MS <= now;
}

/**
 * A reader bound to one connection. It refreshes once on a 401 and retries,
 * and reports whether it did, so the route can hand the new token back in the
 * cookie. Pages are followed through the Link header, same origin only.
 */
export function canvasReader(initial: CanvasConnection) {
  let conn = initial;
  let refreshed = false;
  // Shared, so three course reads that all hit a 401 at once cause one refresh
  // between them rather than three.
  let refreshing: Promise<void> | null = null;

  function refreshOnce(): Promise<void> {
    if (!refreshing) {
      refreshing = refreshConnection(conn).then((next) => {
        conn = next;
        refreshed = true;
      });
    }
    return refreshing;
  }

  async function get(url: string, retry = true): Promise<Response> {
    const target = new URL(url, conn.baseUrl);
    if (target.origin !== new URL(conn.baseUrl).origin) throw new CanvasForbiddenError("off-origin");
    const token = conn.accessToken;
    const res = await fetch(target, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      redirect: "error",
    });
    if (res.status === 401 && retry && conn.refreshToken) {
      // Somebody else may already have refreshed while this was in flight; in
      // that case the retry simply uses their token.
      if (conn.accessToken === token) await refreshOnce();
      return get(url, false);
    }
    if (res.status === 401) throw new CanvasAuthError("unauthorized");
    if (res.status === 403) throw new CanvasForbiddenError("forbidden");
    if (!res.ok) throw new Error(`canvas ${res.status}`);
    return res;
  }

  return {
    async all<T>(path: string): Promise<T[]> {
      const out: T[] = [];
      let next: string | null = path;
      for (let page = 0; next && page < MAX_PAGES; page++) {
        const res = await get(next);
        const items = (await res.json()) as T[];
        if (Array.isArray(items)) out.push(...items);
        next = nextPageUrl(res.headers.get("link"), conn.baseUrl);
      }
      return out;
    },
    /** The connection as it stands now, possibly with a fresher token. */
    connection: () => conn,
    refreshed: () => refreshed,
    refreshNow: refreshOnce,
  };
}

/**
 * Runs `fn` over `items` with at most `limit` in flight. A student with eight
 * classes should not fire eight simultaneous requests at a school's Canvas and
 * trip its rate limit, but one-at-a-time made a sync take as long as the
 * slowest course times the number of courses.
 */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}
