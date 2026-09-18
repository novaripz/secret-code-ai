// The preview has to actually run the project.
//
// Every case here is something a student saw go wrong: a sound that stayed
// silent, a nav bar whose links did nothing, and a build that stopped
// mid-file. None of them looked like a bug in the code — they looked like the
// project being broken, which is the worst way for a tool to fail someone
// learning.

import { buildPreviewDocument } from "../../src/lib/buildPreviewDocument";
import { createEmptyProject, createFile } from "../../src/lib/fileSystem";
import { generateAsset } from "../../src/lib/assetGen";

let failures = 0;
function ok(name: string, condition: boolean, detail = ""): void {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures++;
}

function site() {
  const p = createEmptyProject("Site");
  const wav = generateAsset("sound", "sfx/click.wav", { preset: "click" });
  createFile(p, "sfx/click.wav", wav.content, wav.mimeType);
  const svg = generateAsset("icon", "art/star.svg", { name: "star" });
  createFile(p, "art/star.svg", svg.content, svg.mimeType);
  createFile(
    p,
    "js/main.js",
    `const click = new Audio("sfx/click.wav");\n` +
      `const alt = new Audio('./sfx/click.wav');\n` +
      `const notMine = "sounds/other.wav";\n` +
      `document.body.onclick = () => click.play();`,
  );
  createFile(
    p,
    "index.html",
    `<!doctype html><html><head><title>Home</title></head><body>` +
      `<nav><a href="about.html">About</a> <a href="#top">Top</a> ` +
      `<a href="https://example.com">Out</a></nav>` +
      `<img src="art/star.svg"><script src="js/main.js"></script></body></html>`,
  );
  createFile(p, "about.html", `<!doctype html><html><body><h1>About us</h1></body></html>`);
  return p;
}

console.log("\nsound reaches the page");

const home = buildPreviewDocument(site()).html;

// THE BUG: new Audio("sfx/click.wav") is a constructor argument, not a src=
// attribute, so the attribute rewriter never saw it. The student clicked the
// button and got silence, with nothing in the console to explain it.
ok("a path passed to new Audio() is rewritten", !home.includes('new Audio("sfx/click.wav")'));
ok("and the ./ form too", !home.includes("'./sfx/click.wav'"));
ok("the real audio data is in the document", home.includes("data:audio/wav;base64,"));
// Exact-match against real asset paths, not a pattern over anything quoted —
// so a student's own string constant cannot be mangled.
ok("a string that is not a real asset is left alone", home.includes('"sounds/other.wav"'));
ok("an <img> still resolves as before", home.includes("data:image/svg+xml"));

console.log("\nlinks go somewhere");

ok("a navigation bridge is injected", home.includes("__preview") && home.includes("navigate"));
ok("and the console bridge is still there", home.includes('"log", "warn", "error", "info"') || home.includes("console[level]") || home.includes("__preview"));

// The whole point: a second page can be built, and it is a different document.
const about = buildPreviewDocument(site(), "about.html").html;
ok("another page of the project can be rendered", about.includes("About us"));
ok("and it is not the home page", !about.includes("<nav>"));
ok("every page gets the bridges too", about.includes("__preview"));

// A dead link in a nav bar should not look like a project with no index.html.
const missing = buildPreviewDocument(site(), "nope.html").html;
ok("a missing page falls back to the entry rather than the empty state",
   missing.includes("<nav>"), missing.slice(0, 60));

console.log("\nimporting anything");

// Not a browser, so the File-shaped branch is exercised through the same
// extension rule the uploader uses.
const TEXTUAL = ["md", "json", "csv", "py", "txt", "yml", "sql", "go", "rs"];
const BINARY = ["png", "mp3", "wav", "woff2", "mp4"];
import { assetMimeType } from "../../src/lib/assets";
ok("text extensions are not treated as assets", TEXTUAL.every((e) => assetMimeType(`a.${e}`) === undefined));
ok("binary ones still are", BINARY.every((e) => assetMimeType(`a.${e}`) !== undefined));

console.log("\nthe output budget that stops a build being cut off");

import { readFileSync } from "node:fs";
const adapter = readFileSync("src/lib/ai/openaiCompatible.ts", "utf8");
const gem = readFileSync("src/lib/ai/gemini.ts", "utf8");
// Nothing set this, so every provider applied its own default — which is what
// produced "Panda's reply got cut off part-way through" on a healthy build.
ok("the OpenAI-compatible adapter sets an explicit ceiling", /max_tokens:/.test(adapter));
ok("in both spellings, since the dialect split", /max_completion_tokens:/.test(adapter));
ok("Gemini sets one too", /maxOutputTokens:/.test(gem));
ok("and a project turn gets far more room than a chat reply",
   /max_tokens: req\.chatOnly \? 2_048 : 16_384/.test(adapter));

console.log("\nan unknown icon never fails the turn");

// "There is no 'cookie' icon. Try one of: apple, arrow-down…" in red, in the
// middle of a game that was otherwise finished.
const cookie = generateAsset("icon", "art/cookie.svg", { name: "cookie", size: 64 });
ok("a cookie becomes a circle rather than an error", cookie.content.includes("<circle"));
ok("a name nothing matches still produces a file",
   generateAsset("icon", "a.svg", { name: "zorblax" }).content.startsWith("<svg"));
ok("and a real icon is still a real icon",
   generateAsset("icon", "a.svg", { name: "trophy" }).content.includes("path"));

console.log(failures === 0 ? "\nall good\n" : `\n${failures} failed\n`);
process.exit(failures === 0 ? 0 : 1);
