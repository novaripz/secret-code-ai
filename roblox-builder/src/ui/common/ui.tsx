"use client";

import { AlertTriangle, Check, CheckCircle2, Info, Loader2, X, XCircle, CircleDashed, Boxes, Blocks, Code2, LayoutTemplate, Puzzle, Globe, Box } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { create } from "zustand";
import type { ProjectKind } from "@/core/roblox/template";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx("animate-spin", className ?? "size-3.5")} />;
}

export function StatusIcon({ status, className }: { status: "pass" | "warn" | "fail" | "skip" | "running" | "error" | "info"; className?: string }) {
  const c = className ?? "size-4";
  switch (status) {
    case "pass":
      return <CheckCircle2 className={cx(c, "text-ok")} />;
    case "warn":
      return <AlertTriangle className={cx(c, "text-warn")} />;
    case "fail":
    case "error":
      return <XCircle className={cx(c, "text-err")} />;
    case "running":
      return <Spinner className={cx(c, "text-accent")} />;
    case "info":
      return <Info className={cx(c, "text-accent-2")} />;
    default:
      return <CircleDashed className={cx(c, "text-fg-3")} />;
  }
}

export function SeverityGlyph({ severity }: { severity: "error" | "warning" | "info" }) {
  return (
    <span className={cx("font-mono text-xs font-bold", severity === "error" ? "text-err" : severity === "warning" ? "text-warn" : "text-accent-2")}>
      {severity === "error" ? "✕" : severity === "warning" ? "⚠" : "ℹ"}
    </span>
  );
}

export const KIND_META: Record<ProjectKind, { label: string; icon: typeof Boxes; tint: string }> = {
  "roblox-experience": { label: "Experience", icon: Boxes, tint: "from-violet-500/30 to-cyan-400/20" },
  "roblox-ui": { label: "Roblox UI", icon: LayoutTemplate, tint: "from-fuchsia-500/30 to-violet-400/20" },
  "roblox-system": { label: "System", icon: Blocks, tint: "from-emerald-500/30 to-cyan-400/20" },
  "roblox-plugin": { label: "Plugin", icon: Puzzle, tint: "from-amber-500/30 to-rose-400/20" },
  "roblox-asset": { label: "3D Asset", icon: Box, tint: "from-sky-500/30 to-indigo-400/20" },
  "web-app": { label: "Web App", icon: Globe, tint: "from-teal-500/30 to-lime-400/20" },
};

