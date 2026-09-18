"use client";

import { useEffect, useMemo, useState } from "react";
import { useStudioStore } from "@/store/useStudioStore";
import { useVersionStore, type Version } from "@/store/useVersionStore";
import type { FileNode, FileOperation } from "@/types";
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
  // An asset is not diffed. Its content is a data URL, so a line diff renders
  // half a megabyte of base64 as one enormous added line — unreadable, and it
  // buries the source changes the panel exists to show. The row still appears,
  // with its counts at zero and a note in place of the diff.
  if (before.startsWith("data:") || after.startsWith("data:")) {
    return { path, kind, before, after, result: { rows: [], added: 0, removed: 0, tooLarge: false } };
  }
  return { path, kind, before, after, result: diffLines(before, after) };
}

/** A patch a student could paste elsewhere. Unified-ish, and honest about hunks. */
function asPatch(change: FileChange): string {
  const head = `--- a/${change.path}\n+++ b/${change.path}`;
  if (change.result.tooLarge) return `${head}\n(too large to compare line by line)`;
  const body = change.result.rows
    .map((row) => `${row.kind === "added" ? "+" : row.kind === "removed" ? "-" : " "}${row.text}`)
    .join("\n");
  return `${head}\n${body}`;
}

function RowButton({
  label,
  onClick,
  danger = false,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`tap inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] ${
        danger
          ? "text-[var(--text-faint)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
          : "text-[var(--text-faint)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
      }`}
    >
      {children}
    </button>
  );
}

