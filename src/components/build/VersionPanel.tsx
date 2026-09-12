"use client";

import { useStudioStore } from "@/store/useStudioStore";
import { useVersionStore, type Version } from "@/store/useVersionStore";
import { findByPath } from "@/lib/fileSystem";
import { UndoIcon } from "./icons";

// The list of places you can go back to. Nothing here asks "are you sure?",
// because going back is itself recorded — the state you were in before the jump
// lands at the top of this same list, so the escape hatch has an escape hatch.
// A confirmation would only teach a student to be frightened of a button that
// can't hurt them.

function when(at: number): string {
  const minutes = Math.round((Date.now() - at) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  return new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** The words a student would use, not the enum. */
const KIND_NOTE: Record<Version["kind"], string | null> = {
  auto: null,
  checkpoint: "saved before going back",
  restore: "you went back here",
};

export function VersionPanel() {
  const project = useStudioStore((s) => s.project);
  const tabs = useStudioStore((s) => s.tabs);
  const activeTab = useStudioStore((s) => s.activeTab);
  const setProject = useStudioStore((s) => s.setProject);
  const openFile = useStudioStore((s) => s.openFile);
  const persist = useStudioStore((s) => s.persist);

  const versions = useVersionStore((s) => s.versions);
  const loaded = useVersionStore((s) => s.loaded);
  const restore = useVersionStore((s) => s.restore);

  function handleRestore(version: Version) {
    if (!project) return;
    // Which files were open is part of where the student was, and setProject
    // clears the tab bar — so remember the paths and put back the ones that
    // still exist in the version being restored.
    const wasOpen = tabs.map((t) => t.path);
    const wasActive = activeTab;

    const restored = restore(version.id, project);
    if (!restored) return;

    setProject(restored);
    for (const path of wasOpen) {
      if (findByPath(restored, path)) openFile(path);
    }
    if (wasActive && findByPath(restored, wasActive)) openFile(wasActive);
    void persist();
  }

  if (!loaded) {
    return <p className="p-3 text-xs text-[var(--text-faint)]">Looking up your history…</p>;
  }

  if (versions.length === 0) {
    return (
      <p className="p-3 text-xs leading-relaxed text-[var(--text-faint)]">
        Nothing saved yet. Keep working — every few seconds of edits gets kept here on its own, so you can
        always come back.
      </p>
    );
  }

  return (
    <ol className="h-full overflow-y-auto p-1.5">
      {/* Newest first: the thing you want back is almost always the thing you just left. */}
      {[...versions].reverse().map((version, index) => {
        const note = KIND_NOTE[version.kind];
        const current = index === 0;
        return (
          <li key={version.id}>
            <div className="group flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-[var(--surface-2)]">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-[var(--text)]">{version.label}</p>
                <p className="mt-0.5 text-[11px] text-[var(--text-faint)]">
                  {when(version.createdAt)}
                  {note ? ` · ${note}` : ""}
                  {current ? " · where you are now" : ""}
                </p>
              </div>
              <button
                onClick={() => handleRestore(version)}
                aria-label={`Go back to ${version.label}, ${when(version.createdAt)}`}
                title="Go back to this"
                className="shrink-0 rounded p-1 text-[var(--text-faint)] opacity-0 transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text)] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] group-hover:opacity-100"
              >
                <UndoIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
