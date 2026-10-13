"use client";

import { useEffect, useRef, useState } from "react";
import { useStudioStore } from "@/store/useStudioStore";
import { isLoadingFor, useChatStore } from "@/store/useChatStore";
import {
  CodeIcon,
  DiffIcon,
  FilesIcon,
  HistoryIcon,
  KeyboardIcon,
  MonitorIcon,
  MoreIcon,
  ResetIcon,
  SearchIcon,
  SettingsIcon,
  SparkleIcon,
} from "@/components/icons";
import { PandaMark } from "@/components/Panda";
import { useWorkspaceLayout, type PhonePane, type SideView } from "./useWorkspaceLayout";
import { WORKSPACE_EVENTS, emit, modKey } from "./events";

// The way to every pane, and the way back from any of them.
//
// On a laptop it is a column of icons down the left edge, the way every
// desktop editor arranges it: the top group picks what the side bar shows
// (Files, Search, History), the middle group switches the panes beside the
// editor on and off. Every icon has a tooltip that names it and its shortcut,
// on hover and on keyboard focus, because an icon on its own is a guess.
//
// On a phone it is a bar along the bottom instead, and it picks the ONE pane
// on screen. Everything used to be an overlay on a phone: Files and the chat
// both started open on top of the code, and tapping a file opened it behind
// the overlay that was still covering it.

const SIDE: { view: SideView; label: string; keys?: string; Icon: typeof FilesIcon }[] = [
  { view: "files", label: "Files", Icon: FilesIcon },
  { view: "search", label: "Find in files", keys: "Shift F", Icon: SearchIcon },
  { view: "history", label: "History", Icon: HistoryIcon },
];

export function ActivityRail({ onShortcuts, onSettings }: { onShortcuts: () => void; onSettings: () => void }) {
  const layout = useWorkspaceLayout();
  const project = useStudioStore((s) => s.project);
  const busy = useChatStore((s) => isLoadingFor(s, project?.id));
  const mod = modKey();

  const toggles: { key: "changes" | "preview" | "chat"; label: string; Icon: React.ReactNode }[] = [
    { key: "changes", label: "Changes", Icon: <DiffIcon /> },
    { key: "preview", label: "Preview", Icon: <MonitorIcon /> },
    {
      key: "chat",
      label: "Panda",
      Icon: busy ? (
        <span className="relative">
          <SparkleIcon />
          <span aria-hidden className="activity-dot absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[var(--accent)]" />
        </span>
      ) : (
        <SparkleIcon />
      ),
    },
  ];

  return (
    <nav
      aria-label="Workspace"
      className="hidden w-12 shrink-0 flex-col items-center gap-1 border-r border-[var(--line)] bg-[var(--surface-0)] py-2 md:flex"
    >
      {SIDE.map(({ view, label, keys, Icon }) => {
        const current = layout.side === view;
        return (
          <button
            key={view}
            type="button"
            onClick={() => layout.toggleSide(view)}
            aria-current={current ? "true" : undefined}
            aria-label={current ? `Hide ${label}` : label}
            data-tip={keys ? `${label}  ·  ${mod} ${keys}` : label}
            data-tip-side="right"
            className="ide-rail-btn ide-tip"
          >
            <Icon />
          </button>
        );
      })}

      <span aria-hidden className="my-1.5 h-px w-6 bg-[var(--line)]" />

      {toggles.map(({ key, label, Icon }) => {
        const open = layout.visible[key];
        return (
          <button
            key={key}
            type="button"
            onClick={() => layout.toggle(key)}
            aria-pressed={open}
            aria-label={open ? `Hide ${label}` : `Show ${label}`}
            data-tip={open ? `Hide ${label}` : `Show ${label}`}
            data-tip-side="right"
            className="ide-rail-btn ide-tip"
          >
            {Icon}
          </button>
        );
      })}

      <span className="flex-1" />

      <button type="button" onClick={onShortcuts} aria-label="Keyboard shortcuts" data-tip="Keyboard shortcuts  ·  ?" data-tip-side="right" className="ide-rail-btn ide-tip">
        <KeyboardIcon />
      </button>
      <button type="button" onClick={onSettings} aria-label="Editor settings" data-tip={`Editor settings  ·  ${mod} ,`} data-tip-side="right" className="ide-rail-btn ide-tip">
        <SettingsIcon />
      </button>
      <button type="button" onClick={() => layout.reset()} aria-label="Reset the layout" data-tip="Put every pane back where it started" data-tip-side="right" className="ide-rail-btn ide-tip">
        <ResetIcon />
      </button>
    </nav>
  );
}

