// The build workspace's own logic, checked without a browser.
//
// Each block below is a bug a student hit. They are tested here, as plain
// functions, because every one of them was invisible until it had already
// cost somebody work: a rename that half-happened and was saved that way, a
// tab left open on a deleted file, a zip that imported into the wrong folder.
//
// Run with `npm run check`.

import JSZip from "jszip";
import {
  createEmptyProject,
  createFile,
  createFolder,
  findByPath,
  isInsideItself,
  listAllFiles,
  moveNode,
  renameNode,
} from "../../src/lib/fileSystem";
import { validateOperations } from "../../src/lib/ai/validateOperations";
import {
  defaultFile,
  neighbourAfterClosing,
  reconcileTabs,
  renameActive,
  renameTabs,
  retargetPath,
} from "../../src/components/build/tabState";
import { importProjectFromZipDetailed, isZipJunk, wrappingFolder } from "../../src/lib/zip";
import {
  buildPreviewDocument,
  buildStandalonePage,
  listPages,
  resolvePreviewPage,
} from "../../src/lib/buildPreviewDocument";
import { MAX_ASSET_BYTES } from "../../src/lib/assets";
import { replaceAll, searchFiles } from "../../src/components/build/findInFiles";
import { TEMPLATES, projectFromTemplate } from "../../src/components/build/templates";

let failures = 0;
function ok(name: string, condition: boolean, detail = ""): void {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures++;
}
function throws(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}
const snapshot = (p: ReturnType<typeof createEmptyProject>) =>
  JSON.stringify(
    Object.values(p.files)
      .map((f) => [f.path, f.kind, f.parentId === null ? null : (p.files[f.parentId]?.path ?? "?"), f.content ?? null])
      .sort(),
  );

console.log("\nrenaming a folder into itself");

{
  const p = createEmptyProject("Game");
  createFile(p, "game/index.html", "<h1>hi</h1>");
  createFile(p, "game/js/main.js", "let x = 1;");
  const before = snapshot(p);

  const err = throws(() => renameNode(p, "game", "game/v1"));
  ok("is refused", err !== null, err ?? "");
  ok("and says why in plain words", /inside itself/.test(err ?? ""), err ?? "");
  ok("and changes nothing at all — no half-made folder left behind", snapshot(p) === before);
  ok("deeper is refused too", throws(() => renameNode(p, "game", "game/js/old")) !== null && snapshot(p) === before);
  ok("a sibling whose name starts the same is fine", throws(() => renameNode(p, "game", "game-old")) === null);
  ok("and moved everything with it", findByPath(p, "game-old/js/main.js")?.content === "let x = 1;");
  ok("renaming to the same path is a harmless no-op", throws(() => renameNode(p, "game-old", "game-old")) === null);
  ok("isInsideItself agrees", isInsideItself("a", "a/b") && isInsideItself("a", "a") && !isInsideItself("a", "ab/c"));
}

console.log("\na file is never also a folder");

{
  const p = createEmptyProject("Clash");
  createFile(p, "foo", "I am a file");
  const before = snapshot(p);
  const err = throws(() => createFile(p, "foo/x.js", ""));
  ok("creating foo/x.js when a FILE foo exists is refused", err !== null, err ?? "");
  ok("and no second node called foo appears", snapshot(p) === before && listAllFiles(p).length === 1);
  createFile(p, "a.js", "");
  ok("renaming a file to sit under another file is refused cleanly",
     throws(() => renameNode(p, "a.js", "foo/a.js")) !== null && findByPath(p, "a.js") !== undefined);
}

console.log("\nmoving by drag and drop");

{
  const p = createEmptyProject("Move");
  createFile(p, "style.css", "body{}");
  createFolder(p, "css");
  createFile(p, "art/sprites/cat.svg", "<svg/>");
  ok("a file moves into a folder", moveNode(p, "style.css", "css").path === "css/style.css" && !findByPath(p, "style.css"));
  ok("and back to the top level", moveNode(p, "css/style.css", "").path === "style.css");
  ok("a folder cannot be dropped into its own child", throws(() => moveNode(p, "art", "art/sprites")) !== null);
  ok("and the tree is untouched afterwards", findByPath(p, "art/sprites/cat.svg") !== undefined);
  ok("dropping onto a file is refused", throws(() => moveNode(p, "art", "style.css")) !== null);
  ok("a path written ./like-this finds the file", findByPath(p, "./style.css")?.path === "style.css");
}

console.log("\nPanda cannot propose the impossible");

{
  const { valid, errors } = validateOperations([
    { type: "rename", path: "game", newPath: "game/v1" },
    { type: "rename", path: "game", newPath: "game" },
    { type: "rename", path: "game", newPath: "game-v1" },
  ]);
  ok("a rename into itself is rejected before the student sees it", errors.length === 2, errors.join(" | "));
  ok("a normal rename still goes through", valid.length === 1 && valid[0].newPath === "game-v1");
}

console.log("\ntabs follow their files");

