// Generating real files from a description.
//
// The model emits text; an image and a sound are bytes. These generators close
// that gap, and every case here is a way the feature could look finished and
// not be: a WAV whose header lies about its own length plays as silence, an SVG
// whose star is computed slightly wrong is lopsided in a way nobody notices
// until it is on screen, and a spec that reaches the renderer unchecked is a
// string being interpolated into markup.

import { generateAsset, SOUND_PRESETS } from "../../src/lib/assetGen";
import { renderSamples, renderWav } from "../../src/lib/assetGen/sound";
import { renderShape } from "../../src/lib/assetGen/shapes";
import { validateOperations } from "../../src/lib/ai/validateOperations";
import { assetByteSize, isAssetNode } from "../../src/lib/assets";

let failures = 0;
function ok(name: string, condition: boolean, detail = ""): void {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures++;
}

const b64 = (dataUrl: string) => dataUrl.slice(dataUrl.indexOf(",") + 1);
function bytesOf(dataUrl: string): Uint8Array {
  return Uint8Array.from(Buffer.from(b64(dataUrl), "base64"));
}

console.log("\na generated sound is a real WAV");

const click = renderWav(SOUND_PRESETS.click);
const bytes = bytesOf(click);
const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const ascii = (at: number, len: number) =>
  String.fromCharCode(...Array.from(bytes.slice(at, at + len)));

ok("it is a data URL a browser will accept", click.startsWith("data:audio/wav;base64,"));
ok("RIFF/WAVE header", ascii(0, 4) === "RIFF" && ascii(8, 4) === "WAVE");
ok("declares uncompressed PCM", view.getUint16(20, true) === 1);
ok("mono, 16-bit, 22050Hz",
   view.getUint16(22, true) === 1 && view.getUint16(34, true) === 16 && view.getUint32(24, true) === 22050);
// A header that lies about its own length is the classic way to ship a WAV
// that plays as silence, and it is invisible until someone tries to play it.
ok("the RIFF size matches the real file", view.getUint32(4, true) === bytes.length - 8);
ok("the data chunk size matches too", view.getUint32(40, true) === bytes.length - 44);
ok("byte rate is consistent with the format", view.getUint32(28, true) === 22050 * 2);

const samples = renderSamples(SOUND_PRESETS.click);
ok("it contains actual audio, not silence", samples.some((s) => Math.abs(s) > 1000));
// A sound cut off mid-swing leaves a step in the waveform that every speaker
// reproduces as a click — arriving on sounds that did not ask for one.
ok("and it ends at rest, so it does not click on stopping",
   Math.abs(samples[samples.length - 1]) < 500, `${samples[samples.length - 1]}`);
ok("a click is short", samples.length < 22050 * 0.2, `${samples.length} samples`);
ok("every preset produces audio",
   Object.keys(SOUND_PRESETS).every((k) => renderSamples(SOUND_PRESETS[k]).some((s) => Math.abs(s) > 500)),
   Object.keys(SOUND_PRESETS).join(", "));

// Determinism is what makes a regenerated asset show as "no change" rather than
// as a mysterious diff, and it is what makes every check above repeatable.
ok("the same spec always gives the same bytes", renderWav(SOUND_PRESETS.hit) === renderWav(SOUND_PRESETS.hit));
ok("noise is seeded, not random",
   renderWav({ waveform: "noise", seconds: 0.2 }) === renderWav({ waveform: "noise", seconds: 0.2 }));
ok("a long sound is capped rather than refused", renderSamples({ seconds: 999 }).length <= 22050 * 5);
ok("a sound stays small", assetByteSize(click) < 12_000, `${assetByteSize(click)} bytes`);

console.log("\na generated shape is a real SVG");