const PHONE_MAIN: { pane: PhonePane; label: string; Icon: React.ReactNode }[] = [
  { pane: "files", label: "Files", Icon: <FilesIcon /> },
  { pane: "editor", label: "Code", Icon: <CodeIcon /> },
  { pane: "preview", label: "Preview", Icon: <MonitorIcon /> },
  { pane: "chat", label: "Panda", Icon: <PandaMark className="h-5 w-5 rounded-full ring-1 ring-[var(--line-strong)]" /> },
];

const PHONE_MORE: { pane: PhonePane; label: string; Icon: React.ReactNode }[] = [
  { pane: "search", label: "Find in files", Icon: <SearchIcon /> },
  { pane: "history", label: "History", Icon: <HistoryIcon /> },
  { pane: "changes", label: "Changes", Icon: <DiffIcon /> },
];

/** The phone's bottom bar: one pane at a time, and the rest behind More. */
export function PhoneNav() {
  const pane = useWorkspaceLayout((s) => s.phonePane);
  const reveal = useWorkspaceLayout((s) => s.reveal);
  const project = useStudioStore((s) => s.project);
  const busy = useChatStore((s) => isLoadingFor(s, project?.id));
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const inMore = PHONE_MORE.some((m) => m.pane === pane);

  useEffect(() => {
    if (!moreOpen) return;
    function onDown(e: PointerEvent) {
      if (!moreRef.current?.contains(e.target as Node)) setMoreOpen(false);
    }
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [moreOpen]);

  return (
    <nav
      aria-label="Workspace"
      className="relative flex shrink-0 items-stretch border-t border-[var(--line)] bg-[var(--surface-0)] pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {PHONE_MAIN.map((item) => {
        const current = pane === item.pane;
        return (
          <button
            key={item.pane}
            type="button"
            onClick={() => reveal(item.pane)}
            aria-current={current ? "page" : undefined}
            className={`relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-[var(--weight-ui)] ${
              current ? "text-[var(--accent-text)]" : "text-[var(--text-faint)]"
            }`}
          >
            {current && <span aria-hidden className="absolute inset-x-5 top-0 h-[3px] rounded-b-full bg-[var(--accent)]" />}
            <span className="relative flex h-6 items-center [&>svg]:h-5 [&>svg]:w-5">
              {item.Icon}
              {item.pane === "chat" && busy && (
                <span aria-hidden className="activity-dot absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-[var(--accent)]" />
              )}
            </span>
            {item.label}
          </button>
        );
      })}
      <div ref={moreRef} className="relative flex flex-1">
        <button
          type="button"
          onClick={() => setMoreOpen((o) => !o)}
          aria-expanded={moreOpen}
          aria-haspopup="menu"
          className={`relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-[var(--weight-ui)] ${
            inMore ? "text-[var(--accent-text)]" : "text-[var(--text-faint)]"
          }`}
        >
          {inMore && <span aria-hidden className="absolute inset-x-5 top-0 h-[3px] rounded-b-full bg-[var(--accent)]" />}
          <span className="flex h-6 items-center [&>svg]:h-5 [&>svg]:w-5">
            <MoreIcon />
          </span>
          More
        </button>
        {moreOpen && (
          <div role="menu" className="menu absolute bottom-full right-2 mb-2 w-56">
            {PHONE_MORE.map((item) => (
              <button
                key={item.pane}
                type="button"
                role="menuitem"
                data-active={pane === item.pane ? true : undefined}
                onClick={() => {
                  reveal(item.pane);
                  setMoreOpen(false);
                }}
                className="menu-item tap"
              >
                {item.Icon}
                {item.label}
              </button>
            ))}
            <div aria-hidden className="my-1 h-px bg-[var(--line)]" />
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMoreOpen(false);
                emit(WORKSPACE_EVENTS.openSettings);
              }}
              className="menu-item tap"
            >
              <SettingsIcon />
              Editor settings
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
