// The icon set, the patterns, the palettes and the synthesiser.
//
// The first version of the generators drew four shapes and made one-oscillator
// beeps, and it showed: every sound had the same character and anything with a
// name — a trophy, a rocket, a settings gear — fell back to an emoji. These
// check the parts that make the difference between a toy and a set of tools.

import {
  generateAsset,
  ICON_NAMES,
  MELODIES,
  PALETTES,
  PALETTE_NAMES,
  SOUND_PRESETS,
} from "../../src/lib/assetGen";
import { ICON_ALIASES, ICONS, resolveIconName } from "../../src/lib/assetGen/icons";
import { renderPattern } from "../../src/lib/assetGen/pattern";
import { renderSamples } from "../../src/lib/assetGen/sound";
import { chordFreqs, noteToFreq, parseMelody } from "../../src/lib/assetGen/music";
import { renderShape } from "../../src/lib/assetGen/shapes";

let failures = 0;
function ok(name: string, condition: boolean, detail = ""): void {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures++;
}

console.log("\nthe icon set");

ok("there are enough icons to answer a real ask", ICON_NAMES.length >= 60, `${ICON_NAMES.length}`);
ok("every icon has drawable geometry",
   ICON_NAMES.every((n) => /<(path|circle|rect|line|polyline|polygon|ellipse)\b/.test(ICONS[n])));
ok("and none smuggled a script or a style in from upstream",
   ICON_NAMES.every((n) => !/<(script|style|foreignObject|image)\b/i.test(ICONS[n])));
ok("nor any event handler", ICON_NAMES.every((n) => !/\son[a-z]+\s*=/i.test(ICONS[n])));

// Vocabulary, not geometry, is what made two thirds of real requests fail:
// production asked for a "settings gear" and got an alphabetical list starting
// at "apple".
const everyday = ["gear", "coin", "life", "win", "fire", "bolt", "enemy", "controller",
                  "sound", "idea", "death", "person", "time", "medal", "magic", "close", "tick"];
ok("the words a model actually uses all resolve",
   everyday.every((w) => resolveIconName(w) !== undefined),
   everyday.filter((w) => !resolveIconName(w)).join(", ") || "all");
ok("every alias points at an icon that exists",
   Object.values(ICON_ALIASES).every((target) => target in ICONS));
ok("a decorated name still resolves", resolveIconName("icon-heart") === "heart" && resolveIconName("star-icon") === "star");
ok("and an unknown one is refused rather than guessed", resolveIconName("qwertyuiop") === undefined);

const icon = generateAsset("icon", "art/t.svg", { name: "trophy", size: 48, stroke: "#ffd700" });
ok("an icon renders at the size asked for", icon.content.includes('width="48"'));
// The 24x24 viewBox is what the paths are drawn against; changing it with the
// size would scale the geometry off the canvas.
ok("and keeps the viewBox the paths were drawn against", icon.content.includes('viewBox="0 0 24 24"'));
ok("with the colour asked for", icon.content.includes("#ffd700"));
// Lucide is a STROKE set: filling an open path smears it, so "filled" strokes
// thickly with round joins instead.
ok("a filled icon is still stroked, not just filled",
   generateAsset("icon", "a.svg", { name: "heart", filled: true }).content.includes("stroke-linejoin"));

console.log("\ntiling patterns");

for (const kind of ["dots", "grid", "checker", "stripes", "diagonal", "waves", "stars", "hex"] as const) {
  const svg = renderPattern({ kind, size: 40 });
  ok(`${kind} renders`, svg.startsWith("<svg") && !/NaN|undefined/.test(svg));
}
ok("a pattern is emitted as a <pattern>, so it tiles at any element size",
   renderPattern({ kind: "dots" }).includes("patternUnits=\"userSpaceOnUse\""));
// The bug that only showed on screen: y = -x passes through the tile's corner
// and nowhere else, so the swatch rendered almost empty.
ok("diagonal actually puts ink in the tile",
   renderPattern({ kind: "diagonal" }).includes("rotate(45)"));
ok("a pattern stays small enough to be a background",
   renderPattern({ kind: "hex", size: 60 }).length < 1200);

console.log("\npalettes");

ok("there are palettes to choose from", PALETTE_NAMES.length >= 6);
ok("each defines the full set",
   PALETTE_NAMES.every((n) => {
     const p = PALETTES[n];
     return p.background && p.surface && p.text && p.accent && p.accent2;
   }));
// One word in a spec should colour a whole set of assets consistently.
const themed = renderShape({ kind: "star", fill: "accent", palette: "arcade" } as never);
ok("a palette token resolves to that palette's colour", themed.includes(PALETTES.arcade.accent));
ok("and works in a pattern too",
   renderPattern({ kind: "dots", palette: "forest" }).includes(PALETTES.forest.accent));
