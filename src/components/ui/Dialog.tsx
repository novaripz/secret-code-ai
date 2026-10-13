"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

import { useI18n } from "@/lib/i18n";
import { XIcon } from "@/components/icons";

// In-app replacements for window.prompt / confirm / alert, and the one modal
// shell every dialog in the app is drawn in.
//
// The native dialogs are rendered by the browser, so they show the site's
// origin and look like they belong to Chrome rather than to this app — which
// is exactly the thing we're trying to avoid. Everything here is ours, themed,
// and keyboard-friendly.
//
// Callers pass their own already-translated labels, because only the caller
// knows what the button is doing. The defaults below are the exception: a
// dialog that never names its buttons still has to say "Cancel" in the
// student's language, so those two fall back to the catalog rather than to
// English baked into this file.

// ---------------------------------------------------------------------------
// The shell
// ---------------------------------------------------------------------------
//
// There used to be two modal shells that disagreed about everything: one
// closed on Escape only while its input or button had focus, the other never
// closed on Escape at all, neither kept Tab inside, and neither put focus back
// where it came from — so a keyboard user who dismissed a dialog landed at the
// top of the page. This one does all four, the same way, everywhere.
//
// It is portalled to <body>. The report dialog used to render inside the
// sidebar, and the sidebar's slide-in transform makes it the containing block
// for anything `position: fixed` inside it — so on a desktop the "full screen"
// overlay was squeezed into a 16rem column, and on a phone the click that
// opened it bubbled to the drawer's close handler and it vanished.

