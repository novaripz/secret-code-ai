"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useI18n, type StringKey } from "@/lib/i18n";
import { useTeacherStore } from "@/components/teacher/store";
import { useAssistantStore } from "@/store/useAssistantStore";
import { useProfileStore } from "@/store/useProfileStore";
import { useDialog } from "@/components/ui/Dialog";
import { Wordmark } from "@/components/Wordmark";
import { ReportDialog } from "@/components/ReportDialog";
import { EnglishOffer } from "@/components/onboarding/EnglishOffer";
import {
  BookIcon,
  ChatIcon,
  CheckIcon,
  HammerIcon,
  VideoIcon,
  MenuIcon,
  MoonIcon,
  PencilIcon,
  PlusIcon,
  SettingsIcon,
  SunIcon,
  TrashIcon,
  UserIcon,
  XIcon,
} from "@/components/icons";

// The frame around every non-studio page: chat history on the left, the three
// main sections across the top, and the user's own card at the bottom.


// The tabs down the side. Everything a student needs lives in here, so they
// never have to leave for a browser tab that has the rest of the internet in it.
const NAV: { href: string; label: StringKey; icon: (props: { className?: string }) => React.ReactElement }[] = [
  { href: "/", label: "nav.chat", icon: ChatIcon },
  { href: "/classes", label: "nav.classes", icon: BookIcon },
  { href: "/plan", label: "nav.plan", icon: CheckIcon },
  { href: "/watch", label: "nav.watch", icon: VideoIcon },
  { href: "/build", label: "nav.build", icon: HammerIcon },
  { href: "/settings", label: "nav.settings", icon: SettingsIcon },
];

/** Which nav entry names the page currently open, for the header. */
function here(pathname: string): StringKey | undefined {
  const match = NAV.find((n) => (n.href === "/" ? pathname === "/" : pathname.startsWith(n.href)));
  return match?.label;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const section = here(pathname);
  const asideRef = useRef<HTMLElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);

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
      if (e.key === "Escape") {
        setSidebarOpen(false);
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
          aria-label={t("nav.closeMenu")}
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 touch-none bg-black/50 md:hidden"
        />
      )}

      <a href="#main" className="skip-link">{t("nav.skipToContent")}</a>

      <aside
        ref={asideRef}
        aria-label={t("nav.sidebar")}
        // `invisible` is doing real work, not decoration. A drawer parked
        // off-screen with `-translate-x-full` is still focusable, so before
        // this a phone user tabbing from the header walked through the entire
        // chat list they could not see. visibility:hidden removes it from the
        // tab order and still animates.
        className={`fixed inset-y-0 left-0 z-40 w-[min(19rem,85vw)] shrink-0 border-r border-[var(--line)] bg-[var(--surface-0)] transition-transform md:visible md:static md:w-64 md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "invisible -translate-x-full"
        }`}
      >
        {/* Any click that lands on a link inside also closes the mobile drawer. */}
        <div className="h-full" onClick={() => setSidebarOpen(false)}>
          <Sidebar onClose={() => setSidebarOpen(false)} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-1 border-b border-[var(--line)] px-2 md:px-3">
          <button
            ref={openerRef}
            onClick={() => setSidebarOpen(true)}
            aria-label={t("nav.openMenu")}
            aria-expanded={sidebarOpen}
            className="tap-sq flex items-center justify-center rounded-lg px-2 text-[var(--text-dim)] hover:bg-[var(--surface-2)] md:hidden"
          >
            <MenuIcon className="h-6 w-6 md:h-5 md:w-5" />
          </button>

          {/* Navigation lives in the sidebar now, so the header just carries
              the current place and the theme switch. */}
          <span className="truncate px-1 text-[15px] font-medium text-[var(--text-dim)] md:text-sm">
            {section ? t(section) : "Panda"}
          </span>

          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>

        <main id="main" className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>

      {/* Sits over the student screens only. Deliberately not in the root
          providers: the build workspace is a full-screen editor, and a card
          that floats over someone's code is an interruption, not an offer. */}
      <EnglishOffer />
    </div>
  );
}

