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
  /**
   * Whether the editor is showing the live view. A turn turns it on; the
   * student clicking one of their own tabs turns it off, and it stays off
   * for the rest of that turn. The live view used to take over the editor
   * for the whole turn, read-only, so a minute-long build was a minute in
   * which the student could not touch their own code.
   */
  watching: boolean;

  begin: (path: string, kind: string) => void;
  append: (path: string, delta: string) => void;
  setWatching: (watching: boolean) => void;
  /** The turn is over, whatever its outcome. */
  end: () => void;
}

export const useLiveWrite = create<LiveWriteState>((set, get) => ({
  path: null,
  kind: null,
  content: "",
  streaming: false,
  watching: false,

  // The first file of a turn starts the watching; later files keep whatever
  // the student chose, so a student who went back to their own tab is not
  // dragged away again on every new file.
  begin: (path, kind) =>
    set((s) => ({ path, kind, content: "", streaming: true, watching: s.streaming ? s.watching : true })),

  // Guarded on the path: deltas and op_start frames are separate messages, and
  // a delta arriving a beat after the next file has been announced would
  // otherwise append one file's tail to another file's head.
  append: (path, delta) => {
    if (get().path !== path) return;
    set((s) => ({ content: s.content + delta }));
  },

  setWatching: (watching) => set({ watching }),

  end: () => set({ path: null, kind: null, content: "", streaming: false, watching: false }),
}));
