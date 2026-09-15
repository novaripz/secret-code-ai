"use client";

import { useMemo, useState } from "react";
import { useStudioStore } from "@/store/useStudioStore";
import { useVersionStore, type Version } from "@/store/useVersionStore";
import type { FileNode } from "@/types";
import { CheckIcon, FileIcon } from "@/components/icons";
import { DiffBody } from "./ActionList";
import { diffLines, type DiffResult } from "./diff";

// What has changed, on demand.
//
// A diff already existed in the workspace, but only inside an agent proposal:
// the student could see a diff at the one moment they were being asked to
// approve one, and never otherwise. This is the same comparison made a place
// you can go — open it whenever, for the whole project, without needing Panda
// to have offered you anything.
//
// WHAT IT COMPARES AGAINST, and why.
//
// The baseline is a checkpoint out of the History panel, defaulting to the most
// recent one. That choice is the whole design: the project has no notion of
// "saved" for a student to point at — edits go to IndexedDB continuously — so
// "since you last saved" would be comparing against a moment nobody can name.
// A checkpoint IS nameable. It is the row directly above in History, with the
// same label and the same time, and the student can already travel to it. So
// the answer to "what am I looking at?" is a thing on screen they can go back
// to, and the picker lets them reach further back through the same list.
//
// The cost, stated plainly rather than hidden: checkpoints are taken a few
// seconds after you stop typing, so the newest one usually already contains
// what you just wrote, and the honest answer is then "nothing has changed".
// That is said in words. An empty diff that looks broken would be worse.

