import type { Project } from "@/types";
import { findByPath, listAllFiles } from "@/lib/fileSystem";
import { assetContentUrl, listAssets } from "@/lib/assets";
import { parentPath, resolveAgainst } from "@/lib/paths";

// THE BRIDGES, AND WHY EACH IS ONE LINE LONG
//
// Two small scripts are put at the top of every preview: one forwards the
// page's console and errors to the workspace, the other turns clicks on local
// links into navigation the workspace performs. They are written out below as
// readable source and collapsed onto a single line before they are injected,
// because a newline in them would push every line of the student's page down
// by one — and the error locations the console reports ("game.js line 12")
// are worth exactly nothing if they are off by thirty. Being one line long is
// what lets them sit at the top of <head> without moving anything.
//
// The consequence for whoever edits them: no `//` comments inside, and every
// statement ends in a semicolon, because collapsing turns a line comment into
// a comment over the rest of the script.

/** Collapses a bridge onto one line. See the note above. */
function oneLine(source: string): string {
  return source.replace(/\n\s*/g, " ").trim();
}

// Clicking a link inside the preview.
//
// The preview is a srcdoc document, so it has no URL and no origin: an
// <a href="about.html"> resolves against about:srcdoc, the browser refuses, and
// the page simply does not move. A student builds a site with a nav bar and
// every link in it is dead, with nothing on screen saying why.
//
// So local navigation is intercepted and handed to the parent, which rebuilds
// the document for that page and swaps it in. That is not a hack around the
// sandbox — it IS the navigation, done by the only party that has the files.
// The href is sent as written; the parent resolves it against the page it is
// showing, so a link from pages/about.html to "contact.html" finds
// pages/contact.html rather than a root-level file that does not exist.
//
// External links are left alone but opened by the parent rather than in place:
// replacing the preview with somebody's website is never what a student meant
// by clicking a link in their own project, and the sandbox has no allow-popups.
const NAV_BRIDGE = oneLine(`
<script>
(function () {
  var send = function (payload) {
    try { window.parent.postMessage(payload, "*"); } catch (e) {}
  };
  var localPage = function (href) {
    if (!href) return null;
    if (/^(https?:)?\\/\\//.test(href) || /^(mailto|tel|data|blob|javascript):/i.test(href)) return null;
    if (href.charAt(0) === "#") return null;
    return href.split("#")[0].split("?")[0] || null;
  };
  document.addEventListener("click", function (e) {
    var el = e.target;
    while (el && el.tagName !== "A") el = el.parentElement;
    if (!el) return;
    var href = el.getAttribute("href");
    var page = localPage(href);
    if (page) {
      e.preventDefault();
      send({ __preview: true, navigate: page });
    } else if (href && /^(https?:)?\\/\\//.test(href)) {
      e.preventDefault();
      send({ __preview: true, external: href });
    }
  }, true);
  document.addEventListener("submit", function (e) {
    var page = localPage(e.target && e.target.getAttribute("action"));
    if (page) { e.preventDefault(); send({ __preview: true, navigate: page }); }
  }, true);
})();
</script>`);

