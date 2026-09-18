import { assetMimeType } from "@/lib/assets";
import { ICON_ALIASES, ICON_NAMES, ICONS, resolveIconName } from "./icons";
import { PALETTES, PALETTE_NAMES, resolveColor } from "./palette";
import { renderPattern, type PatternKind, type PatternSpec } from "./pattern";
import { renderShape, type ShapeKind, type ShapeSpec } from "./shapes";
import { MAX_SOUND_SECONDS, SOUND_PRESETS, soundFromSpec, type SoundSpec } from "./sound";
import { MELODIES } from "./music";

// The one entry point: a spec in, a real file out.
//
// This exists so the operation pipeline has a single thing to call and a single
// place where a bad spec is refused. Everything a generator can produce is
// deterministic — the same spec gives the same bytes — which is what makes a
// regenerated asset show as "no change" in the Changes panel rather than as a
// mysterious diff, and what makes the checks possible to write at all.

export type GeneratorName = "shape" | "sound" | "icon" | "pattern";

export interface GenerateResult {
  content: string;
  mimeType: string;
}

/**
 * One spec type covering every generator, because the operation carries a
 * single `spec` object and the model should not have to know which fields
 * belong to which renderer.
 *
 * `kind` is the one collision: a shape's kinds and a pattern's kinds are
 * different vocabularies that happen to share a field name. Widening it here
 * and narrowing at each call is honest about that — the alternative, renaming
 * one of them to `patternKind`, would make the model remember which generator
 * it is talking to in order to name a field, which is exactly the kind of
 * detail it gets wrong.
 */
export interface GenerateSpec extends Omit<ShapeSpec, "kind">, SoundSpec, Omit<PatternSpec, "kind"> {
  kind?: ShapeKind | PatternKind;
  preset?: string;
  /** icon only: which one. See ICON_NAMES. */
  name?: string;
  /** icon only: a filled icon instead of the drawn-line default. */
  filled?: boolean;
}

export { SOUND_PRESETS, MAX_SOUND_SECONDS, ICON_NAMES, PALETTE_NAMES, PALETTES, MELODIES };
export const SHAPE_KINDS = [
  "circle",
  "rect",
  "star",
  "polygon",
  "heart",
  "triangle",
  "gear",
  "blob",
] as const;

/**
 * Generates the file, or throws a sentence a student could read.
 *
 * Throwing rather than returning a fallback: a generated asset the student did
 * not ask for is worse than a refusal they can act on, and the operation layer
 * turns the message into the same "this change could not be applied" the other
 * failures use.
 */
export function generateAsset(
  generator: string,
  path: string,
  spec: GenerateSpec = {},
): GenerateResult {
  if (generator === "shape") {
    if (!path.toLowerCase().endsWith(".svg")) {
      throw new Error(`A generated shape has to be saved as .svg — "${path}" is not.`);
    }
    return { content: renderShape(spec as ShapeSpec), mimeType: "image/svg+xml" };
  }

  if (generator === "icon") {
    if (!path.toLowerCase().endsWith(".svg")) {
      throw new Error(`A generated icon has to be saved as .svg — "${path}" is not.`);
    }
    const asked = String(spec.name ?? "").trim().toLowerCase();
    const resolved = resolveIconName(asked);
    const geometry = resolved ? ICONS[resolved] : undefined;
    if (!geometry) {
      // The near-misses, not the whole list: 69 names in an error message is
      // not help, and the model's guess is nearly always a synonym away.
      const close = [...ICON_NAMES, ...Object.keys(ICON_ALIASES)]
        .filter((n) => asked.length > 2 && (n.includes(asked) || asked.includes(n)))
        .slice(0, 6);
      throw new Error(
        `There is no "${asked}" icon.` +
          (close.length > 0
            ? ` Did you mean: ${close.join(", ")}?`
            : ` Try one of: ${ICON_NAMES.slice(0, 12).join(", ")}…`),
      );
    }
    const palette = spec.palette ? PALETTES[spec.palette] : undefined;
    const size = Math.min(Math.max(Number(spec.size) || 24, 8), 512);
    const color = resolveColor(spec.stroke ?? spec.fill, palette?.accent ?? "currentColor", palette);
    const width = Math.min(Math.max(Number(spec.strokeWidth) || 2, 0.5), 4);
    // Lucide is a STROKE set: the paths describe outlines, so filling them
    // produces a smear. "filled" therefore strokes with a thick round join and
    // fills the same colour, which is how the set's own solid variants are
    // drawn — not a fill="..." on an open path.
    const attrs = spec.filled
      ? `fill="${color}" stroke="${color}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"`
      : `fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"`;
    return {
      content:
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" ${attrs}>` +
        `${geometry}</svg>\n`,
      mimeType: "image/svg+xml",
    };
  }

  if (generator === "pattern") {
    if (!path.toLowerCase().endsWith(".svg")) {
      throw new Error(`A generated pattern has to be saved as .svg — "${path}" is not.`);
    }
    // Narrowed at the boundary: renderPattern validates `kind` against its own
    // list and falls back to dots, so a shape kind arriving here is handled
    // rather than crashing.
    return { content: renderPattern(spec as PatternSpec), mimeType: "image/svg+xml" };
  }

  if (generator === "sound") {
    if (!path.toLowerCase().endsWith(".wav")) {
      throw new Error(`A generated sound has to be saved as .wav — "${path}" is not.`);
    }
    if (spec.preset && !(spec.preset in SOUND_PRESETS)) {
      throw new Error(
        `"${spec.preset}" is not a sound Panda knows. Try one of: ${Object.keys(SOUND_PRESETS).join(", ")}.`,
      );
    }
    return { content: soundFromSpec(spec), mimeType: assetMimeType(path) ?? "audio/wav" };
  }

  throw new Error(
    `Panda cannot generate "${generator}". It can generate a shape, an icon, a pattern or a sound.`,
  );
}
