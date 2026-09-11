"use client";

import { useEffect, useRef, useState } from "react";

// The divider between two panes. Pointer events rather than mouse events because
// half of these students are on a Chromebook touchscreen or a phone, and pointer
// capture is the only thing that keeps a drag alive when the finger crosses the
// preview <iframe> — an iframe swallows every move event that isn't captured.
//
// It is also a real control for the keyboard: focus it and the arrow keys move
// it in steps. A separator nobody can reach with Tab is a mouse-only feature
// wearing a divider's clothes.

const STEP = 16;
const PAGE_STEP = 64;

interface ResizeHandleProps {
  /** The bar's own axis: "vertical" sits between left and right panes. */
  orientation: "vertical" | "horizontal";
  label: string;
  /** Reported to screen readers so the position is announced, not just felt. */
  value: number;
  min: number;
  max: number;
  /** Fired once per drag, before the first move, so the parent can record where it started. */
  onDragStart: () => void;
  /** Distance in pixels from where the drag began. */
  onDrag: (delta: number) => void;
  /** Keyboard nudge, in pixels, positive meaning right or down. */
  onNudge: (step: number) => void;
}

export function ResizeHandle({
  orientation,
  label,
  value,
  min,
  max,
  onDragStart,
  onDrag,
  onNudge,
}: ResizeHandleProps) {
  const vertical = orientation === "vertical";
  const origin = useRef(0);
  const [dragging, setDragging] = useState(false);

  // A drag interrupted by an unmount (closing a pane mid-drag) would otherwise
  // leave the whole document stuck with a resize cursor.
  useEffect(() => {
    return () => {
      delete document.body.dataset.resizing;
    };
  }, []);

  function pointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    origin.current = vertical ? e.clientX : e.clientY;
    document.body.dataset.resizing = orientation;
    setDragging(true);
    onDragStart();
  }

  function pointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    onDrag((vertical ? e.clientX : e.clientY) - origin.current);
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    delete document.body.dataset.resizing;
    setDragging(false);
  }

  function keyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const back = vertical ? "ArrowLeft" : "ArrowUp";
    const forward = vertical ? "ArrowRight" : "ArrowDown";
    let step = 0;
    if (e.key === back) step = -STEP;
    else if (e.key === forward) step = STEP;
    else if (e.key === "PageUp") step = -PAGE_STEP;
    else if (e.key === "PageDown") step = PAGE_STEP;
    else return;
    e.preventDefault();
    onNudge(step);
  }

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation={orientation}
      aria-valuenow={Math.round(value)}
      aria-valuemin={Math.round(min)}
      aria-valuemax={Math.round(max)}
      title={label}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={keyDown}
      className={`group relative z-10 shrink-0 touch-none bg-[var(--bg)] ${
        vertical ? "w-1.5 cursor-col-resize" : "h-1.5 cursor-row-resize"
      }`}
    >
      <span
        aria-hidden
        className={`pointer-events-none absolute transition-colors ${
          vertical ? "inset-y-0 left-1/2 w-px -translate-x-1/2" : "inset-x-0 top-1/2 h-px -translate-y-1/2"
        } ${dragging ? "bg-[var(--accent)]" : "bg-[var(--line)] group-hover:bg-[var(--line-strong)]"}`}
      />
    </div>
  );
}
