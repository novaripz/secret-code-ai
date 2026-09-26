// Optional password protection. When APP_PASSWORD is set, every page and API
// route requires a session cookie obtained by entering it. Tokens are
// HMAC-signed with Web Crypto so they verify in the proxy and in routes.

export const SESSION_COOKIE = "rb_session";
const WEEK = 7 * 24 * 3600 * 1000;

export function authEnabled(): boolean {
  return !!process.env.APP_PASSWORD;
}

async function hmac(data: string): Promise<string> {
  const secret = process.env.SESSION_SECRET || process.env.APP_PASSWORD || "";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/[+/=]/g, (c) => (c === "+" ? "-" : c === "/" ? "_" : ""));
}

export async function createSessionToken(): Promise<string> {
  const exp = Date.now() + WEEK;
  return `${exp}.${await hmac(String(exp))}`;
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const expected = await hmac(exp);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export function passwordMatches(input: string): boolean {
  const expected = process.env.APP_PASSWORD ?? "";
  if (!expected || input.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < input.length; i++) diff |= input.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
