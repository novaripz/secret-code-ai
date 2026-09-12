import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// The Supabase client for code running on the server.
//
// It is built the same way as the browser one — project URL plus the anon key,
// both from server-side environment variables, the same pair /api/auth/config
// hands to the browser — and it is deliberately *not* built from a service-role
// key. The whole schema in supabase/migrations/0001_init.sql assumes queries run
// as the signed-in person: every policy is a sentence about auth.uid(). A
// service-role client would turn all of that off and quietly make this file the
// only thing standing between one student and another's work. There is no
// service key here and there should never be one.
//
// So a server client needs the caller's access token, which is why the useful
// export takes one. Sessions are not persisted and tokens are not refreshed:
// this client lives for one request, and the browser owns the session.

export interface SupabaseServerConfig {
  url: string;
  anonKey: string;
}

/**
 * The project's config, or null when this deployment has no Supabase at all —
 * the same "not configured" state the browser client models, because a
 * deployment without Supabase is a supported way to run Panda, not an error.
 */
export function supabaseServerConfig(): SupabaseServerConfig | null {
  const url = process.env.SUPABASE_URL;
  // Supabase renamed the anon key to the "publishable key"; accept either, as
  // /api/auth/config does.
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;
  return url && anonKey ? { url, anonKey } : null;
}

/**
 * A client that acts as the person holding `accessToken`. Returns null when
 * Supabase isn't configured, so a caller can tell "no backend" apart from
 * "backend refused", which are different answers to give a user.
 */
export function createServerClient(accessToken: string): SupabaseClient | null {
  const config = supabaseServerConfig();
  if (!config) return null;

  return createClient(config.url, config.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      // PostgREST reads auth.uid() out of this token. Without it every query
      // would run as `anon`, which the migration grants nothing to at all.
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });
}

/** Pulls the bearer token out of a request's Authorization header. */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1] : null;
}
