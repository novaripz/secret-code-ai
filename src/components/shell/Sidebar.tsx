"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useI18n, type StringKey } from "@/lib/i18n";
import { useTeacherStore } from "@/components/teacher/store";
import { useAssistantStore, type ThreadSummary } from "@/store/useAssistantStore";
import { useProfileStore } from "@/store/useProfileStore";
import { useDialog } from "@/components/ui/Dialog";
import { MenuButton } from "@/components/ui/Menu";
import { Wordmark } from "@/components/Wordmark";
import { useReportDialog } from "@/components/ReportDialog";
import {
  BugIcon,
  ChevronRightIcon,
  GraduationCapIcon,
  MoreIcon,
  PencilIcon,
  PinIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
  XIcon,
} from "@/components/icons";
import { NAV, isActive } from "./nav";

// The left column: the way to every section, the chat history, and the
// student's own card at the bottom.
//
// Every store read here is a selector. It used to take the whole assistant
// store, which re-rendered the entire sidebar — every chat row, every nav link
// — on each streamed frame of a reply, which on a school Chromebook is the
// difference between smooth text and stuttering text.

type Group = "pinned" | "today" | "yesterday" | "week" | "older";

const GROUP_LABEL: Record<Group, StringKey> = {
  pinned: "chats.pinned",
  today: "chats.today",
  yesterday: "chats.yesterday",
  week: "chats.previous7",
  older: "chats.older",
};

const DAY = 86_400_000;

function groupOf(t: ThreadSummary, startOfToday: number): Group {
  if (t.pinned) return "pinned";
  if (t.updatedAt >= startOfToday) return "today";
  if (t.updatedAt >= startOfToday - DAY) return "yesterday";
  if (t.updatedAt >= startOfToday - 7 * DAY) return "week";
  return "older";
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
  const active = isActive("/teacher", pathname);

  return (
    <Link href="/teacher" className="nav-item tap" aria-current={active ? "page" : undefined} data-active={active || undefined}>
      <GraduationCapIcon />
      Teacher
    </Link>
  );
}