{
  const tabs = [
    { path: "index.html", dirty: false },
    { path: "styles/main.css", dirty: true },
    { path: "styles-old.css", dirty: false },
    { path: "js/app.js", dirty: false },
  ];
  const renamed = renameTabs(tabs, "styles", "css");
  ok("renaming a folder moves the tabs inside it", renamed[1].path === "css/main.css" && renamed[1].dirty);
  ok("but not a sibling that only starts with the same letters", renamed[2].path === "styles-old.css");
  ok("the active tab moves too", renameActive("styles/main.css", "styles", "css") === "css/main.css");
  ok("retargetPath leaves unrelated paths alone", retargetPath("index.html", "styles", "css") === null);

  const exists = (p: string) => p !== "js/app.js" && p !== "styles/main.css";
  const after = reconcileTabs(tabs, "js/app.js", exists);
  ok("a deleted file's tab closes", after.tabs.every((t) => exists(t.path)) && after.tabs.length === 2);
  ok("and the editor moves to the neighbour instead of going blank", after.activeTab === "styles-old.css", String(after.activeTab));
  ok("closing the active tab picks the one to its right",
     neighbourAfterClosing(tabs, "styles/main.css", (p) => p === "styles/main.css") === "styles-old.css");
  ok("or the left when it was last", neighbourAfterClosing(tabs, "js/app.js", (p) => p === "js/app.js") === "styles-old.css");
  ok("and nothing when nothing is left", neighbourAfterClosing([tabs[0]], "index.html", () => true) === null);
  ok("an untouched active tab stays put", neighbourAfterClosing(tabs, "index.html", (p) => p === "js/app.js") === "index.html");

  ok("a project opens on index.html", defaultFile(["js/a.js", "index.html", "style.css"]) === "index.html");
  ok("or its shallowest page", defaultFile(["pages/b.html", "a/b/c.html", "x.js"]) === "pages/b.html");
  ok("or its first code file", defaultFile(["art/cat.png", "game.js"]) === "game.js");
  ok("and nothing only when it is empty", defaultFile([]) === null);
}

console.log("\nzips from a real computer");

ok("the macOS shadow folder is junk", isZipJunk("__MACOSX/game/._index.html") && isZipJunk("game/.DS_Store"));
ok("a real file is not", !isZipJunk("game/index.html") && !isZipJunk("css/main.css"));
ok("one wrapping folder is found", wrappingFolder(["game", "game/index.html", "game/js/a.js", "__MACOSX/game/._a"]) === "game");
ok("a flat zip has none", wrappingFolder(["index.html", "js/a.js"]) === null);
ok("two top folders mean no wrapper", wrappingFolder(["a/x.html", "b/y.html"]) === null);

async function zipImport(): Promise<void> {
  const zip = new JSZip();
  zip.file("my-game/index.html", "<h1>hi</h1>");
  zip.file("my-game/js/main.js", "let a = 1;");
  zip.file("my-game/.DS_Store", "junk");
  zip.file("__MACOSX/my-game/._index.html", "junk");
  zip.file("my-game/art/huge.png", new Uint8Array(MAX_ASSET_BYTES + 10));
  const bytes = await zip.generateAsync({ type: "uint8array" });
  // The same node shim assets.test.ts uses: JSZip reads bytes as happily as a File.
  const asFile = Object.assign(bytes, { name: "my-game.zip" }) as unknown as File;
  const { project, skipped } = await importProjectFromZipDetailed(asFile);
  const paths = listAllFiles(project).map((f) => f.path).sort();
  ok("the wrapping folder is stripped, so index.html is at the top", findByPath(project, "index.html") !== undefined, paths.join(", "));
  ok("macOS and Finder junk stays out", !paths.some((p) => p.includes("DS_Store") || p.includes("MACOSX")));
  ok("an asset over the size limit is left out", findByPath(project, "art/huge.png") === undefined);
  ok("and the student is told why", skipped.length === 1 && /limit/.test(skipped[0]), skipped.join(" | "));
}

console.log("\nthe preview runs what was written");

