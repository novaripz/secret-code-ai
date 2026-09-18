import type { FileOperation } from "@/types";
import { assertSafePath } from "@/lib/paths";

export type ValidatedOperation = FileOperation;

export interface ValidationResult {
  valid: ValidatedOperation[];
  errors: string[];
}

const VALID_TYPES = new Set(["create", "modify", "delete", "rename", "generate"]);

/**
 * The generators this will let through, and the cap on a description.
 *
 * Named here rather than imported from lib/assetGen so the validator stays a
 * pure, dependency-free gate: this module's whole job is to distrust what the
 * model sent, and a gate that imports the thing it is guarding has a habit of
 * growing into the thing it is guarding. assetGen refuses an unknown generator
 * again on its own account, which is the belt to this file's braces.
 */
const VALID_GENERATORS = new Set(["shape", "sound"]);

/**
 * Binary asset extensions a model cannot possibly be writing the contents of.
 *
 * Enforced here rather than left to the prompt, because the prompt asked
 * politely and production still answered a request for an icon and a sound with
 * `create art/settings.png` and `create sfx/click.mp3` — plausible paths,
 * fabricated contents. The student gets files with the right names that load as
 * a broken image and a silent button: a bug with no visible cause, which is
 * the worst kind for someone learning.
 *
 * SVG is deliberately absent. It is text, so writing one by hand is legitimate
 * and often the best answer.
 */
const UNWRITABLE_BINARY = /\.(png|jpe?g|gif|webp|avif|bmp|ico|mp3|wav|ogg|m4a|aac|mp4|webm|woff2?|ttf|otf)$/i;

/** A shape or a sound is a handful of numbers. Anything larger is not a spec. */
const MAX_SPEC_KEYS = 24;

/**
 * Defense-in-depth validation of AI-proposed file operations before they are
 * ever applied to the project. Never trust paths/content coming from the model.
 */
export function validateOperations(ops: FileOperation[]): ValidationResult {
  const valid: ValidatedOperation[] = [];
  const errors: string[] = [];

  if (!Array.isArray(ops)) {
    return { valid: [], errors: ["Operations must be an array."] };
  }

  for (const op of ops) {
    try {
      if (!op || typeof op !== "object") throw new Error("Operation must be an object.");
      if (!VALID_TYPES.has(op.type)) throw new Error(`Unknown operation type: "${op.type}"`);

      const path = assertSafePath(op.path);

      if (op.type === "create" || op.type === "modify") {
        if (typeof op.content !== "string") {
          throw new Error(`"${op.type}" on "${path}" is missing content.`);
        }
        // A data URL is a real asset arriving by an ordinary write, which is
        // how an upload and a generated sound both land. Anything else aimed at
        // a binary extension is invented content.
        if (UNWRITABLE_BINARY.test(path) && !op.content.startsWith("data:")) {
          throw new Error(
            `"${path}" cannot be written as text — an image or sound has to be generated ` +
              `(a .svg shape or a .wav sound) or added by the student.`,
          );
        }
        valid.push({ type: op.type, path, content: op.content });
      } else if (op.type === "delete") {
        valid.push({ type: "delete", path });
      } else if (op.type === "rename") {
        if (!op.newPath) throw new Error(`"rename" on "${path}" is missing newPath.`);
        const newPath = assertSafePath(op.newPath);
        valid.push({ type: "rename", path, newPath });
      } else if (op.type === "generate") {
        if (typeof op.generator !== "string" || !VALID_GENERATORS.has(op.generator)) {
          throw new Error(`"generate" on "${path}" asks for an unknown generator.`);
        }
        // The spec reaches a renderer that interpolates values into SVG, so it
        // is bounded and flattened here: only plain scalars, no nesting, no
        // functions, nothing that could smuggle structure past the renderer's
        // own per-field validation.
        const spec: Record<string, string | number | boolean> = {};
        if (op.spec !== undefined) {
          if (typeof op.spec !== "object" || op.spec === null || Array.isArray(op.spec)) {
            throw new Error(`"generate" on "${path}" has a spec that is not a plain object.`);
          }
          const entries = Object.entries(op.spec as Record<string, unknown>);
          if (entries.length > MAX_SPEC_KEYS) {
            throw new Error(`"generate" on "${path}" has far too many settings.`);
          }
          for (const [key, value] of entries) {
            const t = typeof value;
            if (t === "string" || t === "number" || t === "boolean") {
              spec[key] = value as string | number | boolean;
            }
            // Anything else is dropped rather than refused: a stray null in a
            // spec should cost the student a default, not the whole file.
          }
        }
        valid.push({ type: "generate", path, generator: op.generator, spec });
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  return { valid, errors };
}
