"use client";

import { useStudioStore } from "@/store/useStudioStore";
import { useVersionStore, type Version } from "@/store/useVersionStore";
import { HistoryIcon, UndoIcon } from "@/components/icons";
import { Skeleton } from "@/components/ui/primitives";
import { PaneHeader } from "./Pane";
import { ago, useNow } from "./useNow";

// The list of places you can go back to. Nothing here asks "are you sure?",
// because going back is itself recorded — the state you were in before the jump
// lands at the top of this same list, so the escape hatch has an escape hatch.
// A confirmation would only teach a student to be frightened of a button that
// can't hurt them.
//
// The Restore button is always drawn. It used to appear only under a hovering
// mouse, which on a Chromebook touchscreen meant it never appeared at all.

/** The words a student would use, not the enum. */
const KIND_NOTE: Record<Version["kind"], string | null> = {
  auto: null,
  checkpoint: "saved before going back",
  restore: "you went back here",
};

export function VersionPanel({ onClose }: { onClose?: () => void }) {
  const project = useStudioStore((s) => s.project);
  const setProject = useStudioStore((s) => s.setProject);
  const persist = useStudioStore((s) => s.persist);
  const versions = useVersionStore((s) => s.versions);
  const loaded = useVersionStore((s) => s.loaded);
  const restore = useVersionStore((s) => s.restore);
  const now = useNow();

  function handleRestore(version: Version) {
    if (!project) return;
    const restored = restore(version.id, project);
    if (!restored) return;
    // The same project with older files: setProject keeps every tab whose file
    // still exists and closes the rest, so the student stays where they were.
    setProject(restored);
    void persist();
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--surface-0)]">
      <PaneHeader title="History" onClose={onClose} closeLabel="Close your version history" />
      {!loaded ? (
        <div className="space-y-3 p-3" aria-label="Looking up your history">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3.5 w-3/4" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          ))}
        </div>
      ) : versions.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-10 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--text-dim)]">
            <HistoryIcon className="h-5 w-5" />
          </span>
          <p className="mt-3 text-sm font-[var(--weight-strong)] text-[var(--text)]">Nothing saved yet</p>
          <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-dim)]">
            Keep working — every few seconds of edits is kept here on its own, so you can always come back.
          </p>
        </div>
      ) : (
        <ol className="min-h-0 flex-1 overflow-y-auto p-2">
          {/* Newest first: the thing you want back is almost always the thing you just left. */}
          {[...versions].reverse().map((version, index) => {
            const note = KIND_NOTE[version.kind];
            const current = index === 0;
            return (
              <li key={version.id} className="relative pl-5">
                {/* A timeline down the left, so the list reads as "then, then, now". */}
                <span aria-hidden className="absolute bottom-0 left-[7px] top-0 w-px bg-[var(--line)]" />
                <span
                  aria-hidden
                  className={`absolute left-[3px] top-3 h-[9px] w-[9px] rounded-full border-2 ${
                    current ? "border-[var(--accent)] bg-[var(--accent)]" : "border-[var(--line-strong)] bg-[var(--surface-0)]"
                  }`}
                />
                <div className="flex items-start gap-2 rounded-[var(--radius-sm)] px-2 py-2 hover:bg-[var(--surface-2)]">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] text-[var(--text)]">{version.label}</p>
                    <p className="mt-0.5 text-[12px] text-[var(--text-faint)]">
                      {ago(version.createdAt, now)}
                      {note ? ` · ${note}` : ""}
                      {current ? " · where you are now" : ""}
                    </p>
                  </div>
                  {!current && (
                    <button
                      type="button"
                      onClick={() => handleRestore(version)}
                      aria-label={`Go back to ${version.label}, ${ago(version.createdAt, now)}`}
                      title="Go back to this"
                      className="btn btn-ghost btn-sm !h-7 shrink-0 !px-2"
                    >
                      <UndoIcon />
                      Restore
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
