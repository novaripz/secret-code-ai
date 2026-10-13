"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { MoreVerticalIcon } from "@/components/icons";

// The ⋮ menu on a card. It replaces the old text "Save" button that sat on
// every card: one quiet control that opens the few things you can do to a
// video, the way a student already expects from YouTube.
//
// Keyboard: Enter/Space opens it with focus on the first item, arrows move,
// Escape closes and hands focus back to the ⋮ button.

export interface MenuItem {
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  danger?: boolean;
}

export function CardMenu({ items, label, align = "right" }: { items: MenuItem[]; label: string; align?: "right" | "left" }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();

    function onPointer(e: PointerEvent) {
      const target = e.target as Node;
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        // Handled here, not by the page: Escape on an open menu closes the
        // menu, it does not also leave the watch page behind it.
        e.stopPropagation();
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  function onMenuKey(e: React.KeyboardEvent) {
    const all = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? [])];
    const at = all.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      all[(at + 1) % all.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      all[(at - 1 + all.length) % all.length]?.focus();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        className="icon-btn icon-btn-sm tap-sq -mr-1.5 -mt-0.5"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <MoreVerticalIcon />
      </button>
      {open && (
        <div
          ref={menuRef}
          id={id}
          role="menu"
          onKeyDown={onMenuKey}
          className={`menu animate-rise absolute top-full z-30 mt-1 ${align === "right" ? "right-0" : "left-0"}`}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={`menu-item tap ${item.danger ? "!text-danger [&>svg]:!text-danger" : ""}`}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
