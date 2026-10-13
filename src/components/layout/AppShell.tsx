"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";

import "@/styles/shell-chat.css";
import { useI18n } from "@/lib/i18n";
import { EnglishOffer } from "@/components/onboarding/EnglishOffer";
import { ReportDialogHost } from "@/components/ReportDialog";
import { Sidebar } from "@/components/shell/Sidebar";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { CommandPalette, usePalette } from "@/components/shell/CommandPalette";
import { sectionFor, usesShell } from "@/components/shell/nav";
import { MenuIcon, SearchIcon } from "@/components/icons";

// The frame around every student screen: the sidebar on the left, a slim
// header, and the page.
//
// DRAWN ONCE, NOT PER PAGE.
// Every page wraps itself in <AppShell>, which used to mean every tab switch
// unmounted the whole frame and built a new one: the chat list jumped back to
// the top, the teacher role was fetched again, and anything half-done in the
// sidebar was thrown away. Now the root providers draw the frame once for every
// shell route (`ShellHost`), and an <AppShell> rendered inside it is a
// pass-through. Pages keep wrapping themselves exactly as they did — nothing
// outside this file had to change — and a page rendered somewhere without a
// host (or a future route not on the list) still gets the full frame from its
// own <AppShell>.

const HostContext = createContext(false);

/** Where a page can put its own title and actions in the header (the chat does). */
const HeaderSlotContext = createContext<HTMLElement | null>(null);

/** The header element a page may portal into, or null before it exists. */
export function useShellHeaderSlot(): HTMLElement | null {
  return useContext(HeaderSlotContext);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const hosted = useContext(HostContext);
  if (hosted) return <>{children}</>;
  return <ShellFrame>{children}</ShellFrame>;
}

/** Rendered once by the root providers. Draws the frame for shell routes only. */
export function ShellHost({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (!usesShell(pathname)) return <>{children}</>;
  return (
    <HostContext.Provider value={true}>
      <ShellFrame>{children}</ShellFrame>
    </HostContext.Provider>
  );
}

/** Whether to spell the shortcut ⌘K or Ctrl K. Read once; it never changes. */
function useIsMac(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent),
    () => false,
  );
}

function ShellFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useI18n();
  // The drawer remembers the page it was opened on, so following any link
  // (or Back) closes it without an effect having to notice the navigation.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const sidebarOpen = openOn !== null && openOn === pathname;
  const setSidebarOpen = (open: boolean) => setOpenOn(open ? pathname : null);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const section = sectionFor(pathname);
  const asideRef = useRef<HTMLElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const openPalette = usePalette((s) => s.setOpen);
  const mac = useIsMac();

  // The drawer is a modal on a phone, so it has to behave like one: Escape
  // closes it, focus starts inside it, Tab cannot walk out of it, and closing
  // puts focus back on the button that opened it. Without the last part a
  // keyboard or screen-reader user is dropped at the top of the document every
  // time they dismiss the menu.
  //
  // All of it is skipped above `md`, where the sidebar is not a drawer at all
  // but a permanent column — trapping focus in a column nobody opened would be
  // a bug, not a feature.
  useEffect(() => {
    if (!sidebarOpen) return;

    const aside = asideRef.current;
    // Captured now rather than read in the cleanup: by the time the cleanup
    // runs React may have re-rendered the header and the ref would point at a
    // different node (or none), which is exactly the lint rule's complaint.
    const opener = openerRef.current;
    aside?.querySelector<HTMLElement>("a, button")?.focus();

    function onKeyDown(e: KeyboardEvent) {
      // A menu or dialog inside the drawer spends Escape first.
      if (e.defaultPrevented) return;
      if (e.key === "Escape") {
        setOpenOn(null);
        return;
      }
      if (e.key !== "Tab" || !aside) return;
      // `visibility: hidden` already keeps the closed drawer out of the tab
      // order; this is only about the open one, so a plain query is enough.
      const focusable = aside.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      opener?.focus();
    };
  }, [sidebarOpen]);

  return (
    // h-dvh, not h-screen: `vh` on a mobile browser is measured against the
    // viewport with the URL bar HIDDEN, so a 100vh app column is taller than
    // the screen and the composer pinned to its bottom sits under the chrome.
    // `dvh` tracks the space actually available, including when the keyboard
    // takes half of it.
    <div className="flex h-dvh overflow-hidden bg-[var(--bg)] text-[var(--text)]">
      {/* Mobile drawer scrim. `touch-none` so a drag on the scrim dismisses
          rather than scrolling the page it is covering. */}
      {sidebarOpen && (
        <button
          type="button"
          aria-label={t("nav.closeMenu")}
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 touch-none bg-black/50 backdrop-blur-[1px] md:hidden"
        />
      )}

      <a href="#main" className="skip-link">
        {t("nav.skipToContent")}
      </a>

      <aside
        ref={asideRef}
        aria-label={t("nav.sidebar")}
        // `invisible` is doing real work, not decoration. A drawer parked
        // off-screen with `-translate-x-full` is still focusable, so before
        // this a phone user tabbing from the header walked through the entire
        // chat list they could not see. visibility:hidden removes it from the
        // tab order and still animates.
        // Logical sides (start/end), so in Arabic the column and its drawer
        // sit on the right, where a right-to-left reader starts.
        className={`shell-sidebar fixed inset-y-0 start-0 z-40 w-[min(19rem,86vw)] shrink-0 border-e border-[var(--line)] bg-[var(--surface-0)] transition-[translate,visibility] duration-200 md:visible md:static md:w-[17rem] md:translate-x-0 ${
          sidebarOpen ? "translate-x-0 shadow-ui-pop" : "invisible -translate-x-full max-md:rtl:translate-x-full"
        }`}
      >
        {/* Following a link inside closes the phone drawer; anything else
            (opening a chat's menu, typing in search) leaves it open. */}
        <div
          className="h-full"
          onClick={(e) => {
            if ((e.target as Element).closest("a")) setSidebarOpen(false);
          }}
        >
          <Sidebar onClose={() => setSidebarOpen(false)} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-1 border-b border-[var(--line)] bg-[var(--bg)] px-2 md:px-4">
          <button
            ref={openerRef}
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-label={t("nav.openMenu")}
            title={t("nav.openMenu")}
            aria-expanded={sidebarOpen}
            className="icon-btn md:hidden"
          >
            <MenuIcon />
          </button>

          {/* The page's own place in the header. The chat puts the open
              conversation's title and its menu here; everything else shows
              the section it belongs to. */}
          {pathname !== "/" && (
            <span className="flex min-w-0 items-center gap-2 px-1 text-[15px] font-semibold text-[var(--text)]">
              {section && <section.icon className="hidden h-4 w-4 shrink-0 text-[var(--text-faint)] md:block" />}
              <span className="truncate">{section ? t(section.label) : pathname?.startsWith("/teacher") ? "Teacher" : "Panda"}</span>
            </span>
          )}
          <div ref={setSlot} className="flex min-w-0 flex-1 items-center gap-1" />

          <button
            type="button"
            onClick={() => openPalette(true)}
            aria-label={t("nav.paletteOpen")}
            title={t("nav.paletteOpen")}
            aria-keyshortcuts="Control+K Meta+K"
            className="palette-trigger"
          >
            <SearchIcon className="h-4 w-4" />
            <span className="hidden lg:inline">{t("nav.paletteTrigger")}</span>
            <kbd className="kbd ml-auto hidden lg:inline-flex">{mac ? "⌘K" : "Ctrl K"}</kbd>
          </button>
          <ThemeToggle />
        </header>

        <HeaderSlotContext.Provider value={slot}>
          <main id="main" className="min-h-0 flex-1 overflow-hidden">
            {children}
          </main>
        </HeaderSlotContext.Provider>
      </div>

      {/* Sits over the student screens only. Deliberately not in the root
          providers: the build workspace is a full-screen editor, and a card
          that floats over someone's code is an interruption, not an offer. */}
      <EnglishOffer />
      <ReportDialogHost />
      <CommandPalette />
    </div>
  );
}