function FileRow({
  change,
  open,
  onToggle,
  onOpenFile,
  onRevert,
}: {
  change: FileChange;
  open: boolean;
  onToggle: () => void;
  onOpenFile: () => void;
  onRevert: () => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  async function copyPatch() {
    try {
      await navigator.clipboard.writeText(asPatch(change));
      setCopied(true);
    } catch {
      // Insecure origin or a denied permission. Silent here rather than
      // alarming: the diff is still on screen to read.
    }
  }

  return (
    <li className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface-1)]">
      <div className="flex items-center gap-1 pr-1">
        <button
          onClick={onToggle}
          aria-expanded={open}
          aria-label={`${open ? "Hide" : "Show"} the changes to ${change.path}`}
          className="tap flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-sm md:text-xs transition-colors motion-reduce:transition-none hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus)]"
        >
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${KIND_STYLE[change.kind]}`}
          >
            {KIND_LABEL[change.kind]}
          </span>
          <FileIcon className="h-3.5 w-3.5 shrink-0 text-[var(--text-faint)]" />
          {/* The FULL path, not just the file name. In a narrow sidebar the name
              was all that fit; in a column of its own, "js/shop.js" and
              "old/shop.js" being indistinguishable is a real hazard. */}
          <span className="min-w-0 flex-1 truncate font-mono text-[var(--text-dim)]" title={change.path}>
            {change.path}
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
      </div>

      {open && (
        <>
          {/* Its own scroll container: code lines are wider than this pane will
              ever be, and a diff that widens the whole workspace is a diff that
              pushes the rail off a phone screen. */}
          <div className="max-w-full overflow-x-auto border-t border-[var(--line)] bg-[var(--surface-0)]">
            {change.after.startsWith("data:") || change.before.startsWith("data:") ? (
              <p className="px-3 py-2 text-[11px] text-[var(--text-faint)]">
                {change.kind === "added"
                  ? "A picture or sound was added. Open it to see or hear it."
                  : change.kind === "removed"
                    ? "A picture or sound was removed."
                    : "A picture or sound was replaced. Open it to see or hear it."}
              </p>
            ) : (
              <DiffBody result={change.result} maxHeightClass="max-h-[28rem]" />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-0.5 border-t border-[var(--line)] px-1 py-0.5">
            {change.kind !== "removed" && (
              <RowButton label={`Open ${change.path} in the editor`} onClick={onOpenFile}>
                Open
              </RowButton>
            )}
            <RowButton label={`Copy the diff for ${change.path}`} onClick={() => void copyPatch()}>
              {copied ? "Copied" : "Copy diff"}
            </RowButton>
            {/* Undoing one file rather than the whole checkpoint. History can
                already travel the whole project back; this is the finer tool,
                for when one file went wrong and four went right. */}
            <RowButton label={`Undo the changes to ${change.path}`} onClick={onRevert} danger>
              Undo this file
            </RowButton>
          </div>
        </>
      )}
    </li>
  );
}

type Filter = "all" | ChangeKind;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "added", label: "New" },
  { key: "edited", label: "Edited" },
  { key: "removed", label: "Deleted" },
];

export function ChangesPanel() {
  const project = useStudioStore((s) => s.project);
  const openFile = useStudioStore((s) => s.openFile);
  const applyOperations = useStudioStore((s) => s.applyOperations);
  const versions = useVersionStore((s) => s.versions);
  const loaded = useVersionStore((s) => s.loaded);

  /** Which checkpoint we are comparing against; null means "the newest one". */
  const [pinned, setPinned] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  /**
   * Paths the student has opened, or null while they have not touched a row.
   *
   * Null rather than an empty Set so the "one changed file opens itself" rule
   * below can be DERIVED instead of written by an effect. An effect that calls
   * setState on every change to `changes` re-renders the panel twice per
   * keystroke and fights the student the moment they collapse the row it just
   * opened for them.
   */
  const [touched, setTouched] = useState<Set<string> | null>(null);

  const baseline = useMemo(() => {
    if (versions.length === 0) return undefined;
    return versions.find((v) => v.id === pinned) ?? versions[versions.length - 1];
  }, [versions, pinned]);

  const changes = useMemo(
    () => (baseline && project ? changesBetween(baseline, project.files) : []),
    [baseline, project],
  );

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return changes.filter(
      (c) =>
        (filter === "all" || c.kind === filter) &&
        (needle === "" || c.path.toLowerCase().includes(needle)),
    );
  }, [changes, filter, query]);

  const totals = useMemo(
    () =>
      changes.reduce(
        (acc, c) => ({ added: acc.added + c.result.added, removed: acc.removed + c.result.removed }),
        { added: 0, removed: 0 },
      ),
    [changes],
  );

  // One changed file, opened for you: clicking to open the only row there is,
  // every time, is a click that exists for no reason. Derived, so collapsing it
  // sticks — the moment the student touches anything, their set is the truth.
  const expanded = useMemo(
    () => touched ?? (changes.length === 1 ? new Set([changes[0].path]) : new Set<string>()),
    [touched, changes],
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

  function revert(change: FileChange) {
    // Expressed as file operations so it goes through the same validation and
    // the same autosave as anything else that edits the project. A file that
    // was created since the checkpoint is deleted; anything else is put back to
    // the text the checkpoint holds.
    const op: FileOperation =
      change.kind === "added"
        ? { type: "delete", path: change.path }
        : { type: "modify", path: change.path, content: change.before };
    applyOperations([op]);
  }

  const allOpen = shown.length > 0 && shown.every((c) => expanded.has(c.path));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-1.5 border-b border-[var(--line)] px-2 py-2">
        <div>
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

        {changes.length > 0 && (
          <>
            {/* The totals, up top. "What did that turn actually do?" is usually
                answered by two numbers before anyone opens a single file. */}
            <p className="text-[11px] text-[var(--text-faint)]">
              {changes.length} file{changes.length === 1 ? "" : "s"} ·{" "}
              <span className="tabular-nums text-[var(--success)]">+{totals.added}</span>{" "}
              <span className="tabular-nums text-[var(--danger)]">−{totals.removed}</span> · since{" "}
              {when(baseline.createdAt)}
            </p>

            <div className="flex flex-wrap items-center gap-1">
              {FILTERS.map(({ key, label }) => {
                const count =
                  key === "all" ? changes.length : changes.filter((c) => c.kind === key).length;
                if (count === 0 && key !== "all") return null;
                const on = filter === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilter(key)}
                    aria-pressed={on}
                    className={`tap rounded-full px-2 py-0.5 text-[11px] transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] ${
                      on
                        ? "bg-[var(--surface-3)] font-medium text-[var(--text)]"
                        : "text-[var(--text-faint)] hover:bg-[var(--surface-2)] hover:text-[var(--text-dim)]"
                    }`}
                  >
                    {label} <span className="tabular-nums">{count}</span>
                  </button>
                );
              })}
              <span className="flex-1" />
              <button
                type="button"
                onClick={() =>
                  setTouched(allOpen ? new Set() : new Set(shown.map((c) => c.path)))
                }
                className="tap rounded-md px-2 py-0.5 text-[11px] text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
              >
                {allOpen ? "Collapse all" : "Expand all"}
              </button>
            </div>

            {/* Only worth the row once there are enough files to hunt through. */}
            {changes.length > 5 && (
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by path…"
                aria-label="Filter the changed files by path"
                className="w-full rounded-md border border-[var(--line)] bg-[var(--surface-1)] px-2 py-1.5 text-base md:text-xs text-[var(--text)] placeholder:text-[var(--text-faint)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
              />
            )}
          </>
        )}
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
        ) : shown.length === 0 ? (
          <p className="p-1.5 text-xs text-[var(--text-faint)]">
            No changed file matches that filter.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {shown.map((change) => (
              <FileRow
                key={change.path}
                change={change}
                open={expanded.has(change.path)}
                onToggle={() =>
                  setTouched(() => {
                    const next = new Set(expanded);
                    if (next.has(change.path)) next.delete(change.path);
                    else next.add(change.path);
                    return next;
                  })
                }
                onOpenFile={() => openFile(change.path)}
                onRevert={() => revert(change)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
