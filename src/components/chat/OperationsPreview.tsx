"use client";

import { useState } from "react";
import type { FileOperation } from "@/types";
import { CheckIcon, XIcon, FileIcon } from "@/components/icons";

const TYPE_STYLE: Record<FileOperation["type"], string> = {
  create: "bg-[var(--success-soft)] text-[var(--success)]",
  modify: "bg-[var(--warn-soft)] text-[var(--warn)]",
  delete: "bg-[var(--danger-soft)] text-[var(--danger)]",
  rename: "bg-[var(--accent-soft)] text-[var(--accent-strong)]",
};

const TYPE_LABEL: Record<FileOperation["type"], string> = {
  create: "new",
  modify: "changed",
  delete: "removed",
  rename: "renamed",
};

function OperationRow({ op }: { op: FileOperation }) {
  const [expanded, setExpanded] = useState(false);
  const lineCount = op.content ? op.content.split("\n").length : 0;

  return (
    <div className="border border-[var(--line)] rounded-lg overflow-hidden bg-[var(--surface-1)]">
      <button
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left hover:bg-[var(--surface-2)]"
        onClick={() => op.content && setExpanded((e) => !e)}
      >
        <span className={`px-1.5 py-0.5 rounded uppercase text-[10px] font-semibold shrink-0 ${TYPE_STYLE[op.type]}`}>
          {TYPE_LABEL[op.type]}
        </span>
        <FileIcon className="w-3.5 h-3.5 text-[var(--text-faint)] shrink-0" />
        <span className="truncate text-[var(--text-dim)] font-mono">
          {op.path}
          {op.type === "rename" && op.newPath && <span className="text-[var(--text-faint)]"> → {op.newPath}</span>}
        </span>
        {op.content && (
          <span className="ml-auto text-[var(--text-faint)] shrink-0">
            {lineCount} line{lineCount === 1 ? "" : "s"}
          </span>
        )}
      </button>
      {expanded && op.content && (
        <pre className="text-[11px] leading-snug text-[var(--text-dim)] bg-[var(--surface-2)] px-2.5 py-2 overflow-x-auto max-h-64 overflow-y-auto font-mono border-t border-[var(--line)]">
          {op.content}
        </pre>
      )}
    </div>
  );
}

export function OperationsPreview({
  operations,
  applied,
  rejected,
  onApply,
  onReject,
}: {
  operations: FileOperation[];
  applied?: boolean;
  rejected?: boolean;
  onApply: () => void;
  onReject: () => void;
}) {
  return (
    <div className="mt-2 space-y-1.5">
      {operations.map((op, i) => (
        <OperationRow key={i} op={op} />
      ))}
      {!applied && !rejected && (
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={onApply}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-md bg-[var(--success-soft)] text-[var(--success)] hover:brightness-95 font-medium"
          >
            <CheckIcon className="w-3.5 h-3.5" /> Yes, make this change
          </button>
          <button
            onClick={onReject}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-md bg-[var(--surface-2)] text-[var(--text-dim)] hover:bg-[var(--surface-3)]"
          >
            <XIcon className="w-3.5 h-3.5" /> No thanks
          </button>
        </div>
      )}
      {applied && <div className="text-[11px] text-[var(--success)] pt-0.5">✓ Done — this is now in your project</div>}
      {rejected && <div className="text-[11px] text-[var(--text-faint)] pt-0.5">Skipped</div>}
    </div>
  );
}
