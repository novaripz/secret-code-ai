"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

// A small "more" menu: a button that opens a list of actions.
//
// Portalled and fixed-positioned rather than absolutely positioned under its
// button, because the buttons that use it live inside scrollers (the chat list
// in the sidebar) and a slide-in drawer — an absolute menu there is clipped by
// the scroller's edge, and the drawer's transform would trap a fixed one. It
// opens below the button and flips above it when there is no room.
//
// Keyboard: the menu takes focus on open, arrows move, Home/End jump, Enter or
// Space choose, Escape and Tab close and hand focus back to the button.

export interface MenuItem {
  key: string;
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  onSelect: () => void;
}

export function MenuButton({
  label,
  icon,
  items,
  className = "icon-btn icon-btn-sm",
  align = "end",
}: {
  /** The button's accessible name, and its tooltip. */
  label: string;
  icon: ReactNode;
  items: MenuItem[];
  className?: string;
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  // Measured after the menu has rendered, so its own height decides whether it
  // fits below the button.
  useLayoutEffect(() => {
    if (!open) return;
    const button = buttonRef.current;
    const menu = menuRef.current;
    if (!button || !menu) return;
    const b = button.getBoundingClientRect();
    const m = menu.getBoundingClientRect();
    const gap = 4;
    const below = b.bottom + gap + m.height <= window.innerHeight - 8;
    const top = below ? b.bottom + gap : Math.max(8, b.top - gap - m.height);
    const rawLeft = align === "end" ? b.right - m.width : b.left;
    const left = Math.min(Math.max(8, rawLeft), window.innerWidth - m.width - 8);
    setPos({ top, left });
    menu.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent | TouchEvent) {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    }
    // Scrolling the list under an open menu would leave it pointing at the
    // wrong row; closing is the honest answer.
    function onScroll(e: Event) {
      if (menuRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  function close(refocus = true) {
    setOpen(false);
    setPos(null);
    if (refocus) buttonRef.current?.focus();
  }

  function onMenuKey(e: React.KeyboardEvent) {
    const nodes = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const at = nodes.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      // preventDefault marks the key as spent, so the drawer behind does not
      // also close on the same press.
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "Tab") {
      close(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      nodes[(at + 1) % nodes.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      nodes[(at - 1 + nodes.length) % nodes.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      nodes[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      nodes[nodes.length - 1]?.focus();
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={(e) => {
          // The sidebar closes the phone drawer on any click inside it; opening
          // a menu is not a reason to close the drawer it sits in.
          e.stopPropagation();
          e.preventDefault();
          if (open) close();
          else setOpen(true);
        }}
        className={className}
        data-active={open || undefined}
      >
        {icon}
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={label}
            onKeyDown={onMenuKey}
            className="menu animate-rise fixed z-[80]"
            style={pos ? { top: pos.top, left: pos.left } : { top: -9999, left: -9999 }}
          >
            {items.map((item) => (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick={() => {
                  close();
                  item.onSelect();
                }}
                className={`menu-item tap ${item.danger ? "!text-[var(--danger)] [&>svg]:!text-[var(--danger)]" : ""}`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
