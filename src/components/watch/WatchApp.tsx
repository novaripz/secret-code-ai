"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { isVideoId } from "@/lib/watch/parse";
import { findTopic, readFilters } from "@/lib/watch/query";
import { useWatchStore } from "@/store/useWatchStore";
import { ToastHost, GridSkeleton } from "./bits";
import { pageControls } from "./controls";
import { HomeView } from "./HomeView";
import { LibraryView } from "./LibraryView";
import { ResultsView } from "./ResultsView";
import { ShortcutsSheet } from "./ShortcutsSheet";
import { TopBar } from "./TopBar";
import { WatchView } from "./WatchView";
import { cameFromWatch, setTheater, useTheater } from "./session";
import { useWatchNav, type LibraryList } from "./nav";

// Watch, as one page that reads the address bar and draws one of four views:
// home, search results, a video, or the library. See nav.ts for the URL shape.
//
// This component also owns the things that span every view: the top bar, the
// page-wide keyboard shortcuts, the shortcut sheet, the toast, and putting the
// scroll position back where it was when a student presses Back.

const LISTS: LibraryList[] = ["later", "history", "continue"];

/** True when a key press is going into something the student is typing in. */
function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT";
}

export function WatchApp() {
  const params = useSearchParams();
  const nav = useWatchNav();
  const theater = useTheater();
  const hydrate = useWatchStore((s) => s.hydrate);

  const v = params.get("v");
  const q = params.get("q")?.trim() ?? "";
  const listParam = params.get("list") as LibraryList | null;
  const list = listParam && LISTS.includes(listParam) ? listParam : null;
  const topic = findTopic(params.get("c"))?.id ?? null;
  const filters = readFilters(params);

  const view = isVideoId(v) ? "watch" : q ? "results" : list ? "library" : "home";

  const [sheet, setSheet] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // --- Scroll: top for a new page, where it was for Back ----------------------
  // The page scrolls inside this container, not the document, so Next's own
  // scroll handling never sees it.
  const here = params.toString();
  const positions = useRef(new Map<string, number>());
  const popped = useRef(false);
  useEffect(() => {
    const onPop = () => {
      popped.current = true;
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = popped.current ? (positions.current.get(here) ?? 0) : 0;
    popped.current = false;
  }, [here]);

  // --- Keyboard ------------------------------------------------------------------
  const closeSheet = useCallback(() => setSheet(false), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (typing(e.target)) return;
      const controls = view === "watch" ? pageControls.current : null;
      const onButton = (e.target as HTMLElement | null)?.closest("button, a, [role=tab], [role=switch]");

      switch (e.key) {
        case "/":
          e.preventDefault();
          searchRef.current?.focus();
          return;
        case "?":
          e.preventDefault();
          setSheet(true);
          return;
        case "Escape":
          if (view !== "watch") return;
          e.preventDefault();
          if (theater) setTheater(false);
          else if (cameFromWatch()) nav.back();
          else nav.home();
          return;
        case "t":
          if (view !== "watch") return;
          setTheater(!theater);
          return;
        case "N":
          if (e.shiftKey) controls?.next();
          return;
      }

      if (!controls) return;
      switch (e.key) {
        case "k":
          controls.togglePlay();
          break;
        case " ":
          // Space on a focused button presses the button; only take it when
          // nothing else wants it.
          if (onButton) return;
          e.preventDefault();
          controls.togglePlay();
          break;
        case "j":
          controls.seekBy(-10);
          break;
        case "l":
          controls.seekBy(10);
          break;
        case "m":
          controls.toggleMute();
          break;
        case "w":
          controls.toggleLater();
          break;
        case "a":
          controls.askPanda();
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, theater, nav]);

  return (
    <div className="relative flex h-full flex-col bg-bg">
      <TopBar query={view === "results" ? q : ""} onHome={view === "home"} inputRef={searchRef} onShortcuts={() => setSheet(true)} />

      <div
        ref={scrollRef}
        className="@container relative min-h-0 flex-1 overflow-y-auto overscroll-contain"
        onScroll={(e) => positions.current.set(here, e.currentTarget.scrollTop)}
      >
        {view === "watch" ? (
          <WatchView id={v!} />
        ) : view === "results" ? (
          <ResultsView q={q} filters={filters} />
        ) : view === "library" ? (
          <LibraryView list={list!} />
        ) : (
          <HomeView topic={topic} />
        )}
      </div>

      {sheet && <ShortcutsSheet onClose={closeSheet} />}
      <ToastHost />
    </div>
  );
}

/** What shows for the instant before the address bar has been read. */
export function WatchFallback() {
  return (
    <div className="flex h-full flex-col">
      <div className="h-[60px] shrink-0 border-b border-line" />
      <div className="mx-auto w-full max-w-[1760px] px-4 pt-16 sm:px-6">
        <GridSkeleton />
      </div>
    </div>
  );
}