const star = renderShape({ kind: "star", points: 5, size: 120, fill: "#ffd700" });
ok("it is an svg element", star.startsWith("<svg") && star.trimEnd().endsWith("</svg>"));
ok("with the size asked for", star.includes('viewBox="0 0 120 120"'));
ok("and the colour asked for", star.includes("#ffd700"));
// Ten vertices: five outer points and five inner. A star drawn with the wrong
// count is the failure that looks almost right.
ok("a five-pointed star has ten vertices",
   (star.match(/points="([^"]+)"/)?.[1].trim().split(/\s+/).length ?? 0) === 10);
ok("every coordinate is a real number", !/NaN|Infinity|undefined/.test(star));

for (const kind of ["circle", "rect", "star", "polygon", "triangle", "heart", "gear", "blob"] as const) {
  const svg = renderShape({ kind, size: 64 });
  ok(`${kind} renders cleanly`, svg.startsWith("<svg") && !/NaN|undefined/.test(svg));
}
ok("a gradient is produced when a second colour is given",
   renderShape({ fill: "#fff", fill2: "#000" }).includes("linearGradient"));
ok("a blob is deterministic", renderShape({ kind: "blob" }) === renderShape({ kind: "blob" }));
// The colour is interpolated into an attribute in a file the preview inlines
// into a document, so it is validated rather than escaped.
ok("a hostile colour cannot escape the attribute",
   !renderShape({ fill: '" onload="alert(1)' }).includes("onload"));
// A bare word is accepted rather than rejected: the pattern is anchored and
// letters-only, so "ultramarine" cannot break out of the attribute, and SVG
// renders an unknown name as black — visible, harmless, and obviously wrong to
// the student, which is a better failure than a shape that does not appear.
// Anything with punctuation in it is the real risk and is what falls back.
ok("an unknown colour word is passed through safely",
   renderShape({ fill: "ultramarine" }).includes('fill="ultramarine"'));
ok("but a colour with punctuation falls back to the default",
   renderShape({ fill: "red;x:1" }).includes("#7dd3fc"));
ok("and so does one with a bracket",
   renderShape({ fill: "url(#evil)" }).includes("#7dd3fc"));

console.log("\nthe operation is guarded before it runs");

const good = validateOperations([
  { type: "generate", path: "art/star.svg", generator: "shape", spec: { kind: "star", points: 5 } },
] as never);
ok("a good generate op passes", good.valid.length === 1 && good.errors.length === 0);
ok("and keeps its generator and spec",
   good.valid[0].generator === "shape" && (good.valid[0].spec as Record<string, unknown>).kind === "star");

const bad = validateOperations([
  { type: "generate", path: "art/x.svg", generator: "malware" },
  { type: "generate", path: "../../etc/evil.svg", generator: "shape" },
  { type: "generate", path: "art/y.svg", generator: "shape", spec: "not an object" },
] as never);
ok("an unknown generator is refused", bad.errors.length === 3, bad.errors.join(" | "));
ok("and nothing survives", bad.valid.length === 0);

// Nested structure is flattened away rather than reaching the renderer.
const nested = validateOperations([
  { type: "generate", path: "a.svg", generator: "shape", spec: { kind: "star", evil: { a: 1 }, fn: [1, 2] } },
] as never);
ok("only scalars reach the generator",
   Object.keys(nested.valid[0].spec as object).length === 1, JSON.stringify(nested.valid[0].spec));

console.log("\na fabricated binary file is refused");

// Production answered "add a settings gear icon and a click sound" with
// `create art/settings.png` and `create sfx/click.mp3` — plausible paths,
// invented contents, and a page that loads a broken image and a silent button.
// The prompt now forbids it; this is the part that enforces it.
const fabricated = validateOperations([
  { type: "create", path: "art/settings.png", content: "<!-- icon -->" },
  { type: "create", path: "sfx/click.mp3", content: "" },
] as never);
ok("an invented png is refused", fabricated.valid.length === 0, fabricated.errors.join(" | "));
ok("and the message says what to do instead", /generated|\.svg|\.wav/.test(fabricated.errors.join(" ")));

// The two legitimate ways a binary file does arrive must still work.
const uploaded = validateOperations([
  { type: "create", path: "art/logo.png", content: "data:image/png;base64,iVBORw0KGgo=" },
] as never);
ok("a real data URL still writes", uploaded.valid.length === 1);
const handwritten = validateOperations([
  { type: "create", path: "art/icon.svg", content: "<svg xmlns='http://www.w3.org/2000/svg'></svg>" },
] as never);
ok("and a hand-written svg still writes, because svg is text", handwritten.valid.length === 1);

console.log("\nend to end, the file lands as a usable asset");

const svgFile = generateAsset("shape", "art/heart.svg", { kind: "heart", fill: "red" });
ok("a shape comes back as svg", svgFile.mimeType === "image/svg+xml" && svgFile.content.startsWith("<svg"));
const wavFile = generateAsset("sound", "sfx/coin.wav", { preset: "coin" });
ok("a sound comes back as an asset node", isAssetNode({ content: wavFile.content, mimeType: wavFile.mimeType }));
ok("with the right type", wavFile.mimeType === "audio/wav");

// The extension is the contract: a .wav full of SVG, or an .svg full of audio,
// would be stored happily and then never play or render.
ok("a shape refuses a non-svg path", (() => {
  try { generateAsset("shape", "art/star.png", {}); return false; } catch { return true; }
})());
ok("a sound refuses a non-wav path", (() => {
  try { generateAsset("sound", "sfx/click.mp3", {}); return false; } catch { return true; }
})());
ok("an unknown preset names the ones that exist", (() => {
  try { generateAsset("sound", "a.wav", { preset: "nope" }); return false; }
  catch (e) { return /click/.test(String(e)); }
})());

console.log(failures === 0 ? "\nall good\n" : `\n${failures} failed\n`);
process.exit(failures === 0 ? 0 : 1);
