import type { Project } from "@/types";
import { findByPath, listAllFiles } from "@/lib/fileSystem";
import { assetContentUrl } from "@/lib/assets";
import { parentPath, resolveAgainst } from "@/lib/paths";

const CONSOLE_BRIDGE = `
<script>
(function () {
  var send = function (level, args) {
    try {
      window.parent.postMessage({ __preview: true, level: level, text: Array.from(args).map(function (a) {
        if (a instanceof Error) return a.stack || a.message;
        try { return typeof a === "string" ? a : JSON.stringify(a); } catch (e) { return String(a); }
      }).join(" ") }, "*");
    } catch (e) {}
  };
  ["log", "warn", "error", "info"].forEach(function (level) {
    var original = console[level];
    console[level] = function () {
      send(level, arguments);
      original && original.apply(console, arguments);
    };
  });
  window.addEventListener("error", function (e) {
    send("error", [e.message + " (" + e.filename + ":" + e.lineno + ")"]);
  });
  window.addEventListener("unhandledrejection", function (e) {
    send("error", ["Unhandled promise rejection: " + (e.reason && e.reason.message ? e.reason.message : e.reason)]);
  });
})();
</script>`;

function resolveLocal(fromPath: string, ref: string): string | undefined {
  if (/^(https?:)?\/\//.test(ref) || ref.startsWith("data:")) return undefined;
  const clean = ref.split("#")[0].split("?")[0];
  if (!clean) return undefined;
  const base = clean.startsWith("/") ? "" : parentPath(fromPath);
  // resolveAgainst rather than joinPath+normalizePath: normalizePath leaves
  // ".." in place on purpose (see its neighbour in paths.ts), so a reference
  // like "../art/x.png" used to resolve to the literal "css/../art/x.png" and
  // match no file at all.
  return resolveAgainst(base, clean);
}

/**
 * The data URL for a local asset reference, or undefined if it is not one.
 *
 * This is what makes a picture actually appear. The preview is a srcdoc iframe
 * with no server and no origin, so `<img src="logo.png">` resolves against
 * about:blank and fails silently — the student sees a broken-image icon and
 * concludes the tool cannot do images. Since the asset is already stored as a
 * data URL, swapping the reference for the content costs nothing and needs no
 * network, which is also what keeps the sandbox closed.
 */
function assetUrl(project: Project, fromPath: string, ref: string): string | undefined {
  const resolved = resolveLocal(fromPath, ref);
  if (!resolved) return undefined;
  const file = findByPath(project, resolved);
  if (!file || file.kind !== "file") return undefined;
  // assetContentUrl, not file.content: a .svg is stored as text and has to be
  // encoded to be loadable here. Checking isAssetNode alone silently skipped
  // every generated shape.
  return assetContentUrl(file);
}

/**
 * Rewrites every local asset reference in a chunk of HTML.
 *
 * Attribute-based rather than tag-based: `src` covers img, audio, video,
 * source, embed and track in one rule, and `poster` and `href` on an icon link
 * are the two that carry an asset but are not called src. Quotes are required
 * in the pattern, which is the cheap way to avoid mangling an unquoted
 * attribute we cannot parse confidently.
 */
function inlineAssetRefs(project: Project, fromPath: string, html: string): string {
  return html.replace(
    /\b(src|poster|href)\s*=\s*("|')([^"']+)\2/gi,
    (whole, attr: string, quote: string, ref: string) => {
      const url = assetUrl(project, fromPath, ref);
      return url ? `${attr}=${quote}${url}${quote}` : whole;
    },
  );
}

/**
 * The same job for CSS `url(...)`, which is how a background image or a
 * @font-face gets in. Run over stylesheet text after it is inlined, so a
 * reference is resolved relative to the CSS file that wrote it rather than to
 * the HTML that included it — `url(../img/bg.png)` inside css/app.css means
 * something different from the same string in index.html, and getting that
 * wrong silently loads nothing.
 */
function inlineCssUrls(project: Project, fromPath: string, css: string): string {
  return css.replace(/url\(\s*("|'|)([^"')]+)\1\s*\)/gi, (whole, quote: string, ref: string) => {
    const url = assetUrl(project, fromPath, ref);
    return url ? `url(${quote}${url}${quote})` : whole;
  });
}

/**
 * Builds a self-contained HTML document (for use as an iframe srcdoc) from
 * the project's entry HTML file, inlining local <link>/<script> references
 * so the sandboxed preview needs no network or same-origin access.
 */
export function buildPreviewDocument(project: Project, entryPath = "index.html"): {
  html: string;
  entryFound: boolean;
} {
  const entry = findByPath(project, entryPath) ?? listAllFiles(project).find((f) => f.path.endsWith("index.html"));
  if (!entry || !entry.content) {
    return { html: fallbackDocument(), entryFound: false };
  }

  let html = entry.content;

  html = html.replace(/<link\s+[^>]*rel=["']stylesheet["'][^>]*>/gi, (tag) => {
    const hrefMatch = tag.match(/href=["']([^"']+)["']/i);
    if (!hrefMatch) return tag;
    const resolved = resolveLocal(entry.path, hrefMatch[1]);
    if (!resolved) return tag;
    const file = findByPath(project, resolved);
    if (!file || file.kind !== "file") return tag;
    return `<style data-inlined-from="${resolved}">\n${inlineCssUrls(project, resolved, file.content ?? "")}\n</style>`;
  });

  html = html.replace(/<script\s+([^>]*)src=["']([^"']+)["']([^>]*)>\s*<\/script>/gi, (tag, pre, src, post) => {
    const resolved = resolveLocal(entry.path, src);
    if (!resolved) return tag;
    const file = findByPath(project, resolved);
    if (!file || file.kind !== "file") return tag;
    const attrs = `${pre} ${post}`;
    const isModule = /type=["']module["']/i.test(attrs);
    return `<script${isModule ? ' type="module"' : ""} data-inlined-from="${resolved}">\n${file.content ?? ""}\n</script>`;
  });

  // Assets last, and over the whole document rather than over the markup alone.
  //
  // Running it after the script blocks are inlined is deliberate, not an
  // accident of ordering: a game that does `sprite.src = "cookie.png"` in
  // JavaScript needs that string rewritten too, and by this point that string
  // is sitting in the document. The base path is the ENTRY's, which is correct
  // for both cases — a browser resolves an attribute and a runtime `.src`
  // assignment against the document's URL, never against the script's — so
  // "cookie.png" written inside js/main.js means the same file it would mean in
  // index.html. Passing the script's own path here would look more careful and
  // would quietly resolve half the references to the wrong place.
  html = inlineAssetRefs(project, entry.path, html);

  if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/<head([^>]*)>/i, `<head$1>${CONSOLE_BRIDGE}`);
  } else {
    html = CONSOLE_BRIDGE + html;
  }

  return { html, entryFound: true };
}

function fallbackDocument(): string {
  return `<!doctype html>
<html><head><meta charset="utf-8" /><style>
  body { font-family: ui-sans-serif, system-ui; background:#0a0a0a; color:#a1a1aa; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; text-align:center; padding:2rem; }
</style></head>
<body><div>
  <p style="font-size:14px;">No <code>index.html</code> found yet.</p>
  <p style="font-size:12px;opacity:.7;">Create one, or ask Panda to build a web page, to see a live preview here.</p>
</div></body></html>`;
}
