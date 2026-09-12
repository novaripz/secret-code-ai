import type { NextConfig } from "next";

// Security headers, set here rather than in a proxy/middleware file.
//
// Two reasons. First, Next 16 has deprecated `middleware.ts` in favour of
// `proxy.ts`, and a proxy runs on every request including static assets — it
// is the wrong place for a constant. Second, these headers never vary by
// request, so `headers()` is exactly the feature for the job and costs nothing
// at runtime.
//
// The consequence to be honest about: a static header cannot carry a
// per-request nonce, and Next's App Router inlines hydration data in a script
// tag. So an enforced strict `script-src` is not available to us without
// moving CSP into a proxy and threading a nonce through every script tag. What
// ships instead is an enforced policy that is strict everywhere script-src is
// not (framing, objects, base URI, form targets, connect/img/style origins),
// plus a *report-only* strict policy for script-src so the gap is measured
// rather than guessed at. That is stated plainly because the alternative —
// shipping a strict script-src that silently breaks Monaco or Google sign-in —
// would cost a classroom its editor mid-lesson, which is worse than the
// weakness it fixes.
//
// The allowlists below are not decorative. Each entry is something the app
// genuinely loads:
//   - cdn.jsdelivr.net  @monaco-editor/react fetches the Monaco bundle (and
//                       its worker + CSS) from jsDelivr unless a loader is
//                       configured; removing this breaks the editor.
//   - accounts.google.com  Google Identity Services script and its iframe.
//   - *.supabase.co     auth and data, over XHR/WebSocket.
//   - youtube-nocookie  the one iframe the Watch tab is allowed to create.
//   - blob:/data:       Monaco creates its web workers from blob URLs, and
//                       screenshots/attachments are handled as data URIs.
// KaTeX is bundled, not remote, so it needs nothing beyond 'self' except the
// inline styles it writes onto rendered math.

const SCRIPT_SRC = [
  "'self'",
  // Required: the App Router inlines hydration/bootstrap scripts, and a static
  // header has no nonce to offer them.
  "'unsafe-inline'",
  // Monaco compiles on the fly and Next's dev overlay needs it too.
  "'unsafe-eval'",
  "blob:",
  "https://cdn.jsdelivr.net",
  "https://accounts.google.com",
  "https://apis.google.com",
].join(" ");

const CSP = [
  "default-src 'self'",
  `script-src ${SCRIPT_SRC}`,
  `script-src-elem ${SCRIPT_SRC}`,
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  // Monaco and KaTeX both write inline styles; there is no way around this one.
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com",
  "font-src 'self' data: https://cdn.jsdelivr.net https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: data:",
  "connect-src 'self' blob: data: https://cdn.jsdelivr.net https://accounts.google.com https://*.supabase.co wss://*.supabase.co https://www.googleapis.com https://generativelanguage.googleapis.com",
  // Only the embedded player and the Google sign-in iframe, nothing else.
  "frame-src 'self' https://www.youtube-nocookie.com https://accounts.google.com",
  // Nothing may frame a page showing student work.
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

// What we would like to ship one day: no 'unsafe-inline', no 'unsafe-eval'.
// Reported only, so the console tells us what would break before anything does.
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' blob: https://cdn.jsdelivr.net https://accounts.google.com https://apis.google.com",
  "object-src 'none'",
  "base-uri 'self'",
].join("; ");

const securityHeaders = [
  // Two years, subdomains included. HSTS is ignored over plain HTTP, so this
  // is inert in local dev and active the moment the app is served over TLS.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Belt and braces with frame-ancestors above, for anything that still only
  // understands the old header.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    // Panda captures a browser tab for screenshots, which needs none of these.
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  { key: "Content-Security-Policy", value: CSP },
  { key: "Content-Security-Policy-Report-Only", value: CSP_REPORT_ONLY },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig: NextConfig = {
  // The version banner tells an attacker which Next CVEs to try. It buys us
  // nothing.
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // API replies are per-request and some carry config; none of them
        // should ever sit in a shared cache.
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default nextConfig;
