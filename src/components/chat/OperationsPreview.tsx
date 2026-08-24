"use client";

import { useState } from "react";
import type { FileOperation } from "@/types";
import { CheckIcon, XIcon, FileIcon } from "@/components/icons";

const TYPE_STYLE: Record<FileOperation["type"], string> = {
  create: "bg-emerald-500/15 text-emerald-300",
  modify: "bg-amber-500/15 text-amber-300",
  delete: "bg-red-500/15 text-red-300",
  rename: "bg-sky-500/15 text-sky-300",
};

function OperationRow({ op }: { op: FileOperation }) {
  const [expanded, setExpanded] = useState(false);
  const lineCount = op.content ? op.content.split("\n").length : 0;

  return (
    <div className="border border-white/5 rounded-md overflow-hidden bg-zinc-900/60">
      <button
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left hover:bg-white/5"
        onClick={() => op.content && setExpanded((e) => !e)}
      >
        <span className={`px-1.5 py-0.5 rounded uppercase text-[10px] font-semibold shrink-0 ${TYPE_STYLE[op.type]}`}>
          {op.type}
        </span>
        <FileIcon className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
        <span className="truncate text-zinc-300 font-mono">
          {op.path}
          {op.type === "rename" && op.newPath && <span className="text-zinc-500"> → {op.newPath}</span>}
        </span>
        {op.content && (
          <span className="ml-auto text-zinc-600 shrink-0">{lineCount} line{lineCount === 1 ? "" : "s"}</span>
        )}
      </button>
      {expanded && op.content && (
        <pre className="text-[11px] leading-snug text-zinc-400 bg-black/40 px-2.5 py-2 overflow-x-auto max-h-64 overflow-y-auto font-mono border-t border-white/5">
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
            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
          >
            <CheckIcon className="w-3.5 h-3.5" /> Apply changes
          </button>
          <button
            onClick={onReject}
            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-white/5 text-zinc-400 hover:bg-white/10"
          >
            <XIcon className="w-3.5 h-3.5" /> Discard
          </button>
        </div>
      )}
      {applied && <div className="text-[11px] text-emerald-400/80 pt-0.5">✓ Applied to your project</div>}
      {rejected && <div className="text-[11px] text-zinc-500 pt-0.5">Discarded</div>}
    </div>
  );
}