// The console, forwarded.
//
// Three jobs beyond passing text along:
//
// * WHERE. Every message and every error carries the file and line it came
//   from, read off the stack. Each inlined script is tagged with
//   `//# sourceURL=<its path>`, which is what makes the browser name the frame
//   "js/game.js:12" instead of "about:srcdoc:1834". Syntax errors have no stack
//   at all and report a line in the whole document, so the bridge is also told
//   where each script starts (STARTS) and subtracts.
// * WHAT. Objects are shown the way a browser console shows them — `{x: 1,
//   y: 2}`, `[1, 2, 3]`, `<button id="go">` — rather than as "[object Object]",
//   which is the single least useful thing a beginner's console can print.
// * HOW MUCH. A game that logs every frame sends sixty messages a second
//   forever. Past a ceiling the rest of that second is dropped with one note
//   saying so, so the workspace stays usable while the game runs.
//
// It also evaluates what the student types into the console box — inside the
// sandboxed page, never in the app — and posts the answer back.
function consoleBridge(starts: Record<string, number>): string {
  const map = JSON.stringify(starts).replace(/</g, "\\u003c");
  return oneLine(`
<script>
(function () {
  var STARTS = ${map};
  var parent = window.parent;
  var budget = 0, windowStart = 0, warned = false;
  var post = function (payload) {
    payload.__preview = true;
    try { parent.postMessage(payload, "*"); } catch (e) {}
  };
  var send = function (payload) {
    var now = Date.now();
    if (now - windowStart > 1000) { windowStart = now; budget = 0; warned = false; }
    budget += 1;
    if (budget > 200) {
      if (!warned) { warned = true; post({ level: "warn", text: "Lots of messages at once, so some were skipped. Logging every frame slows a game down." }); }
      return;
    }
    post(payload);
  };
  var locate = function (url, line, col) {
    if (!url || /^(about|https?|blob|data|chrome|webpack):/.test(url)) return null;
    var file = url, offset = 1;
    var q = url.indexOf("?inline=");
    if (q !== -1) { file = url.slice(0, q); offset = parseInt(url.slice(q + 8), 10) || 1; }
    try { file = decodeURIComponent(file); } catch (e) {}
    return { file: file, line: offset + line - 1, col: col };
  };
  var fromStack = function (stack, skip) {
    var lines = String(stack || "").split("\\n");
    for (var i = skip || 0; i < lines.length; i++) {
      var m = /(?:^|[\\s(@])([^\\s()@]+):(\\d+):(\\d+)\\)?$/.exec(lines[i].trim());
      if (m) { var hit = locate(m[1], +m[2], +m[3]); if (hit) return hit; }
    }
    return null;
  };
  var seen = [];
  var fmt = function (value, depth) {
    var t = typeof value;
    if (value === null) return "null";
    if (t === "undefined") return "undefined";
    if (t === "string") return depth > 0 ? JSON.stringify(value) : value;
    if (t === "number" || t === "boolean" || t === "bigint") return String(value);
    if (t === "symbol") return String(value);
    if (t === "function") return "function " + (value.name || "anonymous") + "()";
    if (value instanceof Error) return (value.name || "Error") + ": " + value.message;
    if (typeof Element !== "undefined" && value instanceof Element) {
      var cls = typeof value.className === "string" && value.className ? " class=\\"" + value.className + "\\"" : "";
      return "<" + value.tagName.toLowerCase() + (value.id ? " id=\\"" + value.id + "\\"" : "") + cls + ">";
    }
    if (depth > 2) return Array.isArray(value) ? "[…]" : "{…}";
    if (seen.indexOf(value) !== -1) return "(circular)";
    seen.push(value);
    try {
      if (Array.isArray(value)) {
        var items = [];
        for (var i = 0; i < value.length && i < 50; i++) items.push(fmt(value[i], depth + 1));
        if (value.length > 50) items.push("… " + (value.length - 50) + " more");
        return "[" + items.join(", ") + "]";
      }
      if (typeof Map !== "undefined" && value instanceof Map) {
        var entries = [];
        value.forEach(function (v, k) { if (entries.length < 30) entries.push(fmt(k, depth + 1) + " => " + fmt(v, depth + 1)); });
        return "Map(" + value.size + ") {" + entries.join(", ") + "}";
      }
      if (typeof Set !== "undefined" && value instanceof Set) {
        var members = [];
        value.forEach(function (v) { if (members.length < 30) members.push(fmt(v, depth + 1)); });
        return "Set(" + value.size + ") {" + members.join(", ") + "}";
      }
      var keys = Object.keys(value);
      var parts = [];
      for (var j = 0; j < keys.length && j < 30; j++) parts.push(keys[j] + ": " + fmt(value[keys[j]], depth + 1));
      if (keys.length > 30) parts.push("…");
      var ctor = value.constructor && value.constructor.name;
      return (ctor && ctor !== "Object" ? ctor + " " : "") + "{" + parts.join(", ") + "}";
    } catch (e) {
      return String(value);
    } finally {
      seen.pop();
    }
  };
  var format = function (args) {
    seen = [];
    var list = Array.prototype.slice.call(args);
    if (typeof list[0] === "string" && /%[sdifoOc]/.test(list[0])) {
      var rest = list.slice(1);
      var head = list[0].replace(/%([sdifoOc])/g, function (all, kind) {
        if (rest.length === 0) return all;
        var next = rest.shift();
        if (kind === "c") return "";
        if (kind === "d" || kind === "i") return String(parseInt(next, 10));
        if (kind === "f") return String(parseFloat(next));
        return fmt(next, kind === "s" ? 0 : 1);
      });
      list = [head].concat(rest);
    }
    return list.map(function (a) { return fmt(a, 0); }).join(" ");
  };
  var levels = { log: "log", info: "info", warn: "warn", error: "error", debug: "log", trace: "log", table: "log" };
  Object.keys(levels).forEach(function (name) {
    var original = console[name];
    console[name] = function () {
      var where = null;
      var first = arguments[0];
      if (first instanceof Error) where = fromStack(first.stack, 0);
      if (!where) { try { where = fromStack(new Error().stack, 0); } catch (e) {} }
      var payload = { level: levels[name], text: format(arguments) };
      if (where) { payload.file = where.file; payload.line = where.line; payload.col = where.col; }
      send(payload);
      if (original) { try { original.apply(console, arguments); } catch (e) {} }
    };
  });
  var clear = console.clear;
  console.clear = function () { post({ clear: true }); if (clear) { try { clear.call(console); } catch (e) {} } };
  window.addEventListener("error", function (e) {
    if (!e || !e.message) return;
    var where = e.error ? fromStack(e.error.stack, 0) : null;
    if (!where && e.filename && STARTS[e.filename] !== undefined) {
      where = locate(e.filename, e.lineno - STARTS[e.filename] + 1, e.colno);
    }
    if (!where && e.filename) where = locate(e.filename, e.lineno, e.colno);
    var payload = { level: "error", text: String(e.message).replace(/^Uncaught /, "") };
    if (where) { payload.file = where.file; payload.line = where.line; payload.col = where.col; }
    send(payload);
  });
  window.addEventListener("unhandledrejection", function (e) {
    var reason = e && e.reason;
    var where = reason && reason.stack ? fromStack(reason.stack, 0) : null;
    var payload = { level: "error", text: "A promise failed and nothing caught it: " + format([reason]) };
    if (where) { payload.file = where.file; payload.line = where.line; payload.col = where.col; }
    send(payload);
  });
  window.addEventListener("message", function (e) {
    if (e.source !== parent) return;
    var d = e.data;
    if (!d || typeof d !== "object" || typeof d.__pandaEval !== "string") return;
    var id = d.id;
    var answer = function (level, text) { post({ evalId: id, level: level, text: text }); };
    try {
      var result = (0, eval)(d.__pandaEval);
      if (result && typeof result.then === "function") {
        result.then(function (v) { seen = []; answer("result", fmt(v, 1)); }, function (err) { answer("error", format([err])); });
        return;
      }
      seen = [];
      answer("result", fmt(result, 1));
    } catch (err) {
      answer("error", err && err.name ? err.name + ": " + err.message : String(err));
    }
  });
})();
</script>`);
}

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
 * Replaces exact asset paths written as string literals with their data.
 *
 * This is what makes SOUND WORK. `new Audio("sfx/click.wav")` is a constructor
 * argument, not an attribute, so the attribute rewriter above never sees it —
 * and a student clicking the button got silence with nothing in the console to
 * explain it. The same applies to `fetch("data/levels.json")` and to any path
 * handed to a library rather than written into markup.
 *
 * Deliberately an EXACT MATCH against the project's real asset paths rather
 * than a pattern over anything quoted. A regex for "things that look like a
 * file path" would rewrite a student's own string constant that happens to
 * resemble one; matching only paths that actually exist cannot. Longest first,
 * so "art/ui/star.png" is replaced before "art/ui" could be matched inside it.
 */
