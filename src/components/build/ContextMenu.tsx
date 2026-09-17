"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MenuActionId, MenuItemSpec } from "./fileMenu";

// One menu, used by the file tree everywhere it needs one.
//
// The hard requirement this component exists to satisfy is that a right-click
// menu must never be the ONLY way to reach an action. It isn't here: every
// entry it can show is also on a visible ⋯ button, in the command palette, or
// on a key — see FileExplorer, where the same handlers are wired to all of
// them. This component is the presentation, not the capability.
//
// The rest of it is the boring accessibility contract that a hand-rolled menu
// usually loses:
//
// * It is a real `role="menu"` with `role="menuitem"` children, so a screen
//   reader announces "menu, 9 items" rather than a pile of buttons.
// * Arrow keys move, Home/End jump, Escape closes, and focus goes back exactly
//   where it came from — usually the tree row, so the student can keep arrowing
//   through their files without reaching for the mouse again.
// * Tab is trapped rather than allowed to walk out into the page behind. A menu
//   you can tab out of while it is still on screen leaves a keyboard user
//   typing into a form they cannot see.
// * Disabled entries stay in place and are skipped by the arrows. Hiding them
//   instead would move every other entry, so the position of "Delete" would
//   depend on state and muscle memory would delete the wrong thing.
//
// Colours are all tokens. Nothing here knows which of the five themes is on.

export interface ContextMenuRequest {
  /** Viewport coordinates of the click, long-press, or the row's own ⋯ button. */
  x: number;
  y: number;
  /** Named so the menu can say what it is acting on — a menu with no subject is a guess. */
  subject: string;
  items: MenuItemSpec[];
  onRun: (id: MenuActionId) => void;
}

/** Keeps the menu inside the window. A menu opened near the bottom edge that renders off-screen is a menu with no items. */
function clampToViewport(x: number, y: number, width: number, height: number) {
  const margin = 8;
  const maxX = window.innerWidth - width - margin;
  const maxY = window.innerHeight - height - margin;
  return {
    left: Math.max(margin, Math.min(x, Math.max(margin, maxX))),
    top: Math.max(margin, Math.min(y, Math.max(margin, maxY))),
  };
}

export function ContextMenu({ request, onClose }: { request: ContextMenuRequest | null; onClose: () => void }) {
  if (!request) return null;
  return <Menu request={request} onClose={onClose} />;
}

