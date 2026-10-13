"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useStudioStore } from "@/store/useStudioStore";
import { listAllFiles } from "@/lib/fileSystem";
import { CommandIcon, SearchIcon } from "@/components/icons";
import { Kbd } from "@/components/ui/primitives";
import { FileTypeIcon } from "./fileIcons";
import { useWorkspaceLayout } from "./useWorkspaceLayout";

// One key for everything. The workspace has panes, a file tree, a history and
// an editor, and the commands that matter were spread across all of them —
// which is fine once you know where they live and hopeless on the first day of
// term. Ctrl/Cmd-K (or P) puts every file and every action behind one text
// field, so the answer to "how do I open style.css" is always the same answer.
//
// Typing `>` first narrows it to actions, the way it does in VS Code — which is
// what Ctrl/Cmd-Shift-P opens it with.

export interface Command {
  id: string;
  label: string;
  /** Shown to the right — a keyboard shortcut, or a short note. */
  hint?: string;
  /** Shown as keys when it is a shortcut, e.g. "Ctrl Shift F". */
  keys?: string;
  icon?: ReactNode;
  /** Section heading when the list is unfiltered. */
  group?: string;
  run: () => void;
}

export type PaletteMode = "all" | "commands";

/**
 * The open/closed split is two components on purpose. Keeping the query and the
 * highlighted row in a component that only exists while the palette is open
 * means "clear it for next time" is not a job anyone has to remember to do —
 * unmounting is the reset.
 */
export function CommandPalette(props: { open: boolean; mode?: PaletteMode; onClose: () => void; actions: Command[] }) {
  if (!props.open) return null;
  return <Palette onClose={props.onClose} actions={props.actions} initial={props.mode === "commands" ? "> " : ""} />;
}

/**
 * How well `query` matches `text`: a prefix beats a word start beats anywhere
 * beats a scattered subsequence ("scjs" for script.js), and no match is -1.
 * Typed letters in order is still enough to find something; the ranking just
 * puts the obvious answer first.
 */
export function matchScore(query: string, text: string): number {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (!q) return 1;
  if (t.startsWith(q)) return 100 - Math.min(40, t.length - q.length);
  const at = t.indexOf(q);
  if (at > 0 && /[\s/._-]/.test(t[at - 1])) return 70;
  if (at > 0) return 50;
  let index = 0;
  let gaps = 0;
  for (let i = 0; i < t.length && index < q.length; i++) {
    if (t[i] === q[index]) index++;
    else if (index > 0) gaps++;
  }
  return index === q.length ? Math.max(1, 30 - gaps) : -1;
}

