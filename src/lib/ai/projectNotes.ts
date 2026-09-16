import type { Project } from "@/types";
import { listAllFiles } from "@/lib/fileSystem";

// PANDA.md — what this project is, kept in the project.
//
// Panda does not run on one model. A turn is served by whichever of four
// providers answers first, and the next turn may well be served by a different
// one; there is no shared memory between them and none of them remember the
// last message. So everything a model needs to know has to be re-sent on every
// single turn, and until now the only way it learned what a project WAS was by
// reading the source again: up to twelve files and forty thousand characters,
// re-derived from scratch, to rediscover facts that had not changed since the
// last message -- what the game is, that the state lives in game.js, that the
// student decided against a framework.
//
// That is slow, it is most of what each turn costs, and it is fragile: a
// different model reading the same files reaches slightly different conclusions
// and the project drifts.
//
// So the project carries a brief. It is an ordinary file in the student's file
// tree, which is the whole point -- they can read it, correct it, and take it
// with them when they export the project. Panda writes it and keeps it current;
// a student who disagrees with what it says can simply edit it, and the next
// turn believes them.
//
// It is not a changelog. A log grows without bound and re-reading it costs what
// re-reading the source cost. This is the current state of the project, rewritten
// in place, small enough to always afford.

/** Always at the root, always this name, so every model can find it without being told where. */
export const PROJECT_NOTES_PATH = "PANDA.md";

/**
 * The most of it we will ever send.
 *
 * The budget exists because the file's whole justification is being cheaper
 * than the thing it replaces. A brief that grows to twenty thousand characters
 * is a second copy of the project and saves nobody anything, so it is capped
 * here and the system prompt asks for it to be kept short. Four thousand
 * characters is roughly two pages: enough for a real description of a student
 * project, not enough to hide a transcript in.
 */
export const MAX_NOTES_CHARS = 4000;

/** The project's brief, or undefined if it has not written one yet. */
export function readProjectNotes(project: Project): string | undefined {
  const file = listAllFiles(project).find((f) => f.path === PROJECT_NOTES_PATH);
  const content = file?.content?.trim();
  if (!content) return undefined;
  return content.slice(0, MAX_NOTES_CHARS);
}
