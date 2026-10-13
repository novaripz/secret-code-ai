"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, type RefObject } from "react";
import { useI18n } from "@/lib/i18n";
import {
  ArrowLeftIcon,
  HistoryIcon,
  HomeIcon,
  KeyboardIcon,
  ListVideoIcon,
  SearchIcon,
  ShieldCheckIcon,
  XIcon,
} from "@/components/icons";
import { suggest } from "@/lib/watch/query";
import { useWatchStore } from "@/store/useWatchStore";
import { useWatchNav, watchHref } from "./nav";

// Watch's own header: home on the left, search in the middle, library and the
// safety note on the right — the arrangement every student already knows.
//
// The search box suggests from two local lists only: the student's own recent
// searches and a fixed set of school topics. YouTube's autocomplete has no
// official API, and sending every keystroke anywhere would be a poor trade for
// a slightly better guess.

export function TopBar({
  query,
  onHome,
  inputRef,
  onShortcuts,
}: {
  query: string;
  onHome: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onShortcuts: () => void;
}) {
  const { t } = useI18n();
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <div className="relative z-30 flex h-[60px] shrink-0 items-center gap-1.5 border-b border-line bg-bg/95 px-2 backdrop-blur sm:gap-2 sm:px-4">
      {/* On a phone the search box takes the whole bar while it is open. */}
      <div className={`flex items-center gap-1 ${searchOpen ? "hidden sm:flex" : ""}`}>
        <Link
          href={watchHref()}
          className="icon-btn tap-sq"
          aria-label={t("watch.home")}
          title={t("watch.home")}
          aria-current={onHome ? "page" : undefined}
          data-active={onHome || undefined}
        >
          <HomeIcon />
        </Link>
      </div>

      <div className={`mx-auto min-w-0 flex-1 sm:max-w-[640px] ${searchOpen ? "" : ""}`}>
        <SearchBox key={query} initial={query} inputRef={inputRef} onOpenChange={setSearchOpen} />
      </div>

      <div className={`flex items-center gap-1 sm:gap-2 ${searchOpen ? "hidden sm:flex" : ""}`}>
        <SafetyPill />
        <button
          type="button"
          className="icon-btn tap-sq hidden lg:inline-flex"
          aria-label={t("watch.shortcuts")}
          title={`${t("watch.shortcuts")} (?)`}
          onClick={onShortcuts}
        >
          <KeyboardIcon />
        </button>
        <Link href={watchHref({ list: "later" })} className="btn btn-ghost tap-sq gap-1.5 !px-2.5 sm:!px-3">
          <ListVideoIcon />
          <span className="hidden md:inline">{t("watch.library")}</span>
          <span className="sr-only md:hidden">{t("watch.library")}</span>
        </Link>
      </div>
    </div>
  );
}