function inlineAssetStrings(project: Project, html: string): string {
  const assets = listAssets(project)
    .map((a) => a.path)
    .sort((a, b) => b.length - a.length);
  let out = html;
  for (const path of assets) {
    const file = findByPath(project, path);
    const url = file ? assetContentUrl(file) : undefined;
    if (!url) continue;
    // Both quote styles, and the "./" form a student is as likely to write.
    for (const form of [path, `./${path}`]) {
      for (const quote of ['"', "'"]) {
        out = out.split(`${quote}${form}${quote}`).join(`${quote}${url}${quote}`);
      }
    }
  }
  return out;
}


/** 1-based line number of a character offset. */
function lineAt(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

/** Scripts the browser will run as JavaScript, as opposed to a JSON blob or a template. */
function isJavaScriptType(attrs: string): boolean {
  const type = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1]?.toLowerCase();
  return !type || type === "module" || /^(text|application)\/(java|ecma)script$/.test(type);
}

/**
 * Text that is about to be put inside an inline element, made safe to be there.
 *
 * A script that contains the characters `</script>` — in a string, which is
 * exactly how a game that writes HTML does it — ended the inlined block early,
 * and the rest of the file spilled onto the page as text. `<\/script` means the
 * same thing to JavaScript and nothing at all to the HTML parser. The same goes
 * for `</style>` inside CSS, where `\/` is just an escaped slash.
 */
function escapeClosingTag(text: string, tag: "script" | "style"): string {
  return text.replace(new RegExp(`</${tag}`, "gi"), `<\\/${tag}`);
}

