"use client";

import { create } from "zustand";

// The file Panda is writing, right now, character by character.
//
// A build turn used to be a list of filenames appearing in the chat panel with
// a spinner beside them: you were told a file was being written and shown
// nothing of it until the whole turn landed and you pressed Apply. For a
// thirty-second generation that is thirty seconds of trusting a progress line.
//
// The stream already carried what was needed -- the scanner in projectStream.ts
// walks the model's JSON as it arrives -- so the contents are now forwarded as
// they are decoded, and the editor shows them landing in the file.
//
// WHAT THIS IS NOT: it is not the project. Nothing here is written to disk, and
// the student's own files are untouched until they apply the operations, which
// is still their decision and still reversible. This is a window onto what is
// being proposed while it is being proposed. Keeping the two apart is what
// makes it safe to show a half-written file at all: a half-written file that
// had really been saved over their work would be the worst version of this
// feature, not the best one.

interface LiveWriteState {
  /** The path currently being written, or null between operations. */
  path: string | null;
  /** What the operation does — "create" reads differently from "modify". */
  kind: string | null;
  /** Everything decoded so far for that path. */
  content: string;
  /** True from the first op_start of a turn until the turn ends. */
  streaming: boolean;

  begin: (path: string, kind: string) => void;
  append: (path: string, delta: string) => void;
  /** The turn is over, whatever its outcome. */
  end: () => void;
}

export const useLiveWrite = create<LiveWriteState>((set, get) => ({
  path: null,
  kind: null,
  content: "",
  streaming: false,

  begin: (path, kind) => set({ path, kind, content: "", streaming: true }),

  // Guarded on the path: deltas and op_start frames are separate messages, and
  // a delta arriving a beat after the next file has been announced would
  // otherwise append one file's tail to another file's head.
  append: (path, delta) => {
    if (get().path !== path) return;
    set((s) => ({ content: s.content + delta }));
  },

  end: () => set({ path: null, kind: null, content: "", streaming: false }),
}));
