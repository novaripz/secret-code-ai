"use client";

import { create } from "zustand";

// What the editor thinks is wrong with the code, before anything runs.
//
// The Problems tab used to list only errors the running page had thrown, so a
// missing bracket showed up only after pressing Run, as a runtime message about
// a line in a document the student never wrote. Monaco already knows about the
// bracket — it underlines it in red — and this is where it says so.
//
// Kept apart from the studio store because it changes on every keystroke in a
// way nothing else needs to hear about.

export interface EditorProblem {
  path: string;
  line: number;
  col: number;
  severity: "error" | "warning";
  message: string;
}

interface ProblemsState {
  /** Per file, so a file's list can be replaced whole when Monaco re-checks it. */
  byPath: Record<string, EditorProblem[]>;
  setForPath: (path: string, problems: EditorProblem[]) => void;
  clear: () => void;
}

export const useProblems = create<ProblemsState>((set) => ({
  byPath: {},
  setForPath: (path, problems) =>
    set((s) => {
      const had = s.byPath[path];
      if ((!had || had.length === 0) && problems.length === 0) return s;
      const byPath = { ...s.byPath };
      if (problems.length === 0) delete byPath[path];
      else byPath[path] = problems;
      return { byPath };
    }),
  clear: () => set({ byPath: {} }),
}));

/** Every problem, errors first, then by file and line. */
export function allProblems(byPath: Record<string, EditorProblem[]>): EditorProblem[] {
  return Object.values(byPath)
    .flat()
    .sort(
      (a, b) =>
        (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1) ||
        a.path.localeCompare(b.path) ||
        a.line - b.line,
    );
}