function ThemeToggle() {
  const theme = useProfileStore((s) => s.theme);
  const toggleTheme = useProfileStore((s) => s.toggleTheme);
  const dark = theme === "dark";
  const { t } = useI18n();
  const label = t(dark ? "theme.switchToLight" : "theme.switchToDark");

  return (
    <button
      onClick={toggleTheme}
      title={label}
      aria-label={label}
      className="tap-sq flex items-center justify-center rounded-full p-2 text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
    >
      {dark ? <SunIcon className="h-5 w-5 md:h-4.5 md:w-4.5" /> : <MoonIcon className="h-5 w-5 md:h-4.5 md:w-4.5" />}
    </button>
  );
}

/**
 * The one entry students never see. The role comes from `profiles`, so this
 * appears only for an account Postgres itself calls a teacher — and it is a
 * convenience, not a guard: /teacher checks again, and row-level security is
 * what actually holds. Its label is not translated because the teacher screens
 * behind it are English-only for now; saying "Teacher" in English is more
 * honest than translating a door into a room that isn't.
 */
function TeacherLink() {
  const pathname = usePathname();
  const role = useTeacherStore((s) => s.role);
  const loadRole = useTeacherStore((s) => s.loadRole);

  useEffect(() => {
    void loadRole();
  }, [loadRole]);

  if (role !== "teacher") return null;
  const active = pathname.startsWith("/teacher");

  return (
    <Link
      href="/teacher"
      className={`tap flex items-center gap-3 rounded-lg px-2.5 py-2 text-[15px] transition-colors md:gap-2.5 md:text-sm ${
        active
          ? "bg-[var(--surface-2)] text-[var(--text)]"
          : "text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
      }`}
    >
      <UserIcon className="h-5 w-5 shrink-0 md:h-4 md:w-4" />
      Teacher
    </Link>
  );
}