export interface PreviewDocument {
  html: string;
  entryFound: boolean;
  /** The page actually shown, after falling back from a missing one. */
  entryPath?: string;
  /**
   * Stylesheets and scripts the page asks for that are not in the project.
   * A typo in `<script src="js/gmae.js">` used to fail in silence — the browser
   * quietly could not load it, and the game just did nothing.
   */
  missing: string[];
}

/**
 * Builds a self-contained HTML document (for use as an iframe srcdoc) from
 * the project's entry HTML file, inlining local <link>/<script> references
 * so the sandboxed preview needs no network or same-origin access.
 */
export function buildPreviewDocument(project: Project, entryPath = "index.html"): PreviewDocument {
  // A named page that is missing falls back to the project's entry rather than
  // showing the empty state: a broken link in a nav bar should not look like a
  // project with no index.html.
  const entry =
    findByPath(project, entryPath) ??
    findByPath(project, "index.html") ??
    listAllFiles(project).find((f) => f.path.endsWith(".html"));
  if (!entry || !entry.content) {
    return { html: fallbackDocument(), entryFound: false, missing: [] };
  }

  const source = entry.content;
  const missing: string[] = [];

  // The page's own inline scripts are named first, while their positions in
  // the file are still the positions the student sees. `?inline=12` says
  // "this script starts on line 12 of index.html", which is how an error on
  // its fourth line is reported as index.html line 15 rather than line 4 of
  // something nameless.
  let html = source.replace(
    /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi,
    (tag: string, attrs: string, body: string, offset: number) => {
      if (/\bsrc\s*=/i.test(attrs) || !isJavaScriptType(attrs) || !body.trim()) return tag;
      const line = lineAt(source, offset + tag.indexOf(">") + 1);
      return `<script${attrs}>${body}\n//# sourceURL=${encodeURI(entry.path)}?inline=${line}\n</script>`;
    },
  );

  html = html.replace(/<link\s+[^>]*rel=["']stylesheet["'][^>]*>/gi, (tag) => {
    const hrefMatch = tag.match(/href=["']([^"']+)["']/i);
    if (!hrefMatch) return tag;
    const resolved = resolveLocal(entry.path, hrefMatch[1]);
    if (!resolved) return tag;
    const file = findByPath(project, resolved);
    if (!file || file.kind !== "file") {
      missing.push(resolved);
      return tag;
    }
    const css = escapeClosingTag(inlineCssUrls(project, resolved, file.content ?? ""), "style");
    return `<style data-inlined-from="${resolved}">\n${css}\n</style>`;
  });

  // `defer` means "after the page has been read", and an inlined script has
  // no such option — it runs where it stands. So a deferred script in <head>
  // used to run before the <body> it was written to work on existed, and
  // every querySelector in it came back null. Deferred scripts are moved to
  // the end of the body instead, in their original order, which is what
  // `defer` promised. Modules are deferred by the browser already.
  const deferred: string[] = [];
  html = html.replace(
    /<script\s+([^>]*?)\bsrc\s*=\s*["']([^"']+)["']([^>]*)>\s*<\/script\s*>/gi,
    (tag: string, pre: string, src: string, post: string) => {
      const resolved = resolveLocal(entry.path, src);
      if (!resolved) return tag;
      const file = findByPath(project, resolved);
      if (!file || file.kind !== "file") {
        missing.push(resolved);
        return tag;
      }
      const attrs = `${pre} ${post}`;
      const isModule = /type\s*=\s*["']?module/i.test(attrs);
      // No newline between the tag and the code: line 1 of the file has to be
      // line 1 of the script, or every reported line is off by one.
      const block =
        `<script${isModule ? ' type="module"' : ""} data-inlined-from="${resolved}">` +
        `${escapeClosingTag(file.content ?? "", "script")}\n//# sourceURL=${encodeURI(resolved)}\n</script>`;
      if (!isModule && /\bdefer\b/i.test(attrs)) {
        deferred.push(block);
        return "";
      }
      return block;
    },
  );
  if (deferred.length > 0) {
    const close = html.search(/<\/body\s*>(?![\s\S]*<\/body\s*>)/i);
    html = close === -1 ? html + deferred.join("\n") : html.slice(0, close) + deferred.join("\n") + html.slice(close);
  }

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
  html = inlineAssetStrings(project, html);

  // Where each named script starts in the finished document, for the syntax
  // errors that report a document line and nothing else. Measured now, after
  // every rewrite: the bridges about to go in are one line long and are put on
  // a line that already exists, so these numbers stay true.
  const starts: Record<string, number> = {};
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    const url = /\/\/# sourceURL=(\S+)\s*$/.exec(match[1])?.[1];
    if (!url || url in starts) continue;
    starts[url] = lineAt(html, (match.index ?? 0) + match[0].indexOf(">") + 1);
  }

  const bridges = consoleBridge(starts) + NAV_BRIDGE;
  if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/<head([^>]*)>/i, `<head$1>${bridges}`);
  } else if (/<html[^>]*>/i.test(html)) {
    html = html.replace(/<html([^>]*)>/i, `<html$1>${bridges}`);
  } else if (/<!doctype[^>]*>/i.test(html)) {
    // Never in front of the doctype: anything before it puts the page in
    // quirks mode, and a layout that works everywhere but here is a riddle.
    html = html.replace(/<!doctype([^>]*)>/i, `<!doctype$1>${bridges}`);
  } else {
    html = bridges + html;
  }

  return { html, entryFound: true, entryPath: entry.path, missing: [...new Set(missing)] };
}

