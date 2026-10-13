"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { create } from "zustand";

import { useI18n } from "@/lib/i18n";
import { useAssistantStore } from "@/store/useAssistantStore";
import { useProfileStore } from "@/store/useProfileStore";
import { Modal } from "@/components/ui/Dialog";
import { useReportDialog } from "@/components/ReportDialog";
import { CornerDownLeft } from "lucide-react";
import {
  BrainIcon,
  BugIcon,
  ChatIcon,
  LanguagesIcon,
  MoonIcon,
  PaletteIcon,
  PlusIcon,
  SearchIcon,
  SunIcon,
} from "@/components/icons";
import { NAV } from "./nav";
import { useIsDark } from "./ThemeToggle";

// Ctrl/Cmd+K, from any screen inside the shell: start a chat, find an old one,
// jump to a section, flip the theme. A student who knows where they want to go
// should not have to open a drawer on a phone or hunt down a sidebar to get
// there.
//
// Only shell screens get this one. The build workspace (/project) has its own
// palette full of file commands, and two palettes answering the same keys is
// one too many — so this listens only while the shell is on screen and steps
// aside on /project even if something there were to render the shell.

export const usePalette = create<{ open: boolean; setOpen: (open: boolean) => void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

interface Command {
  id: string;
  group: "actions" | "goto" | "chats";
  label: string;
  hint?: string;
  icon: ReactNode;
  keywords?: string;
  run: () => void;
}

export function CommandPalette() {
  const open = usePalette((s) => s.open);
  const setOpen = usePalette((s) => s.setOpen);
  const pathname = usePathname();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.key.toLowerCase() !== "k") return;
      if (pathname?.startsWith("/project")) return;
      // Ctrl+K is the browser's "search the web" in Chrome and Firefox;
      // inside the app it means this.
      e.preventDefault();
      setOpen(!usePalette.getState().open);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pathname, setOpen]);

  // A palette left open across a navigation is a palette pointing at the
  // screen the student just left.
  useEffect(() => {
    setOpen(false);
  }, [pathname, setOpen]);

  if (!open) return null;
  return <PaletteDialog onClose={() => setOpen(false)} />;
}

function PaletteDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);

  const threads = useAssistantStore((s) => s.threads);
  const newThread = useAssistantStore((s) => s.newThread);
  const toggleTheme = useProfileStore((s) => s.toggleTheme);
  const showReport = useReportDialog((s) => s.show);
  const dark = useIsDark();

  const commands = useMemo<Command[]>(() => {
    const go = (href: string) => () => router.push(href);
    const actions: Command[] = [
      {
        id: "new-chat",
        group: "actions",
        label: t("nav.newChat"),
        icon: <PlusIcon />,
        run: () => {
          newThread();
          router.push("/");
        },
      },
      {
        id: "theme",
        group: "actions",
        label: t(dark ? "theme.switchToLight" : "theme.switchToDark"),
        icon: dark ? <SunIcon /> : <MoonIcon />,
        keywords: "theme dark light mode",
        run: toggleTheme,
      },
      {
        id: "report",
        group: "actions",
        label: t("report.title"),
        icon: <BugIcon />,
        keywords: "bug feedback flag",
        run: () => showReport(),
      },
    ];
    const goto: Command[] = [
      ...NAV.map(({ href, label, icon: Icon }) => ({
        id: `go:${href}`,
        group: "goto" as const,
        label: t(label),
        icon: <Icon />,
        run: go(href),
      })),
      {
        id: "go:appearance",
        group: "goto",
        label: `${t("nav.settings")} › ${t("settings.appearance")}`,
        icon: <PaletteIcon />,
        run: go("/settings?tab=appearance"),
      },
      {
        id: "go:memory",
        group: "goto",
        label: `${t("nav.settings")} › ${t("settings.memory")}`,
        icon: <BrainIcon />,
        run: go("/settings?tab=memory"),
      },
      {
        id: "go:language",
        group: "goto",
        label: `${t("nav.settings")} › ${t("settings.language")}`,
        icon: <LanguagesIcon />,
        run: go("/settings?tab=language"),
      },
    ];
    const chats: Command[] = threads.map((th) => ({
      id: `chat:${th.id}`,
      group: "chats",
      label: th.title,
      icon: <ChatIcon />,
      run: go(`/?c=${th.id}`),
    }));
    return [...actions, ...goto, ...chats];
  }, [t, dark, threads, router, newThread, toggleTheme, showReport]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      // With nothing typed, the most recent chats are worth showing but the
      // whole history is not — that is what typing is for.
      let seen = 0;
      return commands.filter((c) => c.group !== "chats" || seen++ < 5);
    }
    const words = q.split(/\s+/);
    return commands.filter((c) => {
      const hay = `${c.label} ${c.keywords ?? ""}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [commands, query]);

  const selected = Math.min(index, Math.max(0, results.length - 1));

  // The highlighted row stays in view as the arrows move past the edge.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${selected}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  function choose(cmd: Command | undefined) {
    if (!cmd) return;
    onClose();
    cmd.run();
  }

  const GROUP_TITLE = { actions: t("nav.paletteActions"), goto: t("nav.paletteGoTo"), chats: t("nav.paletteChats") };

  return (
    <Modal open onClose={onClose} label={t("nav.paletteTitle")} initialFocus={inputRef} placement="top" className="max-w-xl overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-[var(--line)] px-4">
        <SearchIcon className="h-[18px] w-[18px] shrink-0 text-[var(--text-faint)]" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setIndex((i) => Math.min(i + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              choose(results[selected]);
            }
          }}
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={results[selected] ? `${listId}-${selected}` : undefined}
          aria-label={t("nav.palettePlaceholder")}
          placeholder={t("nav.palettePlaceholder")}
          className="h-14 min-w-0 flex-1 bg-transparent text-[15px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus-visible:outline-none"
        />
        <kbd className="kbd hidden sm:inline-flex">Esc</kbd>
      </div>

      <div ref={listRef} id={listId} role="listbox" aria-label={t("nav.paletteTitle")} className="max-h-[min(60vh,26rem)] overflow-y-auto p-2">
        {results.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-[var(--text-faint)]">{t("nav.paletteNoResults", { query: query.trim() })}</p>
        ) : (
          results.map((cmd, i) => {
            const first = i === 0 || results[i - 1].group !== cmd.group;
            return (
              <div key={cmd.id}>
                {first && <p className="eyebrow px-3 pb-1.5 pt-2.5">{GROUP_TITLE[cmd.group]}</p>}
                <div
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === selected}
                  data-index={i}
                  onMouseMove={() => setIndex(i)}
                  onClick={() => choose(cmd)}
                  className="palette-item tap"
                >
                  <span className="palette-icon">{cmd.icon}</span>
                  <span className="min-w-0 flex-1 truncate">{cmd.label}</span>
                  {i === selected && (
                    <CornerDownLeft aria-hidden="true" strokeWidth={1.85} className="h-4 w-4 shrink-0 text-[var(--text-faint)]" />
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </Modal>
  );
}