function Sidebar({ onClose }: { onClose: () => void }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const [reporting, setReporting] = useState(false);
  const dialog = useDialog();
  const { threads, activeThread, hydrated, hydrate, newThread, openThread, deleteThread, renameThread } =
    useAssistantStore();

  const displayName = useProfileStore((s) => s.displayName);
  const avatar = useProfileStore((s) => s.profile.avatar);
  const profileHydrated = useProfileStore((s) => s.hydrated);

  useEffect(() => {
    if (!hydrated) void hydrate();
  }, [hydrated, hydrate]);

  async function handleRename(id: string, current: string) {
    const title = await dialog.prompt({
      title: t("chats.renameTitle"),
      defaultValue: current,
      placeholder: t("chats.namePlaceholder"),
      confirmLabel: t("action.rename"),
    });
    if (title) await renameThread(id, title);
  }

  async function handleDelete(id: string, title: string) {
    const ok = await dialog.confirm({
      title: t("chats.deleteTitle"),
      description: t("chats.deleteBody", { title }),
      confirmLabel: t("action.delete"),
      danger: true,
    });
    if (ok) await deleteThread(id);
  }

  const name = profileHydrated ? displayName() : "";

  return (
    <div className="flex h-full flex-col pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pt-[env(safe-area-inset-top)] md:p-0">
      <div className="flex items-center gap-2 px-3 py-3">
        <Link href="/" className="tap inline-flex min-w-0 items-center">
          <Wordmark />
        </Link>
        <button
          onClick={onClose}
          aria-label={t("nav.closeMenu")}
          className="tap-sq ml-auto flex items-center justify-center rounded-lg p-1.5 text-[var(--text-faint)] hover:bg-[var(--surface-2)] md:hidden"
        >
          <XIcon className="h-5 w-5" />
        </button>
      </div>

      <div className="px-3 pb-2">
        <Link
          href="/"
          onClick={() => newThread()}
          className="tap justify-center flex w-full items-center gap-2 rounded-xl border border-[var(--line-strong)] px-3 py-2.5 text-[15px] font-medium text-[var(--text)] transition-colors hover:bg-[var(--surface-2)] md:text-sm"
        >
          <PlusIcon className="h-4 w-4" />
          {t("nav.newChat")}
        </Link>
      </div>

      <nav className="flex flex-col gap-0.5 px-2 pb-2">
        <TeacherLink />
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`tap flex items-center gap-3 rounded-lg px-2.5 py-2 text-[15px] transition-colors md:gap-2.5 md:text-sm ${
                active
                  ? "bg-[var(--surface-2)] text-[var(--text)]"
                  : "text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
              }`}
            >
              <Icon className="h-5 w-5 shrink-0 md:h-4 md:w-4" />
              {t(label)}
            </Link>
          );
        })}
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
        {threads.length === 0 ? (
          <p className="px-2 py-3 text-sm leading-relaxed text-[var(--text-faint)] md:text-xs">
            {t("chats.empty")}
          </p>
        ) : (
          <>
            <p className="px-2 pb-1.5 text-xs font-medium uppercase tracking-wide text-[var(--text-faint)] md:text-[11px]">
              {t("nav.chats")}
            </p>
            {threads.map((thread) => {
              const active = activeThread?.id === thread.id;
              return (
                <div
                  key={thread.id}
                  className={`group flex items-center gap-1 rounded-lg pr-1 ${
                    active ? "bg-[var(--surface-2)]" : "hover:bg-[var(--surface-2)]"
                  }`}
                >
                  <Link
                    href="/"
                    onClick={() => void openThread(thread.id)}
                    className="tap flex min-w-0 flex-1 items-center truncate px-2 py-2 text-[15px] text-[var(--text-dim)] md:text-sm"
                    title={thread.title}
                  >
                    {thread.title}
                  </Link>
                  {/* max-md:opacity-100 is the whole point of this row.
                      Rename and delete used to appear on hover, and a phone has
                      no hover — the only way to rename a chat was to find a
                      laptop. They are always visible below `md`, and the drawn
                      icon stays small while `tap-pad` gives each one a 44px
                      catchment, because widening them for real would push the
                      title out of a 19rem drawer. */}
                  <button
                    onClick={() => void handleRename(thread.id, thread.title)}
                    aria-label={t("chats.renameLabel", { title: thread.title })}
                    className="tap-pad rounded p-1 text-[var(--text-faint)] opacity-0 hover:text-[var(--text)] focus:opacity-100 group-hover:opacity-100 max-md:opacity-100"
                  >
                    <PencilIcon className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => void handleDelete(thread.id, thread.title)}
                    aria-label={t("chats.deleteLabel", { title: thread.title })}
                    className="tap-pad rounded p-1 text-[var(--text-faint)] opacity-0 hover:text-[var(--danger)] focus:opacity-100 group-hover:opacity-100 max-md:opacity-100"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </>
        )}
      </div>

      <button
        onClick={() => setReporting(true)}
        className="tap inline-flex items-center mx-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-[var(--text-faint)] transition-colors hover:text-[var(--text-dim)] md:text-[11px]"
      >
        {t("report.title")}
      </button>
      {reporting && <ReportDialog onClose={() => setReporting(false)} />}

      <Link
        href="/settings"
        className="m-2 flex items-center gap-2.5 rounded-xl px-2.5 py-2.5 transition-colors hover:bg-[var(--surface-2)]"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--surface-3)]">
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt="" className="h-full w-full object-cover" />
          ) : (
            <UserIcon className="h-4 w-4 text-[var(--text-dim)]" />
          )}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-[var(--text)]">{name || t("nav.yourProfile")}</span>
          <span className="block text-[13px] text-[var(--text-faint)] md:text-[11px]">{t("nav.settingsAndMemory")}</span>
        </span>
      </Link>
    </div>
  );
}