{
  const p = createEmptyProject("Preview");
  createFile(
    p,
    "index.html",
    `<!doctype html>\n<html>\n<head>\n<script src="js/late.js" defer></script>\n</head>\n<body>\n<h1>Hi</h1>\n` +
      `<script src="js/game.js"></script>\n<script src="js/typo.js"></script>\n<script>\nconsole.log("inline");\n</script>\n</body>\n</html>\n`,
  );
  createFile(p, "js/game.js", `const html = "</script><b>still code</b>";\nconsole.log(html);`);
  createFile(p, "js/late.js", `document.querySelector("h1").textContent = "Ready";`);
  createFile(p, "pages/about.html", `<a href="contact.html">Contact</a>`);
  createFile(p, "pages/contact.html", `<h1>Contact</h1>`);
  createFile(p, "blog/index.html", `<h1>Blog</h1>`);

  const doc = buildPreviewDocument(p);
  ok("a </script> inside a string no longer ends the script early", doc.html.includes(`"<\\/script><b>still code</b>"`));
  ok("each inlined file is named for the browser's error messages", doc.html.includes("//# sourceURL=js/game.js"));
  ok("and so is the page's own inline script, with the line it starts on", /sourceURL=index\.html\?inline=10/.test(doc.html));
  const late = doc.html.indexOf('data-inlined-from="js/late.js"');
  ok("a deferred script runs after the body exists, as defer promised", late > doc.html.indexOf("<h1>Hi</h1>"));
  ok("a script that is not in the project is reported", doc.missing.includes("js/typo.js"), doc.missing.join(", "));

  // The bridges are one line, so they push nothing down: the doctype line and
  // the line after <head> must still be where the student wrote them.
  const original = findByPath(p, "index.html")!.content!.split("\n");
  const built = doc.html.split("\n");
  ok("the injected bridges add no lines before the student's code",
     built[5] === original[5] && built[6] === original[6] && built[2].startsWith("<head>"),
     JSON.stringify(built.slice(5, 7)));

  ok("a link from a subfolder page resolves against that page",
     resolvePreviewPage(p, "pages/about.html", "contact.html") === "pages/contact.html");
  ok("a root-relative link resolves from the top", resolvePreviewPage(p, "pages/about.html", "/index.html") === "index.html");
  ok("../ climbs out of the folder", resolvePreviewPage(p, "pages/about.html", "../blog/") === "blog/index.html");
  ok("a link to a folder means its index.html", resolvePreviewPage(p, "index.html", "blog") === "blog/index.html");
  ok("every page is listed, home first", listPages(p)[0] === "index.html" && listPages(p).length === 4);

  const standalone = buildStandalonePage(p);
  ok("the new-tab copy still sandboxes the student's code", /<iframe[^>]+sandbox="allow-scripts allow-forms allow-modals"/.test(standalone));
  ok("and never grants it the app's origin", !/allow-same-origin/.test(standalone));
  ok("and carries every page so its links keep working", standalone.includes("pages/contact.html"));
  ok("and nothing in the carried pages can close its script tag", !/<\/script>(?![\s\S]*<\/body>)/.test(standalone.slice(0, standalone.lastIndexOf("</script>"))));
}

console.log("\nfind in files");

{
  const files = [
    { path: "game.js", content: "let score = 0;\nfunction addScore() {\n  score += 1; // Score!\n}\nconst highscore = 9;" },
    { path: "index.html", content: "<p id=\"score\">Score: 0</p>" },
    { path: "art/cat.png", content: "data:image/png;base64,c2NvcmU=" },
  ];
  const plain = searchFiles(files, { query: "score", caseSensitive: false, wholeWord: false, regex: false });
  ok("finds every match across files", plain.total === 7, `${plain.total}`);
  ok("and never inside a picture's data", !plain.results.some((r) => r.path.endsWith(".png")));
  ok("with the line and column the editor will select", plain.results[0].matches[0].line === 1 && plain.results[0].matches[0].col === 5);
  const exact = searchFiles(files, { query: "score", caseSensitive: true, wholeWord: true, regex: false });
  ok("match case + whole word skip addScore, Score and highscore", exact.total === 3, `${exact.total}`);
  const bad = searchFiles(files, { query: "(", caseSensitive: false, wholeWord: false, regex: true });
  ok("a broken regex is reported, not thrown", bad.total === 0 && typeof bad.error === "string");
  const empty = searchFiles(files, { query: "^", caseSensitive: false, wholeWord: false, regex: true });
  ok("a pattern that matches nothing-wide does not loop forever", empty.total === 0);

  const opts = { query: "score", caseSensitive: true, wholeWord: true, regex: false };
  const replaced = replaceAll(files[0].content, opts, "points");
  ok("replace changes only the whole-word matches", replaced.count === 2 && replaced.text.includes("addScore") && replaced.text.includes("highscore"));
  ok("a $ in a plain replacement is a dollar sign", replaceAll("price", { ...opts, query: "price" }, "$5").text === "$5");
  ok("$1 means a group when regex is on",
     replaceAll("width: 10px", { query: "(\\d+)px", caseSensitive: false, wholeWord: false, regex: true }, "$1rem").text === "width: 10rem");
}

console.log("\nstarting points");

for (const template of TEMPLATES) {
  const project = projectFromTemplate(template.id, "");
  const doc = buildPreviewDocument(project);
  ok(`"${template.title}" makes a project with a page that runs`, doc.entryFound && doc.missing.length === 0, doc.missing.join(", "));
  ok(`"${template.title}" is named sensibly when left blank`, project.name === template.defaultName);
}
ok("the multi-page site's links resolve to real pages",
   ["about.html", "contact.html"].every((p) => findByPath(projectFromTemplate("multipage", "x"), resolvePreviewPage(projectFromTemplate("multipage", "x"), "index.html", p))));

async function main(): Promise<void> {
  await zipImport();
  console.log(failures === 0 ? "\nall good\n" : `\n${failures} failed\n`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
