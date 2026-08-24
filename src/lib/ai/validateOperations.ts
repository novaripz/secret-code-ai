import type { FileOperation } from "@/types";
import { assertSafePath } from "@/lib/paths";

export type ValidatedOperation = FileOperation;

export interface ValidationResult {
  valid: ValidatedOperation[];
  errors: string[];
}

const VALID_TYPES = new Set(["create", "modify", "delete", "rename"]);

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
        valid.push({ type: op.type, path, content: op.content });
      } else if (op.type === "delete") {
        valid.push({ type: "delete", path });
      } else if (op.type === "rename") {
        if (!op.newPath) throw new Error(`"rename" on "${path}" is missing newPath.`);
        const newPath = assertSafePath(op.newPath);
        valid.push({ type: "rename", path, newPath });
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  return { valid, errors };
}
