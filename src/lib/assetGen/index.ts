import { assetMimeType } from "@/lib/assets";
import { renderShape, type ShapeSpec } from "./shapes";
import { MAX_SOUND_SECONDS, SOUND_PRESETS, soundFromSpec, type SoundSpec } from "./sound";

// The one entry point: a spec in, a real file out.
//
// This exists so the operation pipeline has a single thing to call and a single
// place where a bad spec is refused. Everything a generator can produce is
// deterministic — the same spec gives the same bytes — which is what makes a
// regenerated asset show as "no change" in the Changes panel rather than as a
// mysterious diff, and what makes the checks possible to write at all.

export type GeneratorName = "shape" | "sound";

export interface GenerateResult {
  content: string;
  mimeType: string;
}

export interface GenerateSpec extends ShapeSpec, SoundSpec {
  preset?: string;
}

export { SOUND_PRESETS, MAX_SOUND_SECONDS };
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
    return { content: renderShape(spec), mimeType: "image/svg+xml" };
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

  throw new Error(`Panda cannot generate "${generator}". It can generate a shape or a sound.`);
}