ok("an unknown palette falls back rather than failing",
   renderShape({ kind: "star", fill: "accent", palette: "nope" } as never).startsWith("<svg"));

console.log("\nnotes, chords and melodies");

// Equal temperament, anchored at A4 = 440.
ok("A4 is 440Hz", Math.round(noteToFreq("A4") ?? 0) === 440);
ok("an octave doubles", Math.round((noteToFreq("A5") ?? 0)) === 880);
ok("a semitone is the twelfth root of two",
   Math.abs((noteToFreq("A#4") ?? 0) / 440 - Math.pow(2, 1 / 12)) < 1e-9);
ok("flats and sharps are the same key", noteToFreq("A#4") === noteToFreq("Bb4"));
ok("a typo is skipped, not played at 0Hz", noteToFreq("H4") === undefined);

const melody = parseMelody("C5/8 E5/8 G5/4 R/8", 120);
ok("a melody parses to its notes", melody.length === 4);
ok("a quarter note is one beat at the given tempo", Math.abs(melody[2].seconds - 0.5) < 1e-9, `${melody[2].seconds}s`);
ok("an eighth is half of that", Math.abs(melody[0].seconds - 0.25) < 1e-9);
ok("a rest is silent but takes time", melody[3].freq === 0 && melody[3].seconds > 0);
ok("tempo re-times the whole thing", parseMelody("C5/4", 240)[0].seconds < parseMelody("C5/4", 120)[0].seconds);
ok("every named melody parses", Object.keys(MELODIES).every((k) => parseMelody(MELODIES[k]).length > 1));

const major = chordFreqs("C4", "major");
ok("a major chord is three notes", major.length === 3);
ok("with a major third at four semitones",
   Math.abs(major[1] / major[0] - Math.pow(2, 4 / 12)) < 1e-6);
ok("and a minor third at three", Math.abs(chordFreqs("C4", "minor")[1] / major[0] - Math.pow(2, 3 / 12)) < 1e-6);

console.log("\nthe synthesiser actually does something different per setting");

const plain = renderSamples({ freq: 440, seconds: 0.3, harmonics: 1 });
const rich = renderSamples({ freq: 440, seconds: 0.3, harmonics: 6 });
ok("harmonics change the waveform", !plain.every((v, i) => v === rich[i]));
// Normalising the partials is what stops `harmonics` doubling as a volume
// control, which would make every other setting unpredictable.
const peak = (s: Int16Array) => Math.max(...Array.from(s).map(Math.abs));
ok("without making a rich sound simply louder",
   Math.abs(peak(rich) - peak(plain)) / peak(plain) < 0.5, `${peak(plain)} vs ${peak(rich)}`);
ok("vibrato changes it too",
   !renderSamples({ freq: 440, seconds: 0.3 }).every((v, i) => v === renderSamples({ freq: 440, seconds: 0.3, vibrato: 8, vibratoDepth: 0.5 })[i]));
ok("punch adds a transient at the front",
   peak(renderSamples({ freq: 200, seconds: 0.3, punch: 1 }).slice(0, 400)) >
   peak(renderSamples({ freq: 200, seconds: 0.3, punch: 0 }).slice(0, 400)));
ok("sustain holds the note for longer",
   renderSamples({ freq: 440, seconds: 0.5, sustain: 0.3, decay: 20 }).filter((v) => Math.abs(v) > 3000).length >
   renderSamples({ freq: 440, seconds: 0.5, sustain: 0, decay: 20 }).filter((v) => Math.abs(v) > 3000).length);

// A melody has to be a sequence, not a chord: energy must appear at distinct
// times rather than all at once.
const tune = renderSamples({ melody: "C5/8 E5/8 G5/8", bpm: 140 });
const thirds = [0, 1, 2].map((i) =>
  peak(tune.slice(Math.floor((tune.length / 3) * i), Math.floor((tune.length / 3) * (i + 1)))));
ok("a melody puts sound in every part of its length", thirds.every((p) => p > 500), thirds.join(", "));
ok("and is longer than a single note", tune.length > renderSamples({ freq: 523, seconds: 0.2 }).length);

ok("every preset still makes audio",
   Object.keys(SOUND_PRESETS).every((k) => peak(renderSamples(SOUND_PRESETS[k])) > 500));
ok("and none of them clips",
   Object.keys(SOUND_PRESETS).every((k) => peak(renderSamples(SOUND_PRESETS[k])) <= 32767));
ok("a click is still short after all this",
   renderSamples(SOUND_PRESETS.click).length < 22050 * 0.25);
ok("and a fanfare is properly long",
   renderSamples(SOUND_PRESETS.fanfare).length > 22050 * 1.5);

console.log(failures === 0 ? "\nall good\n" : `\n${failures} failed\n`);
process.exit(failures === 0 ? 0 : 1);
