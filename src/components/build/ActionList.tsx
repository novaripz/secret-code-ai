"use client";

import { useMemo, useState } from "react";
import type { FileOperation, Project } from "@/types";
import { useI18n, type StringKey } from "@/lib/i18n";
import { findByPath } from "@/lib/fileSystem";
import { useStudioStore } from "@/store/useStudioStore";
import { CheckIcon, FileIcon, XIcon } from "@/components/icons";
import { diffLines, hunks, type DiffResult } from "./diff";

// What the agent did, written as actions rather than as a paragraph about
// actions. Four verbs, one file each, a line count, and a diff one click away.
//
// The reason this replaces prose is that prose cannot be checked. "I updated
// your stylesheet and tidied the header" is unfalsifiable until you go and
// look; "edited style.css +12 −3" is the same sentence with the receipts
// attached, and the diff underneath is the proof. A student who is new to code
// learns faster from seeing the edit than from being told about it.

/**
 * Why this list is not simply "what Panda decided to do".
 *
 * "out-of-time" is the one that is not a defect: the files are complete and
 * validated, there are just fewer of them than the student asked for, and the
 * useful next move is to ask Panda to carry on — not to distrust what is here.
 */
export type RecoveryNote = "truncated-envelope" | "code-block" | "out-of-time";

const NOTE: Record<RecoveryNote, string> = {
  "truncated-envelope":
    "Panda's reply got cut off part-way through. These are the files it finished — check them before applying.",
  "code-block":
    "Panda wrote this out as code instead of changing the files itself. Apply it and the code goes where it belongs.",
  "out-of-time":
    "Panda ran out of time before it could finish everything. These files are done — apply them, then ask Panda to carry on from here.",
};

const VERB: Record<FileOperation["type"], StringKey> = {
  create: "studio.opCreated",
  modify: "studio.opEdited",
  delete: "studio.opDeleted",
  rename: "studio.opRenamed",
};

/** Each verb gets a colour it keeps everywhere in the workspace. */
const VERB_STYLE: Record<FileOperation["type"], string> = {
  create: "bg-[var(--success-soft)] text-[var(--success)]",
  modify: "bg-[var(--warn-soft)] text-[var(--warn)]",
  delete: "bg-[var(--danger-soft)] text-[var(--danger)]",
  rename: "bg-[var(--accent-soft)] text-[var(--accent-strong)]",
};

/**
 * The rows of one diff. Exported because the Changes panel shows the same
 * comparison at a different moment — before approving an operation there, at
 * any time here — and two renderings of the same diff would eventually
 * disagree about what a removed line looks like.
 */
