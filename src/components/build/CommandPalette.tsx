"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useStudioStore } from "@/store/useStudioStore";
import { listAllFiles } from "@/lib/fileSystem";
import { FileIcon, SearchIcon } from "@/components/icons";

// One key for everything. The workspace has four panes, a file tree, a history
// and an editor, and the commands that matter were spread across all of them —
// which is fine once you know where they live and hopeless on the first day of
// term. Ctrl/Cmd-K puts every file and every panel behind one text field, so
// the answer to "how do I open style.css" is always the same answer.
//
// Files and actions share one list rather than sitting in separate sections,
// because a student does not think in categories; they think of a name and
// type it.

export interface Command {
  id: string;
  label: string;
  /** Shown to the right — a keyboard hint or the file's folder. */
  hint?: string;
  run: () => void;
}

/**
 * The open/closed split is two components on purpose. Keeping the query and the
 * highlighted row in a component that only exists while the palette is open
 * means "clear it for next time" is not a job anyone has to remember to do —
 * unmounting is the reset.
 */
export function CommandPalette(props: { open: boolean; onClose: () => void; actions: Command[] }) {
  if (!props.open) return null;
  return <Palette onClose={props.onClose} actions={props.actions} />;
}

function Palette({ onClose, actions }: { onClose: () => void; actions: Command[] }) {
  const project = useStudioStore((s) => s.project);
  const openFile = useStudioStore((s) => s.openFile);

  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const commands = useMemo<Command[]>(() => {
    const files: Command[] = project
      ? listAllFiles(project).map((node) => ({
          id: `file:${node.path}`,
          label: node.name,
          hint: node.path.includes("/") ? node.path.split("/").slice(0, -1).join("/") : "",
          run: () => openFile(node.path),
        }))
      : [];
    return [...actions, ...files];
  }, [actions, project, openFile]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands.slice(0, 40);
    // Subsequence rather than substring: typing "sty" should still find
    // "style.css", and typing "scjs" should still find "script.js".
    return commands.filter((c) => subsequence(q, `${c.label} ${c.hint ?? ""}`.toLowerCase())).slice(0, 40);
  }, [commands, query]);

  useEffect(() => {
    // The field is the whole point of opening, so it takes focus immediately.
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [cursor, matches]);

  function choose(index: number) {
    const command = matches[index];
    if (!command) return;
    command.run();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-[var(--bg)]/70 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Find a file or run a command"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[70vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[var(--line-strong)] bg-[var(--surface-0)] shadow-2xl"
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-[var(--line)] px-3">
          <SearchIcon className="h-4 w-4 shrink-0 text-[var(--text-faint)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((c) => Math.min(c + 1, matches.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((c) => Math.max(c - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                choose(cursor);
              } else if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              }
            }}
            aria-label="Find a file or run a command"
            placeholder="Find a file, or type a command…"
            className="w-full bg-transparent py-3 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
          />
        </div>

        <ul ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {matches.length === 0 && (
            <li className="px-3 py-6 text-center text-xs text-[var(--text-faint)]">
              Nothing matches “{query}”.
            </li>
          )}
          {matches.map((command, index) => (
            <li key={command.id}>
              <button
                data-active={index === cursor}
                onMouseEnter={() => setCursor(index)}
                onClick={() => choose(index)}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] ${
                  index === cursor
                    ? "bg-[var(--surface-2)] text-[var(--text)]"
                    : "text-[var(--text-dim)]"
                }`}
              >
                <FileIcon className="h-3.5 w-3.5 shrink-0 text-[var(--text-faint)]" />
                <span className="min-w-0 flex-1 truncate">{command.label}</span>
                {command.hint && (
                  <span className="shrink-0 truncate font-mono text-[10px] text-[var(--text-faint)]">
                    {command.hint}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Every letter of `needle`, in order, somewhere in `haystack`. */
function subsequence(needle: string, haystack: string): boolean {
  let index = 0;
  for (const ch of haystack) {
    if (ch === needle[index]) index++;
    if (index === needle.length) return true;
  }
  return index === needle.length;
}