/** The same phrasing History uses, so the two panels name a moment alike. */
function when(at: number): string {
  const minutes = Math.round((Date.now() - at) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  return new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function contentsByPath(files: Record<string, FileNode>): Map<string, string> {
  const map = new Map<string, string>();
  for (const node of Object.values(files)) {
    if (node.kind === "file") map.set(node.path, node.content ?? "");
  }
  return map;
}

type ChangeKind = "added" | "edited" | "removed";

interface FileChange {
  path: string;
  kind: ChangeKind;
  before: string;
  after: string;
  result: DiffResult;
}

const KIND_LABEL: Record<ChangeKind, string> = {
  added: "new",
  edited: "edited",
  removed: "deleted",
};

const KIND_STYLE: Record<ChangeKind, string> = {
  added: "bg-[var(--success-soft)] text-[var(--success)]",
  edited: "bg-[var(--warn-soft)] text-[var(--warn)]",
  removed: "bg-[var(--danger-soft)] text-[var(--danger)]",
};

/**
 * Every file that differs between the checkpoint and now.
 *
 * A file that was created has no "before" at all, and one that was deleted has
 * no "after" — both are handled by diffing against an empty string, which is
 * what makes the row read as "the whole file is new" rather than crashing on a
 * missing side.
 */
function changesBetween(baseline: Version, files: Record<string, FileNode>): FileChange[] {
  const before = contentsByPath(baseline.files);
  const after = contentsByPath(files);
  const out: FileChange[] = [];

  for (const [path, text] of after) {
    const old = before.get(path);
    if (old === undefined) out.push(make(path, "added", "", text));
    else if (old !== text) out.push(make(path, "edited", old, text));
  }
  for (const [path, text] of before) {
    if (!after.has(path)) out.push(make(path, "removed", text, ""));
  }

  return out.sort((a, b) => a.path.localeCompare(b.path));
}

function make(path: string, kind: ChangeKind, before: string, after: string): FileChange {
  return { path, kind, before, after, result: diffLines(before, after) };
}

function FileRow({ change }: { change: FileChange }) {
  const [open, setOpen] = useState(false);
  const name = change.path.split("/").pop() ?? change.path;

  return (
    <li className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface-1)]">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`${open ? "Hide" : "Show"} the changes to ${change.path}`}
        className="tap flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm md:text-xs transition-colors motion-reduce:transition-none hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus)]"
      >
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${KIND_STYLE[change.kind]}`}
        >
          {KIND_LABEL[change.kind]}
        </span>
        <FileIcon className="h-3.5 w-3.5 shrink-0 text-[var(--text-faint)]" />
        <span className="min-w-0 flex-1 truncate font-mono text-[var(--text-dim)]" title={change.path}>
          {name}
        </span>
        {/* Counted, not coloured only: a student reading with a screen reader
            gets the same summary as one glancing at the row. */}
        <span className="shrink-0 tabular-nums text-[10px] text-[var(--text-faint)]">
          <span className="text-[var(--success)]">+{change.result.added}</span>{" "}
          <span className="text-[var(--danger)]">−{change.result.removed}</span>
          <span className="sr-only">
            {` ${change.result.added} lines added, ${change.result.removed} lines removed`}
          </span>
        </span>
      </button>
      {open && (
        // Its own scroll container: code lines are wider than this pane will
        // ever be, and a diff that widens the whole workspace is a diff that
        // pushes the rail off a phone screen.
        <div className="max-w-full overflow-x-auto border-t border-[var(--line)] bg-[var(--surface-0)]">
          <DiffBody result={change.result} />
        </div>
      )}
    </li>
  );
}

export function ChangesPanel() {
  const project = useStudioStore((s) => s.project);
  const versions = useVersionStore((s) => s.versions);
  const loaded = useVersionStore((s) => s.loaded);

  /** Which checkpoint we are comparing against; null means "the newest one". */
  const [pinned, setPinned] = useState<string | null>(null);

  const baseline = useMemo(() => {
    if (versions.length === 0) return undefined;
    return versions.find((v) => v.id === pinned) ?? versions[versions.length - 1];
  }, [versions, pinned]);

  const changes = useMemo(
    () => (baseline && project ? changesBetween(baseline, project.files) : []),
    [baseline, project],
  );

  if (!project) {
    return <p className="p-3 text-xs text-[var(--text-faint)]">No project open.</p>;
  }

  if (!loaded) {
    return <p className="p-3 text-xs text-[var(--text-faint)]">Looking up your history…</p>;
  }

  // A brand-new project has nothing to compare against, and saying "no changes"
  // would be a lie by omission — there is no baseline, which is a different
  // thing from an unchanged one.
  if (!baseline) {
    return (
      <p className="p-3 text-xs leading-relaxed text-[var(--text-faint)]">
        There&apos;s nothing to compare against yet. Panda keeps a checkpoint every few seconds while you
        work — as soon as there&apos;s one, this panel will show you exactly what moved since then.
      </p>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-[var(--line)] px-2 py-1.5">
        <label
          htmlFor="changes-baseline"
          className="block text-[10px] font-semibold uppercase tracking-wide text-[var(--text-faint)]"
        >
          Compared with
        </label>
        {/* 16px on phones on purpose: anything smaller makes iOS zoom the whole
            workspace the moment the picker is touched. */}
        <select
          id="changes-baseline"
          value={baseline.id}
          onChange={(e) => setPinned(e.target.value)}
          className="tap mt-0.5 w-full min-w-0 truncate rounded-md border border-[var(--line)] bg-[var(--surface-1)] px-2 py-1.5 text-base md:text-xs text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
        >
          {[...versions].reverse().map((version, index) => (
            <option key={version.id} value={version.id}>
              {index === 0 ? "Latest checkpoint" : version.label} · {when(version.createdAt)}
            </option>
          ))}
        </select>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {changes.length === 0 ? (
          <p className="flex items-start gap-2 p-1.5 text-xs leading-relaxed text-[var(--text-faint)]">
            <CheckIcon aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--success)]" />
            <span>
              Nothing has changed since {when(baseline.createdAt)}. Your files match that checkpoint
              exactly.
            </span>
          </p>
        ) : (
          <>
            <p className="px-1.5 pb-1.5 text-[11px] text-[var(--text-faint)]">
              {changes.length} file{changes.length === 1 ? "" : "s"} changed since{" "}
              {when(baseline.createdAt)}.
            </p>
            <ul className="space-y-1.5">
              {changes.map((change) => (
                <FileRow key={change.path} change={change} />
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
