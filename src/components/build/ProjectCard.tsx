"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { loadProject, type ProjectSummary } from "@/lib/storage";
import { buildPreviewDocument } from "@/lib/buildPreviewDocument";
import { CopyIcon, DownloadIcon, MoreVerticalIcon, PencilIcon, TrashIcon } from "@/components/icons";

// One project in the list: a picture of it, its name, and when it was last
// touched — with rename, copy, download and delete behind a ⋮ that is always
// drawn (hover does not exist on a touch screen).
//
// THE PICTURE
//
// The card shows the project's own front page, shrunk. It is built from the
// files exactly as the preview builds it, but in a frame with every permission
// taken away — no scripts at all — because a list of twelve projects must not
// start twelve games, play twelve sounds or pop twelve alerts. A page drawn
// entirely by JavaScript shows its HTML and CSS without the drawing, which is
// still recognisably that project. Nothing is loaded until the card scrolls
// into view. A project with no page gets its initials on a colour of its own.

const THUMB_WIDTH = 1280;
const THUMB_HEIGHT = 800;

/** The same two colours for the same project every time. */
function tint(id: string): string {
  const pairs = [
    ["#8b7bff", "#22c1c3"],
    ["#f472b6", "#8b5cf6"],
    ["#f59e0b", "#ef4444"],
    ["#10b981", "#0ea5e9"],
    ["#6366f1", "#ec4899"],
    ["#14b8a6", "#84cc16"],
  ];
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  const [a, b] = pairs[Math.abs(hash) % pairs.length];
  return `linear-gradient(135deg, ${a}, ${b})`;
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  return (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0]).toUpperCase();
}

function Thumbnail({ summary }: { summary: ProjectSummary }) {
  const boxRef = useRef<HTMLDivElement>(null);
  // undefined: not looked at yet. null: looked, and there is no page to show.
  const [html, setHtml] = useState<string | null | undefined>(undefined);
  const [shown, setShown] = useState(false);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    let cancelled = false;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        loadProject(summary.id)
          .then((project) => {
            if (cancelled) return;
            const doc = project ? buildPreviewDocument(project) : null;
            setHtml(doc?.entryFound ? doc.html : null);
          })
          .catch(() => !cancelled && setHtml(null));
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    const sizer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    sizer.observe(el);
    return () => {
      cancelled = true;
      observer.disconnect();
      sizer.disconnect();
    };
  }, [summary.id, summary.updatedAt]);

  const scale = width / THUMB_WIDTH;

  return (
    <div ref={boxRef} aria-hidden className="relative aspect-[16/10] overflow-hidden border-b border-[var(--line)]" style={{ background: tint(summary.id) }}>
      <span className="absolute inset-0 flex items-center justify-center text-[34px] font-[var(--weight-strong)] tracking-tight text-white/90 drop-shadow-sm">
        {initials(summary.name)}
      </span>
      {html === undefined && <span className="skeleton absolute inset-0 !rounded-none opacity-40" />}
      {html && width > 0 && (
        <iframe
          title=""
          tabIndex={-1}
          srcDoc={html}
          // No permissions at all: nothing in a thumbnail runs.
          sandbox=""
          loading="lazy"
          onLoad={() => setShown(true)}
          className={`pointer-events-none absolute left-0 top-0 origin-top-left border-0 bg-white transition-opacity duration-300 ${shown ? "opacity-100" : "opacity-0"}`}
          style={{ width: THUMB_WIDTH, height: THUMB_HEIGHT, transform: `scale(${scale})` }}
        />
      )}
    </div>
  );
}

export interface ProjectCardActions {
  rename: (p: ProjectSummary) => void;
  duplicate: (p: ProjectSummary) => void;
  download: (p: ProjectSummary) => void;
  remove: (p: ProjectSummary) => void;
}

export function ProjectCard({
  summary,
  edited,
  actions,
}: {
  summary: ProjectSummary;
  /** "edited 5 min ago", already worded. */
  edited: string;
  actions: ProjectCardActions;
}) {
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: PointerEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    requestAnimationFrame(() => menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus());
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const run = (fn: (p: ProjectSummary) => void) => () => {
    setMenuOpen(false);
    fn(summary);
  };

  return (
    <li data-project-card className="card card-interactive group relative overflow-hidden">
      <Link
        href={`/project/${summary.id}`}
        aria-label={t("build.openProject", { name: summary.name })}
        className="block rounded-[var(--radius-lg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus)]"
      >
        <Thumbnail summary={summary} />
        <div className="px-4 pb-3.5 pr-12 pt-3">
          <p className="truncate text-[15px] font-[var(--weight-strong)] text-[var(--text)]">{summary.name}</p>
          <p className="mt-0.5 truncate text-[13px] text-[var(--text-faint)]">{edited}</p>
        </div>
      </Link>

      <div ref={menuRef} className="absolute bottom-2.5 right-2">
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={t("build.actionsFor", { name: summary.name })}
          title={t("build.actionsFor", { name: summary.name })}
          className="icon-btn tap-sq"
        >
          <MoreVerticalIcon />
        </button>
        {menuOpen && (
          <div
            role="menu"
            className="menu absolute bottom-full right-0 z-20 mb-1 w-52"
            onKeyDown={(e) => {
              if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
              e.preventDefault();
              const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
              const i = items.indexOf(document.activeElement as HTMLElement);
              items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
            }}
          >
            <button type="button" role="menuitem" className="menu-item tap" onClick={run(actions.rename)}>
              <PencilIcon />
              {t("build.rename")}
            </button>
            <button type="button" role="menuitem" className="menu-item tap" onClick={run(actions.duplicate)}>
              <CopyIcon />
              {t("build.duplicate")}
            </button>
            <button type="button" role="menuitem" className="menu-item tap" onClick={run(actions.download)}>
              <DownloadIcon />
              {t("build.download")}
            </button>
            <div aria-hidden className="my-1 h-px bg-[var(--line)]" />
            <button type="button" role="menuitem" className="menu-item tap !text-[var(--danger)] [&>svg]:!text-[var(--danger)]" onClick={run(actions.remove)}>
              <TrashIcon />
              {t("build.delete")}
            </button>
          </div>
        )}
      </div>
    </li>
  );
}
