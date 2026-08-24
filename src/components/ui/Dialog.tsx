"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

// In-app replacements for window.prompt / confirm / alert. The native ones are
// rendered by the browser, so they show the site's origin and look like they
// belong to Chrome rather than to this app — which is exactly the thing we're
// trying to avoid. Everything here is ours, themed, and keyboard-friendly.

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
  const [pending, setPending] = useState<PendingDialog | null>(null);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (pending?.kind === "prompt") inputRef.current?.select();
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
      {pending && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) cancel();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={pending.title}
            className="animate-rise w-full max-w-sm rounded-2xl border border-[var(--line)] bg-[var(--surface-1)] p-5 shadow-2xl"
          >
            <h2 className="text-base font-semibold text-[var(--text)]">{pending.title}</h2>
            {pending.description && (
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-dim)]">{pending.description}</p>
            )}

            {pending.kind === "prompt" && (
              <input
                ref={inputRef}
                autoFocus
                value={value}
                placeholder={pending.placeholder}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submit();
                  if (e.key === "Escape") cancel();
                }}
                className="mt-4 w-full rounded-xl border border-[var(--line-strong)] bg-[var(--surface-2)] px-3 py-2.5 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--focus)]"
              />
            )}

            <div className="mt-5 flex justify-end gap-2">
              {pending.kind !== "alert" && (
                <button
                  onClick={cancel}
                  className="rounded-full px-4 py-2 text-sm font-medium text-[var(--text-dim)] hover:bg-[var(--surface-2)]"
                >
                  {pending.cancelLabel ?? "Cancel"}
                </button>
              )}
              <button
                autoFocus={pending.kind !== "prompt"}
                onClick={submit}
                onKeyDown={(e) => e.key === "Escape" && cancel()}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  pending.danger
                    ? "bg-[var(--danger)] text-white hover:opacity-90"
                    : "bg-[var(--accent)] text-[var(--accent-contrast)] hover:opacity-90"
                }`}
              >
                {pending.confirmLabel ?? (pending.kind === "alert" ? "Got it" : "OK")}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}
