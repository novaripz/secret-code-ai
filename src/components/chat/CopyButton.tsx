"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { CheckIcon, CopyIcon } from "@/components/icons";
import { stripRemembered } from "./remember";

// "Copy" under one of Panda's replies.
//
// What gets copied is the markdown SOURCE, not the rendered bubble. A student
// copying an answer is nearly always moving it into a doc or their notes, and
// the rendered version carries KaTeX's markup with it — a wall of <span
// class="mord"> that pastes as garbage and is unfixable by hand. The raw text
// pastes as text everywhere, and anywhere that understands markdown gets the
// formatting back for free.
//
// The `[[remember: …]]` markers are stripped on the way out for the same
// reason they are stripped on the way in: the student never saw them, so they
// must not appear in what they paste. `stripRemembered` is the one place that
// rule lives.
//
// Three states, one button. Silence after a click reads as broken, so a
// success says so and reverts; a failure says so too. `navigator.clipboard` is
// absent on insecure origins (a phone hitting a dev box over plain http is the
// realistic case here) and rejects outright when permission is denied, and
// both of those are exactly when a student would otherwise sit there clicking.

/** How long "Copied" stays up. Long enough to read, short enough not to nag. */
const FEEDBACK_MS = 1800;

type State = "idle" | "copied" | "failed";

/**
 * "reply" is the labelled button under one of Panda's answers. "own" is the
 * quiet icon under the student's own message, which exists because re-typing a
 * long prompt to ask it a second way is the most common reason a student gives
 * up on a question. It is small because their own words need no explaining back
 * to them, and it is ALWAYS VISIBLE rather than appearing on hover: a phone has
 * no hover, and a control that only exists for mouse users does not exist for
 * most of this app's users.
 */
type Variant = "reply" | "own";

export function CopyButton({ content, variant = "reply" }: { content: string; variant?: Variant }) {
  const { t } = useI18n();
  const [state, setState] = useState<State>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A reply can be copied and then the thread cleared or navigated away from
  // while the timer is still pending; setting state on the way out warns.
  // A pending timer outliving the component would call setState on something
  // that is gone, which React warns about and which happens every time a
  // student copies and then immediately navigates away.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function settle(next: State) {
    setState(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), FEEDBACK_MS);
  }

  async function copy() {
    const text = stripRemembered(content);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("no clipboard");
      await navigator.clipboard.writeText(text);
      settle("copied");
    } catch {
      // Deliberately not falling back to the old execCommand trick: it needs a
      // hidden textarea and a selection dance that steals focus, and it fails
      // on the same insecure origins anyway. Telling the truth is better than
      // a second thing that might also silently not work.
      settle("failed");
    }
  }

  const label =
    state === "copied" ? t("chat.copied") : state === "failed" ? t("chat.copyFailed") : t("chat.copy");

  if (variant === "own") {
    return (
      <div className="mt-1 flex justify-end">
        <button
          type="button"
          onClick={() => void copy()}
          aria-label={label}
          aria-live="polite"
          // Sized to the 44px touch target even though the mark inside is
          // small: a control a thumb cannot reliably hit is decoration.
          className={`tap flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] motion-reduce:transition-none ${
            state === "failed" ? "text-[var(--danger)]" : "text-[var(--text-faint)] hover:text-[var(--text)]"
          }`}
        >
          {state === "copied" ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
          {/* The word is for screen readers only; the icon carries it visually,
              and "Copied" in full next to a student's own sentence is noise. */}
          <span className="sr-only">{label}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2 sm:gap-1.5">
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={label}
        // aria-live so a screen reader hears the outcome; the visible label
        // changing is the same message for everyone else.
        aria-live="polite"
        className={`tap flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] motion-reduce:transition-none sm:px-3 md:text-xs ${
          state === "failed"
            ? "border-[var(--danger)] text-[var(--danger)]"
            : "border-[var(--line)] text-[var(--text-dim)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
        }`}
      >
        {state === "copied" ? <CheckIcon className="h-4 w-4 md:h-3.5 md:w-3.5" /> : <CopyIcon className="h-4 w-4 md:h-3.5 md:w-3.5" />}
        {label}
      </button>
    </div>
  );
}
