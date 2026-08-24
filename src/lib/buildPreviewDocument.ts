import type { Project } from "@/types";
import { findByPath, listAllFiles } from "@/lib/fileSystem";
import { normalizePath, parentPath, joinPath } from "@/lib/paths";

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
  return normalizePath(joinPath(base, clean));
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
    return `<style data-inlined-from="${resolved}">\n${file.content ?? ""}\n</style>`;
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
  <p style="font-size:12px;opacity:.7;">Create one, or ask the AI to build a web page, to see a live preview here.</p>
</div></body></html>`;
}
