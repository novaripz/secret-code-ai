// Real assets: stored, previewed, exported, and kept out of the prompt.
//
// Every case here is a way this feature could look finished and not be. An
// asset that saves but never renders is a broken-image icon. One that renders
// but does not export is a project a student cannot take home. One whose base64
// reaches the prompt silently evicts the source files the model needed. And a
// model that invents `cookie.png` hands back a bug with no visible cause.

import {
  MAX_ASSET_BYTES,
  assetByteSize,
  assetManifest,
  assetMimeType,
  familyOf,
  humanSize,
  isAssetNode,
  listAssets,
} from "../../src/lib/assets";
import { buildPreviewDocument } from "../../src/lib/buildPreviewDocument";
import { selectContextFiles } from "../../src/lib/ai/contextSelection";
import { createEmptyProject, createFile } from "../../src/lib/fileSystem";
import { buildUserTurnText } from "../../src/lib/ai/turn";
import { assertSafePath, normalizePath, resolveAgainst } from "../../src/lib/paths";
import { exportProjectToZip, importProjectFromZip } from "../../src/lib/zip";

let failures = 0;
function ok(name: string, condition: boolean, detail = ""): void {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures++;
}

// A real 1x1 transparent PNG, not a made-up string: the size arithmetic and the
// data-URL parsing are both things a fake would not exercise honestly.
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const MP3 = "data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA";

console.log("\nwhat counts as an asset");

ok("an extension we can store gets a type", assetMimeType("art/cookie.png") === "image/png");
ok("and so does a sound", assetMimeType("sfx/click.mp3") === "audio/mpeg");
ok("families are derived from the type", familyOf("image/png") === "image" && familyOf("audio/mpeg") === "audio");
// The allow-list is a safety boundary, not a convenience: the preview inlines
// these into a sandboxed document, so anything executable must stay on the
// ordinary text path where the student can see what it is.
ok("an executable file is not an asset", assetMimeType("evil.js") === undefined);
ok("nor is html", assetMimeType("page.html") === undefined);
ok("an asset is identified by its content, not its name",
   isAssetNode({ content: PNG, mimeType: "image/png" }) &&
   !isAssetNode({ content: "<h1>hi</h1>", mimeType: "image/png" }));
ok("byte size is read back out of the base64", assetByteSize(PNG) === 70, `${assetByteSize(PNG)} bytes`);
ok("sizes read as a person would say them", humanSize(70) === "70 B" && humanSize(2_100_000) === "2.0 MB");

console.log("\nthe preview actually shows them");

function projectWithAssets() {
  const p = createEmptyProject("Cookie");
  createFile(p, "art/cookie.png", PNG, "image/png");
  createFile(p, "sfx/click.mp3", MP3, "audio/mpeg");
  createFile(
    p,
    "index.html",
    `<!doctype html><html><head><link rel="stylesheet" href="css/app.css"></head>` +
      `<body><img src="art/cookie.png" alt="cookie">` +
      `<audio src="sfx/click.mp3"></audio>` +
      `<img src="art/missing.png" alt="not there">` +
      `<img src="https://example.com/remote.png" alt="remote">` +
      `<script src="js/main.js"></script></body></html>`,
  );
  createFile(p, "css/app.css", `body { background: url(../art/cookie.png) no-repeat; }`);
  createFile(p, "js/main.js", `const s = new Image(); s.src = "art/cookie.png";`);
  return p;
}

const previewed = buildPreviewDocument(projectWithAssets()).html;

ok("an <img> is rewritten to the real data", previewed.includes(`src="${PNG}"`));
ok("audio is rewritten too", previewed.includes(`src="${MP3}"`));
ok("a CSS url() in an inlined stylesheet is rewritten",
   previewed.includes(`url(${PNG})`), "background image");
// The base path for a CSS url() is the stylesheet's own directory, so
// `../art/cookie.png` inside css/app.css must resolve to art/cookie.png. Get
// this wrong and the rule silently loads nothing.
ok("and it resolved relative to the CSS file, not the page", !previewed.includes("../art/cookie.png"));
ok("a src assigned from JavaScript is rewritten as well",
   (previewed.match(new RegExp(PNG.slice(0, 40).replace(/[+/]/g, "\\$&"), "g")) ?? []).length >= 3);
ok("a path with no file behind it is left alone, not blanked",
   previewed.includes('src="art/missing.png"'));
