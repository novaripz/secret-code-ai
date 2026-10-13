"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import { CaseSensitive, Regex, WholeWord } from "lucide-react";
import { useStudioStore } from "@/store/useStudioStore";
import { useDialog } from "@/components/ui/Dialog";
import { listAllFiles } from "@/lib/fileSystem";
import { fileName, parentPath } from "@/lib/paths";
import { ChevronDownIcon, ChevronRightIcon, ReplaceIcon, SearchIcon } from "@/components/icons";
import { PaneHeader } from "./Pane";
import { FileTypeIcon } from "./fileIcons";
import { replaceAll, searchFiles, type SearchMatch, type SearchOptions } from "./findInFiles";
import { WORKSPACE_EVENTS, emit } from "./events";

// Find in files, with replace. A side view like Files and History, because
// that is where a student who has used any editor will look for it, and
// because results are a list of files — the same shape the Files view is.

interface SearchState extends SearchOptions {
  replacement: string;
  showReplace: boolean;
  /** Bumped to ask the field to take focus, e.g. after Ctrl/Cmd-Shift-F. */
  focusNonce: number;
  set: (patch: Partial<Omit<SearchState, "set" | "focusRequest">>) => void;
  focusRequest: (query?: string) => void;
}

/**
 * Kept outside the component so the query survives switching to Files and
 * back — the commonest move in a search is to look at a result, then return
 * to the list for the next one.
 */
export const useSearchState = create<SearchState>((set) => ({
  query: "",
  caseSensitive: false,
  wholeWord: false,
  regex: false,
  replacement: "",
  showReplace: false,
  focusNonce: 0,
  set: (patch) => set(patch),
  focusRequest: (query) =>
    set((s) => ({ focusNonce: s.focusNonce + 1, ...(query && query.trim() && !query.includes("\n") ? { query } : {}) })),
}));