function SearchBox({
  initial,
  inputRef,
  onOpenChange,
}: {
  initial: string;
  inputRef: RefObject<HTMLInputElement | null>;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const nav = useWatchNav();
  const recent = useWatchStore((s) => s.recent);
  const addRecentSearch = useWatchStore((s) => s.addRecentSearch);
  const removeRecentSearch = useWatchStore((s) => s.removeRecentSearch);
  const clearRecentSearches = useWatchStore((s) => s.clearRecentSearches);

  const [value, setValue] = useState(initial);
  const [open, setOpenState] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const items = useMemo(() => suggest(value, recent, 8), [value, recent]);
  const showList = open && items.length > 0;

  function setOpen(next: boolean) {
    setOpenState(next);
    onOpenChange(next);
    if (!next) setActive(-1);
  }

  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (!boxRef.current?.contains(e.target as Node)) {
        setOpenState(false);
        onOpenChange(false);
        setActive(-1);
      }
    }
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open, onOpenChange]);

  function run(q: string) {
    const clean = q.replace(/\s+/g, " ").trim();
    if (!clean) return;
    setValue(clean);
    setOpen(false);
    addRecentSearch(clean);
    // Dropping focus is what closes a phone's keyboard, so the results it just
    // asked for are not hidden behind it.
    inputRef.current?.blur();
    nav.search(clean);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && items.length) {
      e.preventDefault();
      if (!open) setOpen(true);
      setActive((a) => (a + 1) % items.length);
    } else if (e.key === "ArrowUp" && items.length) {
      e.preventDefault();
      setActive((a) => (a <= 0 ? items.length - 1 : a - 1));
    } else if (e.key === "Escape") {
      // Escape here closes the list (or leaves the box); it must not reach the
      // page's own Escape, which would navigate away from what they're doing.
      e.stopPropagation();
      if (showList) setOpen(false);
      else inputRef.current?.blur();
    } else if (e.key === "Enter" && showList && active >= 0) {
      e.preventDefault();
      run(items[active].text);
    }
  }

  return (
    <div ref={boxRef} className="relative">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          run(value);
        }}
        className="flex items-center"
      >
        {open && (
          <button
            type="button"
            className="icon-btn tap-sq mr-1 sm:hidden"
            aria-label={t("action.back")}
            onClick={() => {
              setOpen(false);
              inputRef.current?.blur();
            }}
          >
            <ArrowLeftIcon />
          </button>
        )}
        <div className="flex h-10 min-w-0 flex-1 items-center rounded-l-full border border-line-strong bg-surface-0 pl-4 pr-1 transition-[border-color,box-shadow] focus-within:border-accent focus-within:shadow-[var(--glow-accent)]">
          <SearchIcon className="mr-2.5 hidden h-4 w-4 shrink-0 text-ink-faint sm:block" />
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setActive(-1);
              if (!open) setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
            maxLength={200}
            placeholder={t("watch.searchPlaceholder")}
            aria-label={t("watch.searchPlaceholder")}
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
            className="tap h-full min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-faint [&::-webkit-search-cancel-button]:hidden"
          />
          {value && (
            <button
              type="button"
              className="icon-btn icon-btn-sm tap-sq"
              aria-label={t("watch.clearQuery")}
              onClick={() => {
                setValue("");
                inputRef.current?.focus();
              }}
            >
              <XIcon />
            </button>
          )}
        </div>
        <button
          type="submit"
          aria-label={t("action.search")}
          title={t("action.search")}
          className="tap-sq flex h-10 w-14 shrink-0 items-center justify-center rounded-r-full border border-l-0 border-line-strong bg-surface-2 text-ink-dim transition-colors hover:bg-surface-3 hover:text-ink sm:w-16"
        >
          <SearchIcon className="h-[18px] w-[18px]" />
        </button>
      </form>

      {showList && (
        <div className="menu animate-rise absolute inset-x-0 top-[calc(100%+6px)] z-40 !p-1.5">
          <div className="flex items-center justify-between px-2.5 pb-1 pt-1">
            <span className="eyebrow">{items[0]?.recent ? t("watch.recentSearches") : t("watch.suggestedSearches")}</span>
            {items.some((i) => i.recent) && (
              <button
                type="button"
                className="rounded-sm text-[12px] font-medium text-ink-faint hover:text-ink"
                onClick={() => clearRecentSearches()}
              >
                {t("watch.clearRecent")}
              </button>
            )}
          </div>
          <ul id={listId} role="listbox" aria-label={t("watch.suggestedSearches")}>
            {items.map((item, i) => (
              <li
                key={`${item.recent ? "r" : "s"}:${item.text}`}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={`group/opt flex items-center rounded-ui-sm ${i === active ? "bg-surface-2" : "hover:bg-surface-2"}`}
              >
                <button
                  type="button"
                  tabIndex={-1}
                  className="tap flex min-w-0 flex-1 items-center gap-3 px-2.5 py-2 text-left text-[14px] text-ink"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => run(item.text)}
                >
                  {item.recent ? (
                    <HistoryIcon className="h-4 w-4 shrink-0 text-ink-faint" />
                  ) : (
                    <SearchIcon className="h-4 w-4 shrink-0 text-ink-faint" />
                  )}
                  <span className="truncate">{item.text}</span>
                </button>
                {item.recent && (
                  <button
                    type="button"
                    tabIndex={-1}
                    className="icon-btn icon-btn-sm tap-sq mr-1"
                    aria-label={t("watch.removeRecent", { query: item.text })}
                    title={t("watch.removeRecent", { query: item.text })}
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => {
                      const match = recent.find((r) => r.toLowerCase() === item.text);
                      removeRecentSearch(match ?? item.text);
                    }}
                  >
                    <XIcon />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * What Watch actually does to keep things school-safe, said plainly. It used to
 * read "Locked to Panda", which overstated it: the embedded player still
 * belongs to YouTube. This says what is true and what is not.
 */
function SafetyPill() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        title={t("watch.safetyTitle")}
        className="tap-sq inline-flex h-9 items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--success)_35%,transparent)] bg-success-soft px-2.5 text-[12.5px] font-medium text-success transition-colors hover:border-success sm:px-3"
      >
        <ShieldCheckIcon className="h-4 w-4" />
        <span className="hidden sm:inline">{t("watch.safetyPill")}</span>
        <span className="sr-only sm:hidden">{t("watch.safetyPill")}</span>
      </button>
      {open && (
        <div
          id={id}
          role="dialog"
          aria-label={t("watch.safetyTitle")}
          className="menu animate-rise absolute right-0 top-[calc(100%+8px)] z-40 w-[min(340px,calc(100vw-24px))] !p-4"
        >
          <p className="flex items-center gap-2 text-[14px] font-semibold text-ink">
            <ShieldCheckIcon className="h-4 w-4 text-success" />
            {t("watch.safetyTitle")}
          </p>
          <ul className="mt-2.5 space-y-2 text-[13px] leading-relaxed text-ink-dim">
            <li>{t("watch.safetyBody")}</li>
            <li>{t("watch.safetyEnd")}</li>
            <li className="text-ink-faint">{t("watch.safetyHonest")}</li>
          </ul>
        </div>
      )}
    </div>
  );
}