export function Sidebar({ onClose }: { onClose: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();
  const dialog = useDialog();

  const threads = useAssistantStore((s) => s.threads);
  const activeId = useAssistantStore((s) => s.activeThread?.id);
  const activeHasMessages = useAssistantStore((s) => (s.activeThread?.messages.length ?? 0) > 0);
  const pending = useAssistantStore((s) => s.pending);
  const hydrated = useAssistantStore((s) => s.hydrated);
  const hydrate = useAssistantStore((s) => s.hydrate);
  const newThread = useAssistantStore((s) => s.newThread);
  const deleteThread = useAssistantStore((s) => s.deleteThread);
  const renameThread = useAssistantStore((s) => s.renameThread);
  const pinThread = useAssistantStore((s) => s.pinThread);

  const displayName = useProfileStore((s) => s.displayName);
  const avatar = useProfileStore((s) => s.profile.avatar);
  const profileHydrated = useProfileStore((s) => s.hydrated);
  const showReport = useReportDialog((s) => s.show);

  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!hydrated) void hydrate();
  }, [hydrated, hydrate]);

  const onChat = pathname === "/";

  // Grouped once per change to the list, not per render. "Today" is worked out
  // from the local midnight, so a chat from 11pm last night is Yesterday.
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? threads.filter((th) => th.title.toLowerCase().includes(q)) : threads;
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const out: { group: Group; items: ThreadSummary[] }[] = [];
    const order: Group[] = ["pinned", "today", "yesterday", "week", "older"];
    for (const group of order) {
      const items = list.filter((th) => groupOf(th, midnight.getTime()) === group);
      if (items.length) out.push({ group, items });
    }
    return out;
  }, [threads, query]);

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
    if (!ok) return;
    await deleteThread(id);
    // The address bar still names the chat that just stopped existing; a
    // reload would land on "not found" instead of a fresh chat.
    if (onChat && id === activeId) router.replace("/", { scroll: false });
  }

  const name = profileHydrated ? displayName() : "";

  return (
    <div className="flex h-full flex-col pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pt-[env(safe-area-inset-top)] md:p-0">
      <div className="flex h-14 shrink-0 items-center gap-2 px-3">
        <Link href="/" onClick={() => newThread()} className="tap inline-flex min-w-0 items-center rounded-[var(--radius-sm)]">
          <Wordmark />
        </Link>
        <button type="button" onClick={onClose} aria-label={t("nav.closeMenu")} title={t("nav.closeMenu")} className="icon-btn ml-auto md:hidden">
          <XIcon />
        </button>
      </div>

      <div className="px-3 pb-3 pt-1">
        <Link
          href="/"
          onClick={() => newThread()}
          className="btn btn-primary w-full"
        >
          <PlusIcon />
          {t("nav.newChat")}
        </Link>
      </div>

      <nav aria-label={t("nav.sections")} className="flex flex-col gap-0.5 px-2 pb-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(href, pathname);
          // "Chat" goes back to the conversation that was open, not to a blank
          // one: leaving to check the plan and coming back should not cost the
          // student their place. "New chat" is right above for a fresh start.
          const target = href === "/" && activeHasMessages && activeId ? `/?c=${activeId}` : href;
          return (
            <Link
              key={href}
              href={target}
              className="nav-item tap"
              aria-current={active ? "page" : undefined}
              data-active={active || undefined}
            >
              <Icon />
              {t(label)}
            </Link>
          );
        })}
        <TeacherLink />
      </nav>

      <div className="mx-3 border-t border-[var(--line)]" />

      <div className="px-3 pb-1 pt-3">
        <label className="relative block">
          <span className="sr-only">{t("chats.search")}</span>
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-faint)]" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            placeholder={t("chats.search")}
            className="input h-9 pl-8 text-[13px]"
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2 pt-1">
        {!hydrated ? (
          <div className="flex flex-col gap-2 px-2 pt-3" aria-hidden="true">
            <div className="skeleton h-3 w-16" />
            <div className="skeleton h-8 w-full" />
            <div className="skeleton h-8 w-4/5" />
            <div className="skeleton h-8 w-full" />
          </div>
        ) : threads.length === 0 ? (
          <p className="px-2 py-3 text-[13px] leading-relaxed text-[var(--text-faint)]">{t("chats.empty")}</p>
        ) : groups.length === 0 ? (
          <p className="px-2 py-3 text-[13px] leading-relaxed text-[var(--text-faint)]">{t("chats.noMatch", { query: query.trim() })}</p>
        ) : (
          groups.map(({ group, items }) => (
            <section key={group} aria-label={t(GROUP_LABEL[group])} className="mb-2">
              <h3 className="eyebrow flex items-center gap-1.5 px-2 pb-1 pt-2">
                {group === "pinned" && <PinIcon className="h-3 w-3" />}
                {t(GROUP_LABEL[group])}
              </h3>
              <ul className="flex flex-col gap-px">
                {items.map((thread) => {
                  const active = onChat && activeId === thread.id;
                  const busy = !!pending[thread.id];
                  return (
                    <li key={thread.id} className="chat-row group" data-active={active || undefined}>
                      <Link
                        href={`/?c=${thread.id}`}
                        aria-current={active ? "page" : undefined}
                        className="tap flex min-w-0 flex-1 items-center gap-2 py-2 pl-2.5 pr-1 text-[14px] md:text-[13.5px]"
                        title={thread.title}
                      >
                        <span className="truncate">{thread.title}</span>
                        {/* A reply still arriving in a chat you have left. */}
                        {busy && (
                          <span className="activity-dot ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent-text)]" aria-label={t("chats.replying")} />
                        )}
                      </Link>
                      {/* One "more" button rather than three icons: rename, pin
                          and delete used to crowd the title out of a 19rem
                          drawer, and on a phone (no hover) they were always
                          on. The menu is always reachable; it only fades in on
                          desktop hover to keep the list calm. */}
                      <MenuButton
                        label={t("chats.optionsFor", { title: thread.title })}
                        icon={<MoreIcon />}
                        className="icon-btn icon-btn-sm tap-pad mr-1 opacity-100 md:opacity-0 md:focus-visible:opacity-100 md:group-hover:opacity-100 md:group-data-[active]:opacity-100 data-[active]:opacity-100"
                        items={[
                          {
                            key: "pin",
                            label: t(thread.pinned ? "chats.unpin" : "chats.pin"),
                            icon: <PinIcon />,
                            onSelect: () => void pinThread(thread.id, !thread.pinned),
                          },
                          {
                            key: "rename",
                            label: t("action.rename"),
                            icon: <PencilIcon />,
                            onSelect: () => void handleRename(thread.id, thread.title),
                          },
                          {
                            key: "delete",
                            label: t("action.delete"),
                            icon: <TrashIcon />,
                            danger: true,
                            onSelect: () => void handleDelete(thread.id, thread.title),
                          },
                        ]}
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>

      <div className="border-t border-[var(--line)] p-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
            showReport();
          }}
          className="nav-item tap w-full text-[13.5px]"
        >
          <BugIcon />
          {t("report.title")}
        </button>

        <Link
          href="/settings"
          className="profile-card mt-1 flex items-center gap-3 rounded-[var(--radius)] px-2.5 py-2.5"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--accent-soft)] text-sm font-semibold text-[var(--accent-text)]">
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt="" className="h-full w-full object-cover" />
            ) : (
              (name || "?").charAt(0).toUpperCase()
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-[var(--text)]">{name || t("nav.yourProfile")}</span>
            <span className="block truncate text-[12.5px] text-[var(--text-faint)]">{t("nav.profileAndSettings")}</span>
          </span>
          <ChevronRightIcon className="h-4 w-4 shrink-0 text-[var(--text-faint)]" />
        </Link>
      </div>
    </div>
  );
}