function Palette({ onClose, actions, initial }: { onClose: () => void; actions: Command[]; initial: string }) {
  const project = useStudioStore((s) => s.project);
  const tabs = useStudioStore((s) => s.tabs);
  const openFile = useStudioStore((s) => s.openFile);

  const [query, setQuery] = useState(initial);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const commandsOnly = query.startsWith(">");
  const needle = (commandsOnly ? query.slice(1) : query).trim();

  const files = useMemo<Command[]>(() => {
    if (!project) return [];
    const open = new Set(tabs.map((t) => t.path));
    return listAllFiles(project)
      .map((node) => ({
        id: `file:${node.path}`,
        label: node.name,
        hint: node.path.includes("/") ? node.path.split("/").slice(0, -1).join("/") : "",
        icon: <FileTypeIcon path={node.path} className="h-4 w-4" />,
        group: open.has(node.path) ? "Open files" : "Files",
        run: () => {
          openFile(node.path);
          useWorkspaceLayout.getState().reveal("editor");
        },
      }))
      .sort((a, b) => (a.group === b.group ? a.label.localeCompare(b.label) : a.group === "Open files" ? -1 : 1));
  }, [project, tabs, openFile]);

  const matches = useMemo(() => {
    const pool = commandsOnly ? actions : [...files, ...actions];
    if (!needle) {
      // Unfiltered: what is open, then the actions, then everything else.
      const openFiles = commandsOnly ? [] : files.filter((f) => f.group === "Open files");
      const rest = commandsOnly ? [] : files.filter((f) => f.group !== "Open files");
      return [...openFiles, ...actions, ...rest].slice(0, 80);
    }
    return pool
      .map((c) => ({ c, score: Math.max(matchScore(needle, c.label), matchScore(needle, `${c.hint ?? ""} ${c.label}`) - 20) }))
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 60)
      .map((x) => x.c);
  }, [files, actions, needle, commandsOnly]);

  useEffect(() => {
    // The field is the whole point of opening, so it takes focus immediately.
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
      const end = inputRef.current?.value.length ?? 0;
      inputRef.current?.setSelectionRange(end, end);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [cursor, matches]);

  function choose(index: number) {
    const command = matches[index];
    if (!command) return;
    onClose();
    command.run();
  }

  const showGroups = !needle;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-3 pt-[10vh] backdrop-blur-[2px] sm:p-4 sm:pt-[12vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Find a file or run a command"
        className="animate-rise flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--line-strong)] bg-[var(--surface-1)] shadow-[var(--shadow-pop)]"
      >
        <div className="flex shrink-0 items-center gap-2.5 border-b border-[var(--line)] px-4">
          {commandsOnly ? (
            <CommandIcon className="h-4 w-4 shrink-0 text-[var(--accent-text)]" />
          ) : (
            <SearchIcon className="h-4 w-4 shrink-0 text-[var(--text-faint)]" />
          )}
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
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={matches[cursor] ? `palette-${cursor}` : undefined}
            aria-label="Find a file or run a command"
            placeholder={commandsOnly ? "Type a command…" : "Search files, or type > for commands"}
            spellCheck={false}
            className="h-12 w-full bg-transparent text-[15px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
          />
          <Kbd className="hidden sm:inline-flex">Esc</Kbd>
        </div>

        <ul ref={listRef} id="palette-list" role="listbox" className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {matches.length === 0 && (
            <li className="px-3 py-8 text-center text-[13px] text-[var(--text-faint)]">
              Nothing matches “{needle}”.
            </li>
          )}
          {matches.map((command, index) => {
            const heading = showGroups && command.group && command.group !== matches[index - 1]?.group ? command.group : null;
            return (
              <li key={command.id} role="none">
                {heading && <p className="eyebrow px-2.5 pb-1 pt-2.5">{heading}</p>}
                <button
                  type="button"
                  id={`palette-${index}`}
                  role="option"
                  aria-selected={index === cursor}
                  data-active={index === cursor}
                  onMouseMove={() => setCursor(index)}
                  onClick={() => choose(index)}
                  className={`tap flex w-full items-center gap-3 rounded-[var(--radius-sm)] px-2.5 py-2 text-left text-[14px] ${
                    index === cursor ? "bg-[var(--accent-soft)] text-[var(--text)]" : "text-[var(--text-dim)]"
                  }`}
                >
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[var(--text-faint)] [&>svg]:h-4 [&>svg]:w-4">
                    {command.icon ?? <CommandIcon />}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{command.label}</span>
                  {command.keys ? (
                    <span className="hidden shrink-0 items-center gap-1 sm:flex">
                      {command.keys.split(" ").map((k, i) => (
                        <Kbd key={i}>{k}</Kbd>
                      ))}
                    </span>
                  ) : command.hint ? (
                    <span className="ide-mono shrink-0 truncate text-[11.5px] text-[var(--text-faint)]">{command.hint}</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="hidden shrink-0 items-center gap-4 border-t border-[var(--line)] px-4 py-2 text-[12px] text-[var(--text-faint)] sm:flex">
          <span className="flex items-center gap-1.5">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> move
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>Enter</Kbd> open
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>&gt;</Kbd> commands only
          </span>
        </div>
      </div>
    </div>
  );
}