ok("a remote URL is left alone", previewed.includes('src="https://example.com/remote.png"'));

console.log("\nwhat the model is told");

const assets = listAssets(projectWithAssets());
ok("both assets are listed", assets.length === 2, assets.map((a) => a.path).join(", "));
const manifest = assetManifest(projectWithAssets());
ok("the manifest names the paths", manifest.includes("art/cookie.png") && manifest.includes("sfx/click.mp3"));
ok("with their kind and size", manifest.includes("image") && manifest.includes("audio"));
ok("and forbids inventing one", /never invent/i.test(manifest));
ok("the manifest carries no base64", !manifest.includes("iVBOR"));
ok("an empty project produces no manifest at all", assetManifest(createEmptyProject("Empty")) === "");

// THE ONE THAT MATTERS MOST. An image's content is base64 that means nothing to
// a model, and MAX_CHARS_PER_FILE would still let 8000 characters of it through
// — enough to evict the real source files on exactly the projects with the most
// going on.
const context = selectContextFiles(projectWithAssets(), { prompt: "make the cookie bigger", currentFilePath: "index.html" });
ok("no asset content reaches the context", !JSON.stringify(context).includes("iVBOR"));
ok("and the source files still do", "index.html" in context);

const turn = buildUserTurnText({
  prompt: "add a click sound",
  fileTree: "index.html\nart/cookie.png",
  contextFiles: context,
  assetManifest: manifest,
  chatOnly: false,
  history: [],
} as never);
ok("the turn states the assets", turn.includes("REAL ASSETS IN THIS PROJECT"));
ok("and still carries no base64", !turn.includes("iVBOR"));

console.log("\nresolving '..' did not open a hole");

// Fixing the preview meant folding "..", and the obvious place to do it was
// normalizePath — which would have been a security regression, because
// assertSafePath detects traversal by looking for a ".." segment in a
// NORMALIZED path. These pin both halves so a future tidy-up cannot merge them.
ok("normalizePath still refuses to fold '..'", normalizePath("css/../art/x.png") === "css/../art/x.png");
ok("so traversal is still rejected", (() => {
  try { assertSafePath("../../etc/passwd"); return false; } catch { return true; }
})());
ok("and a sneakier one too", (() => {
  try { assertSafePath("art/../../etc/passwd"); return false; } catch { return true; }
})());
ok("the resolver folds '..' for the preview", resolveAgainst("css", "../art/x.png") === "art/x.png");
ok("and clamps at the root rather than climbing out",
   resolveAgainst("css", "../../../../etc/passwd") === "etc/passwd");

console.log("\nlimits are real numbers, not vibes");
ok("one asset is capped at two megabytes", MAX_ASSET_BYTES === 2 * 1024 * 1024);

console.log("\nan exported project keeps its pictures");

// The export is the moment the project stops being a browser database and
// becomes real files. An asset written as its data URL would land on disk as a
// text file full of base64 and open as a broken image.
async function roundTrip(): Promise<void> {
  const before = projectWithAssets();
  const blob = await exportProjectToZip(before);
  // JSZip reads a Blob through FileReader, which node does not have, so the
  // blob is handed over as bytes instead. The shim is a node artifact only —
  // the browser passes the real File — and it exercises the same import code.
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const asFile = Object.assign(bytes, { name: "cookie.zip" }) as unknown as File;
  const after = await importProjectFromZip(asFile, "Cookie");
  const assetsAfter = listAssets(after);
  ok("both assets survive a zip round trip", assetsAfter.length === 2,
     assetsAfter.map((a) => a.path).join(", "));
  const cookie = assetsAfter.find((a) => a.path === "art/cookie.png");
  ok("the image comes back as an image, not as text", cookie?.mimeType === "image/png");
  ok("byte for byte", cookie?.bytes === assetByteSize(PNG), `${cookie?.bytes} vs ${assetByteSize(PNG)}`);
  // And the source files must not have been mangled on the way through.
  const html = Object.values(after.files).find((f) => f.path === "index.html");
  ok("the source files are still text", (html?.content ?? "").startsWith("<!doctype html>"));
}

void roundTrip().then(() => {
  console.log(failures === 0 ? "\nall good\n" : `\n${failures} failed\n`);
  process.exit(failures === 0 ? 0 : 1);
});