export function SearchPanel({ onClose }: { onClose?: () => void }) {
  const project = useStudioStore((s) => s.project);
  const editFileContent = useStudioStore((s) => s.editFileContent);
  const dialog = useDialog();
  const state = useSearchState();
  const inputRef = useRef<HTMLInputElement>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  // Typing stays smooth on a big project: the search runs on a value React
  // may hold back by a frame while keystrokes are still arriving.
  const query = useDeferredValue(state.query);
  const options: SearchOptions = useMemo(
    () => ({ query, caseSensitive: state.caseSensitive, wholeWord: state.wholeWord, regex: state.regex }),
    [query, state.caseSensitive, state.wholeWord, state.regex],
  );

  const files = useMemo(
    () => (project ? listAllFiles(project).map((f) => ({ path: f.path, content: f.content ?? "" })) : []),
    [project],
  );
  const result = useMemo(() => searchFiles(files, options), [files, options]);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [state.focusNonce]);

  async function replaceIn(paths: string[]) {
    const targets = files.filter((f) => paths.includes(f.path));
    const count = result.results.filter((r) => paths.includes(r.path)).reduce((n, r) => n + r.matches.length, 0);
    if (count === 0) return;
    const ok = await dialog.confirm({
      title: paths.length === 1 ? `Replace in ${fileName(paths[0])}?` : `Replace in ${paths.length} files?`,
      description:
        `${count} match${count === 1 ? "" : "es"} of “${options.query}” will become “${state.replacement}”. ` +
        "Each file can be undone in the editor with Ctrl Z, and your version history keeps the old one too.",
      confirmLabel: "Replace",
    });
    if (!ok) return;
    for (const file of targets) {
      const next = replaceAll(file.content, options, state.replacement);
      if (next.count > 0) editFileContent(file.path, next.text);
    }
  }

  const toggle = (key: "caseSensitive" | "wholeWord" | "regex") => state.set({ [key]: !state[key] });

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--surface-0)]">
      <PaneHeader title="Search" onClose={onClose} closeLabel="Close search" />

      <div className="shrink-0 space-y-2 border-b border-[var(--line)] p-2.5">
        <div className="flex items-start gap-1.5">
          <button
            type="button"
            onClick={() => state.set({ showReplace: !state.showReplace })}
            aria-expanded={state.showReplace}
            aria-label={state.showReplace ? "Hide replace" : "Show replace"}
            title={state.showReplace ? "Hide replace" : "Replace too"}
            className="icon-btn icon-btn-sm tap-sq mt-1.5"
          >
            {state.showReplace ? <ChevronDownIcon /> : <ChevronRightIcon />}
          </button>
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="relative">
              <SearchIcon aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-faint)]" />
              <input
                ref={inputRef}
                value={state.query}
                onChange={(e) => state.set({ query: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Escape") inputRef.current?.blur();
                }}
                placeholder="Search all files"
                aria-label="Search all files"
                spellCheck={false}
                className="input !h-9 !pl-8 !pr-[5.5rem] !text-[13px]"
              />
              <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center">
                <OptionToggle label="Match case" pressed={state.caseSensitive} onClick={() => toggle("caseSensitive")}>
                  <CaseSensitive aria-hidden="true" strokeWidth={1.85} />
                </OptionToggle>
                <OptionToggle label="Whole words only" pressed={state.wholeWord} onClick={() => toggle("wholeWord")}>
                  <WholeWord aria-hidden="true" strokeWidth={1.85} />
                </OptionToggle>
                <OptionToggle label="Use a regular expression" pressed={state.regex} onClick={() => toggle("regex")}>
                  <Regex aria-hidden="true" strokeWidth={1.85} />
                </OptionToggle>
              </div>
            </div>
            {state.showReplace && (
              <div className="flex items-center gap-1.5">
                <input
                  value={state.replacement}
                  onChange={(e) => state.set({ replacement: e.target.value })}
                  placeholder="Replace with"
                  aria-label="Replace with"
                  spellCheck={false}
                  className="input !h-9 min-w-0 flex-1 !text-[13px]"
                />
                <button
                  type="button"
                  onClick={() => void replaceIn(result.results.map((r) => r.path))}
                  disabled={result.total === 0}
                  title="Replace every match in every file"
                  className="btn btn-secondary btn-sm shrink-0"
                >
                  <ReplaceIcon />
                  All
                </button>
              </div>
            )}
          </div>
        </div>
        {result.error ? (
          <p role="alert" className="text-[12.5px] text-[var(--danger)]">
            That pattern doesn&apos;t work: {result.error}
          </p>
        ) : options.query ? (
          <p className="text-[12.5px] text-[var(--text-faint)]" aria-live="polite">
            {result.total === 0
              ? "No results."
              : `${result.total}${result.truncated ? "+" : ""} result${result.total === 1 ? "" : "s"} in ${result.results.length} file${result.results.length === 1 ? "" : "s"}`}
          </p>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {!options.query ? (
          <div className="flex flex-col items-center px-6 py-10 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--text-dim)]">
              <SearchIcon className="h-5 w-5" />
            </span>
            <p className="mt-3 text-sm font-[var(--weight-strong)] text-[var(--text)]">Search every file</p>
            <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-dim)]">
              Find a word, a class name or a variable everywhere it is used — and change it everywhere at once.
            </p>
          </div>
        ) : (
          result.results.map((group) => {
            const open = !collapsed.has(group.path);
            return (
              <div key={group.path}>
                <div className="group flex items-center gap-1 pr-1.5">
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() =>
                      setCollapsed((prev) => {
                        const next = new Set(prev);
                        if (next.has(group.path)) next.delete(group.path);
                        else next.add(group.path);
                        return next;
                      })
                    }
                    className="tap flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1 text-left text-[13px] hover:bg-[var(--surface-2)]"
                  >
                    <ChevronRightIcon className={`h-3.5 w-3.5 shrink-0 text-[var(--text-faint)] transition-transform ${open ? "rotate-90" : ""}`} />
                    <FileTypeIcon path={group.path} className="h-4 w-4" />
                    <span className="truncate font-[var(--weight-ui)] text-[var(--text)]">{fileName(group.path)}</span>
                    {parentPath(group.path) && (
                      <span className="truncate text-[11.5px] text-[var(--text-faint)]">{parentPath(group.path)}</span>
                    )}
                    <span className="badge ml-auto !h-5 shrink-0 tabular-nums">{group.matches.length}</span>
                  </button>
                  {state.showReplace && (
                    <button
                      type="button"
                      onClick={() => void replaceIn([group.path])}
                      title={`Replace in ${fileName(group.path)}`}
                      aria-label={`Replace in ${fileName(group.path)}`}
                      className="icon-btn icon-btn-sm tap-sq opacity-70 group-hover:opacity-100"
                    >
                      <ReplaceIcon />
                    </button>
                  )}
                </div>
                {open && (
                  <ul>
                    {group.matches.map((m) => (
                      <li key={`${m.line}:${m.col}`}>
                        <button
                          type="button"
                          onClick={() => emit(WORKSPACE_EVENTS.reveal, { path: group.path, line: m.line, col: m.col, length: m.length })}
                          className="tap flex w-full items-baseline gap-2 py-1 pl-9 pr-2 text-left hover:bg-[var(--surface-2)]"
                        >
                          <span className="ide-mono w-7 shrink-0 text-right text-[11px] tabular-nums text-[var(--text-faint)]">{m.line}</span>
                          <MatchPreview match={m} replacement={state.showReplace ? state.replacement : null} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function OptionToggle({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={pressed} aria-label={label} title={label} className="icon-btn icon-btn-sm !h-7 !w-7">
      {children}
    </button>
  );
}

/** The line, with the match highlighted — and, while replacing, what it would become. */
function MatchPreview({ match, replacement }: { match: SearchMatch; replacement: string | null }) {
  const before = match.preview.slice(0, match.previewStart);
  const hit = match.preview.slice(match.previewStart, match.previewStart + match.length);
  const after = match.preview.slice(match.previewStart + match.length);
  return (
    <span className="ide-mono min-w-0 flex-1 truncate text-[12px] text-[var(--text-dim)]">
      {before}
      <mark className={replacement !== null ? "ide-hit ide-hit-replaced" : "ide-hit"}>{hit}</mark>
      {replacement !== null && <mark className="ide-hit-insert">{replacement}</mark>}
      {after}
    </span>
  );
}