function Menu({ request, onClose }: { request: ContextMenuRequest; onClose: () => void }) {
  const menuRef = useRef<HTMLDivElement>(null);
  // Captured on mount rather than passed in: the opener is whatever had focus
  // when the menu appeared, and only the menu knows when that was.
  const returnTo = useRef<HTMLElement | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    returnTo.current = document.activeElement as HTMLElement | null;
    const box = menuRef.current?.getBoundingClientRect();
    setPosition(clampToViewport(request.x, request.y, box?.width ?? 200, box?.height ?? 200));
  }, [request.x, request.y]);

  useEffect(() => {
    // Focus lands on the first thing that can actually be chosen, so Enter
    // immediately after opening never lands on a greyed-out entry.
    const frame = requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    // A menu pinned to a coordinate is wrong the moment the page moves under
    // it, and there is no sensible "follow the row" behaviour for a scroll the
    // student started deliberately. Closing is the honest answer.
    function bail() {
      onClose();
    }
    window.addEventListener("resize", bail);
    window.addEventListener("scroll", bail, true);
    return () => {
      window.removeEventListener("resize", bail);
      window.removeEventListener("scroll", bail, true);
    };
  }, [onClose]);

  function close() {
    // Ordered: return focus first, then unmount, or the browser drops focus to
    // <body> in between and a screen reader loses its place in the tree.
    returnTo.current?.focus?.();
    onClose();
  }

  function run(item: MenuItemSpec) {
    if (item.disabled) return;
    close();
    request.onRun(item.id);
  }

  function move(step: number) {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? [],
    );
    if (items.length === 0) return;
    const index = items.indexOf(document.activeElement as HTMLElement);
    // Wrapping, because a menu is a short circular list and running off the
    // end of one is the classic way to end up with focus nowhere.
    const next = index === -1 ? 0 : (index + step + items.length) % items.length;
    items[next]?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Home") {
      e.preventDefault();
      menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      const items = Array.from(
        menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? [],
      );
      items[items.length - 1]?.focus();
    } else if (e.key === "Tab") {
      // Trapped: Tab behaves as a move rather than as an exit.
      e.preventDefault();
      move(e.shiftKey ? -1 : 1);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60]"
      role="presentation"
      onMouseDown={close}
      onContextMenu={(e) => {
        // A second right-click dismisses rather than stacking another menu on
        // top of this one — and never shows the browser's own menu here.
        e.preventDefault();
        close();
      }}
    >
      <div
        ref={menuRef}
        role="menu"
        aria-label={`Actions for ${request.subject}`}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          left: position?.left ?? request.x,
          top: position?.top ?? request.y,
          // Hidden for the one frame between mount and measurement: showing it
          // at the raw coordinate first makes it visibly jump on every open
          // near an edge.
          visibility: position ? "visible" : "hidden",
        }}
        className="fixed min-w-[13rem] max-w-[min(18rem,calc(100vw-1rem))] overflow-hidden rounded-xl border border-[var(--line-strong)] bg-[var(--surface-0)] py-1 shadow-2xl"
      >
        <p className="truncate px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">
          {request.subject}
        </p>
        {request.items.map((item) => (
          <div key={item.id + item.label}>
            {item.separatorBefore && <span aria-hidden className="my-1 block h-px bg-[var(--line)]" />}
            <button
              type="button"
              role="menuitem"
              // Disabled through ARIA rather than the `disabled` attribute: a
              // natively disabled button is unfocusable, so a screen-reader user
              // arrowing the menu would never be told the entry exists.
              aria-disabled={item.disabled || undefined}
              tabIndex={-1}
              onClick={() => run(item)}
              className={`tap flex w-full items-center gap-3 px-3 py-1.5 text-left text-sm md:text-[13px] focus-visible:outline-none ${
                item.disabled
                  ? "cursor-default text-[var(--text-faint)] opacity-60"
                  : item.danger
                    ? "text-[var(--danger)] hover:bg-[var(--surface-2)] focus:bg-[var(--surface-2)]"
                    : "text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus:bg-[var(--surface-2)] focus:text-[var(--text)]"
              }`}
            >
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.shortcut && (
                <span aria-hidden className="shrink-0 font-mono text-[10px] text-[var(--text-faint)]">
                  {item.shortcut}
                </span>
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Long-press as a stand-in for right-click. A phone has no second button, so
 * without this every entry in the menu would be desktop-only — which is the
 * whole reason the visible ⋯ button exists as well. Both routes, not one.
 *
 * The press is cancelled by any movement over a few pixels so that scrolling
 * the file list with a thumb does not keep popping menus open.
 */
export function useLongPress(onLongPress: (x: number, y: number) => void, ms = 500) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  // A long press ends in a touchend, and a touchend on a row still produces a
  // click. Without this the menu would open and the file would open behind it
  // at the same time, which reads as the app doing something at random.
  const fired = useRef(false);

  function cancel() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    origin.current = null;
  }

  useEffect(() => cancel, []);

  return {
    /** True once, if the click about to happen is the tail of a long press. */
    consumedClick: () => {
      if (!fired.current) return false;
      fired.current = false;
      return true;
    },
    onTouchStart: (e: React.TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      origin.current = { x: touch.clientX, y: touch.clientY };
      fired.current = false;
      timer.current = setTimeout(() => {
        timer.current = null;
        fired.current = true;
        onLongPress(touch.clientX, touch.clientY);
      }, ms);
    },
    onTouchMove: (e: React.TouchEvent) => {
      const touch = e.touches[0];
      const from = origin.current;
      if (!touch || !from) return;
      if (Math.abs(touch.clientX - from.x) > 8 || Math.abs(touch.clientY - from.y) > 8) cancel();
    },
    onTouchEnd: cancel,
    onTouchCancel: cancel,
  };
}
