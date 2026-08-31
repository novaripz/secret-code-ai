"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { useAssistantStore } from "@/store/useAssistantStore";
import { useProfileStore } from "@/store/useProfileStore";
import { useDialog } from "@/components/ui/Dialog";
import { Wordmark } from "@/components/Wordmark";
import {
  ChatIcon,
  HammerIcon,
  SearchIcon,
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
const NAV = [
  { href: "/", label: "Chat", icon: ChatIcon },
  { href: "/search", label: "Search", icon: SearchIcon },
  { href: "/watch", label: "Watch", icon: VideoIcon },
  { href: "/build", label: "Build", icon: HammerIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

/** What to call the page currently open, for the header. */
function here(pathname: string) {
  const match = NAV.find((n) => (n.href === "/" ? pathname === "/" : pathname.startsWith(n.href)));
  return match?.label ?? "Panda";
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg)] text-[var(--text)]">
      {/* Mobile drawer scrim */}
      {sidebarOpen && (
        <button
          aria-label="Close menu"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 shrink-0 border-r border-[var(--line)] bg-[var(--surface-0)] transition-transform md:static md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Any click that lands on a link inside also closes the mobile drawer. */}
        <div className="h-full" onClick={() => setSidebarOpen(false)}>
          <Sidebar onClose={() => setSidebarOpen(false)} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-[var(--line)] px-3">
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
            className="rounded-lg p-2 text-[var(--text-dim)] hover:bg-[var(--surface-2)] md:hidden"
          >
            <MenuIcon className="h-5 w-5" />
          </button>

          {/* Navigation lives in the sidebar now, so the header just carries
              the current place and the theme switch. */}
          <span className="text-sm font-medium text-[var(--text-dim)]">{here(pathname)}</span>

          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}

function ThemeToggle() {
  const theme = useProfileStore((s) => s.theme);
  const toggleTheme = useProfileStore((s) => s.toggleTheme);
  const dark = theme === "dark";

  return (
    <button
      onClick={toggleTheme}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="rounded-full p-2 text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
    >
      {dark ? <SunIcon className="h-4.5 w-4.5" /> : <MoonIcon className="h-4.5 w-4.5" />}
    </button>
  );
}

function Sidebar({ onClose }: { onClose: () => void }) {
  const pathname = usePathname();
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
      title: "Rename this chat",
      defaultValue: current,
      placeholder: "Chat name",
      confirmLabel: "Rename",
    });
    if (title) await renameThread(id, title);
  }

  async function handleDelete(id: string, title: string) {
    const ok = await dialog.confirm({
      title: "Delete this chat?",
      description: `"${title}" will be gone for good.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (ok) await deleteThread(id);
  }

  const name = profileHydrated ? displayName() : "";

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-3 py-3">
        <Link href="/" className="min-w-0">
          <Wordmark />
        </Link>
        <button
          onClick={onClose}
          aria-label="Close menu"
          className="ml-auto rounded-lg p-1.5 text-[var(--text-faint)] hover:bg-[var(--surface-2)] md:hidden"
        >
          <XIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="px-3 pb-2">
        <Link
          href="/"
          onClick={() => newThread()}
          className="flex w-full items-center gap-2 rounded-xl border border-[var(--line-strong)] px-3 py-2.5 text-sm font-medium text-[var(--text)] transition-colors hover:bg-[var(--surface-2)]"
        >
          <PlusIcon className="h-4 w-4" />
          New chat
        </Link>
      </div>

      <nav className="flex flex-col gap-0.5 px-2 pb-2">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                active
                  ? "bg-[var(--surface-2)] text-[var(--text)]"
                  : "text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {threads.length === 0 ? (
          <p className="px-2 py-3 text-xs leading-relaxed text-[var(--text-faint)]">
            Your chats show up here. Everything you tell the AI is remembered across all of them.
          </p>
        ) : (
          <>
            <p className="px-2 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--text-faint)]">
              Chats
            </p>
            {threads.map((t) => {
              const active = activeThread?.id === t.id;
              return (
                <div
                  key={t.id}
                  className={`group flex items-center gap-1 rounded-lg pr-1 ${
                    active ? "bg-[var(--surface-2)]" : "hover:bg-[var(--surface-2)]"
                  }`}
                >
                  <Link
                    href="/"
                    onClick={() => void openThread(t.id)}
                    className="min-w-0 flex-1 truncate px-2 py-2 text-sm text-[var(--text-dim)]"
                    title={t.title}
                  >
                    {t.title}
                  </Link>
                  <button
                    onClick={() => void handleRename(t.id, t.title)}
                    aria-label={`Rename ${t.title}`}
                    className="rounded p-1 text-[var(--text-faint)] opacity-0 hover:text-[var(--text)] focus:opacity-100 group-hover:opacity-100"
                  >
                    <PencilIcon className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => void handleDelete(t.id, t.title)}
                    aria-label={`Delete ${t.title}`}
                    className="rounded p-1 text-[var(--text-faint)] opacity-0 hover:text-[var(--danger)] focus:opacity-100 group-hover:opacity-100"
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </>
        )}
      </div>

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
          <span className="block truncate text-sm font-medium text-[var(--text)]">{name || "Your profile"}</span>
          <span className="block text-[11px] text-[var(--text-faint)]">Settings &amp; memory</span>
        </span>
      </Link>
    </div>
  );
}