export function DiffBody({
  result,
  // The Changes column is far taller than an inline proposal in the chat, so
  // the cap is the caller's to set. 72 stays the default because that is what
  // every existing caller wants.
  maxHeightClass = "max-h-72",
}: {
  result: DiffResult;
  maxHeightClass?: string;
}) {
  const blocks = useMemo(() => hunks(result.rows), [result.rows]);

  if (result.tooLarge) {
    return (
      <p className="px-3 py-2 text-[11px] text-[var(--text-faint)]">
        This file is too big to compare line by line. Open it in the editor to see it.
      </p>
    );
  }

  if (blocks.length === 0) {
    return <p className="px-3 py-2 text-[11px] text-[var(--text-faint)]">Nothing actually changed in this file.</p>;
  }

  return (
    <div className={`${maxHeightClass} overflow-auto font-mono text-[11px] leading-[1.45]`}>
      {blocks.map((block, index) => (
        <div key={index}>
          {block.skipped > 0 && (
            <div className="border-y border-[var(--line)] bg-[var(--surface-2)] px-3 py-0.5 text-[10px] text-[var(--text-faint)]">
              {block.skipped} unchanged line{block.skipped === 1 ? "" : "s"}
            </div>
          )}
          {block.rows.map((row, rowIndex) => (
            <div
              key={rowIndex}
              className={`flex gap-2 px-2 ${
                row.kind === "added"
                  ? "bg-[var(--success-soft)] text-[var(--success)]"
                  : row.kind === "removed"
                    ? "bg-[var(--danger-soft)] text-[var(--danger)]"
                    : "text-[var(--text-dim)]"
              }`}
            >
              <span aria-hidden className="w-8 shrink-0 select-none text-right text-[var(--text-faint)]">
                {row.after ?? row.before}
              </span>
              {/* The marker is spoken, not just coloured — colour alone is not
                  a signal for a student reading with a screen reader. */}
              <span className="sr-only">
                {row.kind === "added" ? "added line" : row.kind === "removed" ? "removed line" : "unchanged line"}
              </span>
              <span aria-hidden className="w-2 shrink-0 select-none">
                {row.kind === "added" ? "+" : row.kind === "removed" ? "−" : " "}
              </span>
              <span className="whitespace-pre-wrap break-words">{row.text || " "}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function ActionRow({ op, project }: { op: FileOperation; project: Project | null }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  const previous = project ? (findByPath(project, op.path)?.content ?? "") : "";
  const next = op.type === "delete" ? "" : (op.content ?? "");
  const canDiff = op.type !== "rename";

  const result = useMemo(
    () => (open && canDiff ? diffLines(previous, next) : null),
    [open, canDiff, previous, next],
  );

  const lines = next ? next.split("\n").length : 0;
  const name = op.path.split("/").pop() ?? op.path;
  const label = `${t(VERB[op.type])} ${op.path}`;

  return (
    <li className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface-1)]">
      <button
        onClick={() => canDiff && setOpen((o) => !o)}
        aria-expanded={canDiff ? open : undefined}
        aria-label={canDiff ? `${open ? "Hide" : "Show"} the changes to ${op.path}` : label}
        className="tap flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm md:text-xs transition-colors motion-reduce:transition-none hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus)]"
      >
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${VERB_STYLE[op.type]}`}
        >
          {t(VERB[op.type])}
        </span>
        <FileIcon className="h-3.5 w-3.5 shrink-0 text-[var(--text-faint)]" />
        <span className="min-w-0 flex-1 truncate font-mono text-[var(--text-dim)]" title={op.path}>
          {name}
          {op.type === "rename" && op.newPath && (
            <span className="text-[var(--text-faint)]"> → {op.newPath.split("/").pop()}</span>
          )}
        </span>
        {lines > 0 && (
          <span className="shrink-0 tabular-nums text-[var(--text-faint)]">{lines} ln</span>
        )}
      </button>
      {open && result && (
        <div className="border-t border-[var(--line)] bg-[var(--surface-0)]">
          <DiffBody result={result} />
        </div>
      )}
    </li>
  );
}

export function ActionList({
  operations,
  applied,
  rejected,
  onApply,
  onReject,
  /** Set when these came back from the recovery path — the student is told why. */
  recovered,
}: {
  operations: FileOperation[];
  applied?: boolean;
  rejected?: boolean;
  onApply: () => void;
  onReject: () => void;
  recovered?: RecoveryNote;
}) {
  const project = useStudioStore((s) => s.project);

  return (
    <div className="mt-2 space-y-1.5">
      {recovered && (
        <p className="rounded-lg border border-[var(--warn)] bg-[var(--warn-soft)] px-2.5 py-1.5 text-[11px] leading-relaxed text-[var(--warn)]">
          {NOTE[recovered]}
        </p>
      )}

      <ul className="space-y-1.5">
        {operations.map((op, index) => (
          <ActionRow key={`${op.type}:${op.path}:${index}`} op={op} project={project} />
        ))}
      </ul>

      {!applied && !rejected && (
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <button
            onClick={onApply}
            className="tap flex items-center gap-1 rounded-md bg-[var(--success-soft)] px-3 py-1.5 text-sm md:text-xs font-medium text-[var(--success)] transition-[filter] motion-reduce:transition-none hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
          >
            <CheckIcon className="h-3.5 w-3.5" />
            Apply {operations.length} change{operations.length === 1 ? "" : "s"}
          </button>
          <button
            onClick={onReject}
            className="tap flex items-center gap-1 rounded-md bg-[var(--surface-2)] px-3 py-1.5 text-sm md:text-xs text-[var(--text-dim)] transition-colors motion-reduce:transition-none hover:bg-[var(--surface-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
          >
            <XIcon className="h-3.5 w-3.5" />
            Skip
          </button>
        </div>
      )}
      {applied && <p className="pt-0.5 text-[11px] text-[var(--success)]">Applied to your files.</p>}
      {rejected && <p className="pt-0.5 text-[11px] text-[var(--text-faint)]">Skipped.</p>}
    </div>
  );
}

/**
 * The same list, drawn while the agent is still writing it.
 *
 * Kept next to ActionList rather than in its own file because it is the same
 * idea at a different moment — the finished list is what the student approves,
 * this is that list arriving a row at a time — and the two must never drift
 * into using different words or different colours for the same operation.
 *
 * The honesty rule is the whole point. `done` holds operations the server has
 * already parsed and validated out of the model's output, and `current` is a
 * file the model has named and is writing right now. Nothing here is predicted:
 * there is no row for a file we expect next, and no fake step between them. A
 * list that ran ahead of the model would be a more convincing spinner, not more
 * information.
 */
export function LiveActions({
  done,
  current,
}: {
  done: FileOperation[];
  current?: { type: FileOperation["type"]; path: string };
}) {
  const { t } = useI18n();

  if (done.length === 0 && !current) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">
        {t("studio.liveHeading")}
      </p>
      {/* One live region for the whole list: a student using a screen reader
          hears each new row as it lands, rather than the list being re-read
          from the top every time it grows. */}
      <ul aria-live="polite" className="space-y-1">
        {done.map((op, index) => (
          <li
            key={`${op.type}:${op.path}:${index}`}
            className="flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface-1)] px-2 py-1 text-[11px]"
          >
            <span
              className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${VERB_STYLE[op.type]}`}
            >
              {t(VERB[op.type])}
            </span>
            <span className="min-w-0 flex-1 truncate font-mono text-[var(--text-dim)]" title={op.path}>
              {op.path}
            </span>
            <CheckIcon aria-hidden className="h-3 w-3 shrink-0 text-[var(--success)]" />
          </li>
        ))}
        {current && (
          <li className="flex items-center gap-2 rounded-lg border border-[var(--accent)] bg-[var(--surface-1)] px-2 py-1 text-[11px]">
            <span
              aria-hidden
              className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[var(--accent)] motion-reduce:animate-none"
            />
            <span className="min-w-0 flex-1 truncate font-mono text-[var(--text)]" title={current.path}>
              {t("studio.writingNow", { path: current.path })}
            </span>
          </li>
        )}
      </ul>
    </div>
  );
}