export function KindIcon({ kind, className }: { kind: ProjectKind; className?: string }) {
  const Icon = KIND_META[kind]?.icon ?? Code2;
  return <Icon className={className ?? "size-4"} />;
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex h-full min-h-40 flex-col items-center justify-center gap-3 p-6 text-center animate-fade-in">
      {icon && <div className="grid size-11 place-items-center rounded-2xl bg-raise text-fg-2 hairline">{icon}</div>}
      <div className="text-sm font-medium text-fg">{title}</div>
      {children && <div className="max-w-sm text-xs leading-relaxed text-fg-3">{children}</div>}
      {action}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, size = "sm" }: { value: T; options: { value: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void; size?: "sm" | "md" }) {
  return (
    <div className={cx("inline-flex rounded-lg bg-bg-2 p-0.5 hairline", size === "md" ? "text-sm" : "text-xs")}>
      {options.map((o) => (
        <button
          key={o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cx(
            "flex items-center gap-1.5 rounded-md px-2.5 font-medium transition-all",
            size === "md" ? "h-8" : "h-6",
            value === o.value ? "bg-raise text-fg shadow-sm hairline" : "text-fg-3 hover:text-fg-2",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function timeAgo(t: number): string {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// ------------------------------------------------------------ toasts

interface Toast {
  id: number;
  kind: "ok" | "error" | "info";
  text: string;
}

export const useToasts = create<{ toasts: Toast[]; push: (kind: Toast["kind"], text: string) => void; dismiss: (id: number) => void }>((set) => ({
  toasts: [],
  push: (kind, text) => {
    const id = Date.now() + Math.random();
    set((s) => ({ toasts: [...s.toasts.slice(-4), { id, kind, text }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), kind === "error" ? 7000 : 3500);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = {
  ok: (t: string) => useToasts.getState().push("ok", t),
  error: (t: string) => useToasts.getState().push("error", t),
  info: (t: string) => useToasts.getState().push("info", t),
};

export function Toaster() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => (
        <div key={t.id} className="glass pointer-events-auto flex max-w-lg items-start gap-2.5 rounded-xl px-3.5 py-2.5 text-sm animate-rise">
          {t.kind === "ok" ? <Check className="mt-0.5 size-4 text-ok" /> : t.kind === "error" ? <XCircle className="mt-0.5 size-4 text-err" /> : <Info className="mt-0.5 size-4 text-accent-2" />}
          <span className="whitespace-pre-wrap text-fg">{t.text}</span>
          <button onClick={() => dismiss(t.id)} className="ml-1 text-fg-3 hover:text-fg">
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------ dialogs (never native popups)

interface DialogRequest {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  input?: { label?: string; initial?: string; placeholder?: string };
  resolve: (value: string | boolean | null) => void;
}

const DialogCtx = createContext<(r: Omit<DialogRequest, "resolve">) => Promise<string | boolean | null>>(async () => null);

export function DialogProvider({ children }: { children: ReactNode }) {
  const [req, setReq] = useState<DialogRequest | null>(null);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const open = useCallback(
    (r: Omit<DialogRequest, "resolve">) =>
      new Promise<string | boolean | null>((resolve) => {
        setValue(r.input?.initial ?? "");
        setReq({ ...r, resolve });
      }),
    [],
  );
  useEffect(() => {
    if (req?.input) setTimeout(() => inputRef.current?.select(), 30);
  }, [req]);
  const close = (v: string | boolean | null) => {
    req?.resolve(v);
    setReq(null);
  };
  return (
    <DialogCtx.Provider value={open}>
      {children}
      {req && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/50 p-4 animate-fade-in" onMouseDown={() => close(null)}>
          <form
            className="glass w-full max-w-md rounded-2xl p-5 animate-rise"
            onMouseDown={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              close(req.input ? value : true);
            }}
            onKeyDown={(e) => e.key === "Escape" && close(null)}
          >
            <div className="text-[15px] font-semibold">{req.title}</div>
            {req.body && <div className="mt-2 text-sm leading-relaxed text-fg-2">{req.body}</div>}
            {req.input && (
              <label className="mt-4 block">
                {req.input.label && <div className="mb-1.5 text-xs text-fg-3">{req.input.label}</div>}
                <input ref={inputRef} className="input" value={value} placeholder={req.input.placeholder} onChange={(e) => setValue(e.target.value)} autoFocus />
              </label>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn btn-ghost" onClick={() => close(null)}>
                Cancel
              </button>
              <button type="submit" className={cx("btn", req.danger ? "bg-err/15 text-err hover:bg-err/25" : "btn-primary")} autoFocus={!req.input}>
                {req.confirmLabel ?? "OK"}
              </button>
            </div>
          </form>
        </div>
      )}
    </DialogCtx.Provider>
  );
}

export function useDialog() {
  const open = useContext(DialogCtx);
  return {
    confirm: async (title: string, body?: ReactNode, opts: { confirmLabel?: string; danger?: boolean } = {}) => (await open({ title, body, ...opts })) === true,
    prompt: async (title: string, opts: { label?: string; initial?: string; placeholder?: string; confirmLabel?: string; body?: ReactNode } = {}) => {
      const v = await open({ title, body: opts.body, confirmLabel: opts.confirmLabel, input: { label: opts.label, initial: opts.initial, placeholder: opts.placeholder } });
      return typeof v === "string" ? v : null;
    },
  };
}

function subscribeTheme(cb: () => void) {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
}

export function useThemeToggle(): [string, () => void] {
  const theme = useSyncExternalStore(subscribeTheme, () => document.documentElement.dataset.theme ?? "dark", () => "dark");
  return [
    theme,
    () => {
      const next = theme === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      try {
        localStorage.setItem("rb-theme", next);
      } catch {
        /* per-viewer convenience only */
      }
    },
  ];
}

export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className ?? "size-6"} aria-hidden>
      <defs>
        <linearGradient id="rbg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--accent-2)" />
        </linearGradient>
      </defs>
      <path d="M18 10 54 20 46 54 10 44Z" fill="url(#rbg)" />
      <path d="M28 25 40 28.3 37.5 39 25.6 35.7Z" fill="var(--bg)" />
    </svg>
  );
}