/** Every page of the project, index.html first, for navigation and for a standalone copy. */
export function listPages(project: Project): string[] {
  return listAllFiles(project)
    .map((f) => f.path)
    .filter((p) => /\.html?$/i.test(p))
    .sort((a, b) => (a === "index.html" ? -1 : b === "index.html" ? 1 : a.localeCompare(b)));
}

/**
 * The page a link inside the preview leads to.
 *
 * Resolved against the page the link is ON, which is how a browser does it:
 * `contact.html` written in pages/about.html means pages/contact.html. This
 * used to resolve against the project root, so every relative link in a
 * subfolder led to a page that did not exist and the preview fell back to the
 * home page — a nav bar that "worked" by always going home. A link to a folder
 * means that folder's index.html, again as on a real server.
 */
export function resolvePreviewPage(project: Project, fromPage: string, href: string): string {
  const clean = href.split("#")[0].split("?")[0];
  const base = clean.startsWith("/") ? "" : parentPath(fromPage);
  const target = resolveAgainst(base, clean);
  if (!target) return "index.html";
  const node = findByPath(project, target);
  if (clean.endsWith("/") || node?.kind === "folder") return `${target}/index.html`;
  return target;
}

/**
 * The project as one page that runs on its own, for "open in a new tab".
 *
 * The student's code still runs inside a sandboxed frame, exactly as it does in
 * the workspace. A Blob URL inherits the app's own origin, so a page opened
 * from one directly could read everything this app keeps in the browser; the
 * frame is what stops a project imported from a stranger's zip from doing that.
 * Every page is built in advance and carried along, so the links between them
 * keep working in the new tab too.
 */
export function buildStandalonePage(project: Project, startPage = "index.html"): string {
  const pages: Record<string, string> = {};
  for (const page of listPages(project)) pages[page] = buildPreviewDocument(project, page).html;
  const first = pages[startPage] !== undefined ? startPage : (listPages(project)[0] ?? "index.html");
  const data = JSON.stringify({ pages, first }).replace(/</g, "\\u003c");
  const title = project.name.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>html,body{margin:0;height:100%;background:#fff}iframe{display:block;border:0;width:100%;height:100%}</style>
</head><body>
<iframe id="page" title="${title}" sandbox="allow-scripts allow-forms allow-modals" allow="fullscreen"></iframe>
<script>
(function () {
  var DATA = ${data};
  var frame = document.getElementById("page");
  var current = DATA.first;
  function resolve(from, href) {
    var clean = href.split("#")[0].split("?")[0];
    var parts = (clean.charAt(0) === "/" ? "" : from.split("/").slice(0, -1).join("/")) + "/" + clean;
    var out = [];
    parts.split("/").forEach(function (seg) {
      if (!seg || seg === ".") return;
      if (seg === "..") { out.pop(); return; }
      out.push(seg);
    });
    var target = out.join("/");
    if (DATA.pages[target] === undefined && DATA.pages[target + "/index.html"] !== undefined) target += "/index.html";
    return target;
  }
  function show(page) {
    current = DATA.pages[page] !== undefined ? page : DATA.first;
    frame.srcdoc = DATA.pages[current] || "";
  }
  window.addEventListener("message", function (e) {
    if (e.source !== frame.contentWindow || !e.data || !e.data.__preview) return;
    if (typeof e.data.navigate === "string") show(resolve(current, e.data.navigate));
    else if (typeof e.data.external === "string") window.open(e.data.external, "_blank", "noopener");
  });
  show(current);
})();
</script>
</body></html>`;
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