/** Open modals, newest last, so Escape and Tab only ever act on the top one. */
const stack: symbol[] = [];

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  onClose,
  label,
  labelledBy,
  describedBy,
  initialFocus,
  placement = "center",
  className = "",
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** The accessible name, when there is no visible heading to point at. */
  label?: string;
  labelledBy?: string;
  describedBy?: string;
  /** What gets focus on open. Defaults to the first focusable thing inside. */
  initialFocus?: RefObject<HTMLElement | null>;
  /** "top" suits a command palette: it stays put while its list grows. */
  placement?: "center" | "top";
  className?: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Kept in a ref so a parent re-rendering with a new arrow function does not
  // tear down and rebuild the key handler (and lose the focus it restores).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const token = Symbol("modal");
    stack.push(token);
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;

    // A frame later, so a child that mounts with the dialog has its ref set.
    const raf = requestAnimationFrame(() => {
      const target =
        initialFocus?.current ?? panel?.querySelector<HTMLElement>("[autofocus]") ?? panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel;
      target?.focus();
    });

    function onKeyDown(e: KeyboardEvent) {
      if (stack[stack.length - 1] !== token) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    }

    // Capture phase, so a page-level shortcut (the command palette's own
    // Escape, a chat's "Escape stops the reply") cannot act behind the dialog.
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKeyDown, true);
      const at = stack.indexOf(token);
      if (at !== -1) stack.splice(at, 1);
      // Back to whatever opened it, if that is still on the page.
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
    // `initialFocus` is a ref object, stable for the dialog's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-[70] flex justify-center overflow-y-auto bg-black/55 p-4 backdrop-blur-[2px] ${
        placement === "top" ? "items-start pt-[min(14vh,7rem)]" : "items-center"
      }`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={labelledBy ? undefined : label}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={`card animate-rise relative w-full max-w-md shadow-ui-pop outline-none ${className}`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** The heading row most dialogs share: a title, and an × that closes. */
export function ModalHeader({
  id,
  title,
  description,
  onClose,
  closeLabel,
}: {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  onClose?: () => void;
  closeLabel?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <h2 id={id} className="text-[17px] tracking-tight text-[var(--text)]">
          {title}
        </h2>
        {description && <div className="mt-1.5 text-sm leading-relaxed text-[var(--text-dim)]">{description}</div>}
      </div>
      {onClose && (
        <button type="button" onClick={onClose} aria-label={closeLabel} title={closeLabel} className="icon-btn -me-1.5 -mt-1.5">
          <XIcon />
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// prompt / confirm / alert
// ---------------------------------------------------------------------------

type DialogKind = "prompt" | "confirm" | "alert";

interface DialogRequest {
  kind: DialogKind;
  title: string;
  description?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface PendingDialog extends DialogRequest {
  resolve: (value: string | boolean | null) => void;
}

interface DialogApi {
  /** Resolves with the entered text, or null if cancelled. */
  prompt: (req: Omit<DialogRequest, "kind">) => Promise<string | null>;
  /** Resolves true when confirmed. */
  confirm: (req: Omit<DialogRequest, "kind">) => Promise<boolean>;
  /** Resolves once dismissed. */
  alert: (req: Omit<DialogRequest, "kind">) => Promise<void>;
}

const DialogContext = createContext<DialogApi | null>(null);

export function useDialog(): DialogApi {
  const api = useContext(DialogContext);
  if (!api) throw new Error("useDialog must be used inside <DialogProvider>");
  return api;
}

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const [pending, setPending] = useState<PendingDialog | null>(null);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descId = useId();

  const open = useCallback((req: DialogRequest) => {
    return new Promise<string | boolean | null>((resolve) => {
      setValue(req.defaultValue ?? "");
      setPending({ ...req, resolve });
    });
  }, []);

  const api = useMemo<DialogApi>(
    () => ({
      prompt: (req) => open({ ...req, kind: "prompt" }) as Promise<string | null>,
      confirm: (req) => open({ ...req, kind: "confirm" }) as Promise<boolean>,
      alert: async (req) => {
        await open({ ...req, kind: "alert" });
      },
    }),
    [open],
  );

  // The whole name is selected so typing replaces it, which is what a rename
  // nearly always wants; the caret is still there for a small edit.
  useEffect(() => {
    if (pending?.kind !== "prompt") return;
    const raf = requestAnimationFrame(() => inputRef.current?.select());
    return () => cancelAnimationFrame(raf);
  }, [pending]);

  function close(result: string | boolean | null) {
    pending?.resolve(result);
    setPending(null);
  }

  function submit() {
    if (!pending) return;
    if (pending.kind === "prompt") {
      const trimmed = value.trim();
      close(trimmed ? trimmed : null);
    } else {
      close(true);
    }
  }

  function cancel() {
    if (!pending) return;
    close(pending.kind === "prompt" ? null : false);
  }

  return (
    <DialogContext.Provider value={api}>
      {children}
      <Modal
        open={pending !== null}
        onClose={cancel}
        labelledBy={titleId}
        describedBy={pending?.description ? descId : undefined}
        initialFocus={pending?.kind === "prompt" ? inputRef : confirmRef}
        className="max-w-sm p-5"
      >
        {pending && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <h2 id={titleId} className="text-[17px] tracking-tight text-[var(--text)]">
              {pending.title}
            </h2>
            {pending.description && (
              <p id={descId} className="mt-1.5 text-sm leading-relaxed text-[var(--text-dim)]">
                {pending.description}
              </p>
            )}

            {pending.kind === "prompt" && (
              <input
                ref={inputRef}
                value={value}
                placeholder={pending.placeholder}
                aria-label={pending.title}
                onChange={(e) => setValue(e.target.value)}
                className="input mt-4"
              />
            )}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              {pending.kind !== "alert" && (
                <button type="button" onClick={cancel} className="btn btn-ghost">
                  {pending.cancelLabel ?? t("action.cancel")}
                </button>
              )}
              <button
                ref={confirmRef}
                type="submit"
                className={`btn ${pending.danger ? "btn-danger" : "btn-primary"}`}
              >
                {pending.confirmLabel ?? (pending.kind === "alert" ? t("action.gotIt") : t("action.ok"))}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </DialogContext.Provider>
  );
}
