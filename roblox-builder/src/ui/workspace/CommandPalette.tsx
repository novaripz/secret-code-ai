"use client";

import { Bot, Box, CornerDownLeft, FileCode2, GitBranch, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { dottedPath, walk } from "@/core/roblox/instance";
import { cx } from "../common/ui";
import { useLayout } from "./layout";
import { PANELS, panelAvailable } from "./panels";
import { useWorkspace } from "./store";

export interface Command {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon?: React.ReactNode;
  run: () => void;
}

function score(q: string, text: string): number {
  if (!q) return 1;
  const t = text.toLowerCase();
  const s = q.toLowerCase();
  if (t.includes(s)) return 100 - t.indexOf(s);
  let i = 0;
  for (const ch of t) if (ch === s[i]) i++;
  return i === s.length ? 10 : 0;
}

export function CommandPalette({ open, onClose, commands }: { open: boolean; onClose: () => void; commands: Command[] }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const files = useWorkspace((s) => s.files);
  const build = useWorkspace((s) => s.build);
  const branches = useWorkspace((s) => s.branches);
  const kind = useWorkspace((s) => s.meta?.kind);
  const { open: openPanel } = useLayout();

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQ("");
      setSel(0);
    }
  }
  useEffect(() => {
    if (open) setTimeout(() => input.current?.focus(), 10);
  }, [open]);

  const all = useMemo<Command[]>(() => {
    const out: Command[] = [...commands];
    for (const [id, p] of Object.entries(PANELS)) {
      if (!panelAvailable(id, kind)) continue;
      const Icon = p.icon;
      out.push({ id: `panel-${id}`, label: `Show ${p.title}`, group: "Panels", icon: <Icon className="size-4" />, run: () => openPanel(id) });
    }
    for (const b of branches) {
      out.push({ id: `branch-${b.name}`, label: `Switch to branch ${b.name}`, hint: b.label, group: "Branches", icon: <GitBranch className="size-4" />, run: () => useWorkspace.getState().switchBranch(b.name) });
    }
    for (const p of files.keys()) {
      out.push({
        id: `file-${p}`,
        label: p,
        group: "Files",
        icon: <FileCode2 className="size-4" />,
        run: () => {
          useWorkspace.getState().openFile(p);
          openPanel("editor");
        },
      });
    }
    if (build) {
      walk(build.root, (n, _p, depth) => {
        if (depth === 0 || depth > 8) return;
        out.push({
          id: `inst-${n.id}`,
          label: dottedPath(n.id),
          hint: n.className,
          group: "Instances",
          icon: <Box className="size-4" />,
          run: () => {
            useWorkspace.getState().selectInstance(n.id);
            openPanel("hierarchy");
          },
        });
      });
    }
    return out;
  }, [commands, files, build, branches, kind, openPanel]);

  const results = useMemo(() => {
    const scored = all.map((c) => ({ c, s: score(q, `${c.label} ${c.hint ?? ""}`) })).filter((x) => x.s > 0);
    scored.sort((a, b) => b.s - a.s);
    const list = scored.slice(0, 60).map((x) => x.c);
    if (q.trim().length > 3) {
      list.push({
        id: "ask",
        label: `Ask the agent: “${q.trim()}”`,
        group: "Agent",
        icon: <Bot className="size-4" />,
        run: () => useWorkspace.getState().startRun(q.trim(), "chat"),
      });
    }
    return list;
  }, [all, q]);

  if (!open) return null;
  const run = (c?: Command) => {
    if (!c) return;
    onClose();
    c.run();
  };
  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/40 p-4 pt-[12vh] animate-fade-in" onMouseDown={onClose}>
      <div className="glass w-full max-w-xl overflow-hidden rounded-2xl animate-rise" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Search className="size-4 text-fg-3" />
          <input
            ref={input}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel((s) => Math.min(results.length - 1, s + 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel((s) => Math.max(0, s - 1));
              }
              if (e.key === "Enter") run(results[sel]);
            }}
            placeholder="Search commands, files, instances… or ask the agent"
            className="h-12 flex-1 bg-transparent text-sm focus:outline-none"
          />
          <span className="kbd">esc</span>
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-1.5">
          {results.length === 0 && <div className="p-6 text-center text-sm text-fg-3">No matches</div>}
          {results.map((c, i) => (
            <button
              key={c.id}
              onMouseEnter={() => setSel(i)}
              onClick={() => run(c)}
              className={cx("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm", i === sel ? "bg-accent/15 text-fg" : "text-fg-2")}
            >
              <span className="text-fg-3">{c.icon}</span>
              <span className="min-w-0 flex-1 truncate">{c.label}</span>
              {c.hint && <span className="truncate text-xs text-fg-3">{c.hint}</span>}
              <span className="text-[10px] uppercase tracking-wide text-fg-3">{c.group}</span>
              {i === sel && <CornerDownLeft className="size-3.5 text-fg-3" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
