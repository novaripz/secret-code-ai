"use client";

import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";

// Google's own sign-in button, via Google Identity Services.
//
// GIS renders the button itself into a container we give it, which is what
// keeps it looking and behaving like every other "Sign in with Google" button
// the user has seen. The token it hands back goes straight to the server to be
// verified; nothing here trusts it.

const SRC = "https://accounts.google.com/gsi/client";

interface GoogleIdentity {
  accounts: {
    id: {
      initialize: (config: {
        client_id: string;
        callback: (res: { credential?: string }) => void;
      }) => void;
      renderButton: (parent: HTMLElement, options: Record<string, string | number>) => void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

function loadScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("blocked")));
      return;
    }

    const script = document.createElement("script");
    script.src = SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("blocked"));
    document.head.appendChild(script);
  });
}

export function GoogleSignIn({ onDone }: { onDone?: () => void }) {
  const signIn = useAuthStore((s) => s.signIn);
  const error = useAuthStore((s) => s.error);
  const busy = useAuthStore((s) => s.busy);

  const holder = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unconfigured" | "blocked">("loading");

  useEffect(() => {
    let cancelled = false;

    // The client id comes from the server at runtime, so the whole setup is
    // one variable rather than a public copy and a private one.
    (async () => {
      const res = await fetch("/api/auth/config");
      const { clientId } = (await res.json()) as { clientId: string | null };
      if (cancelled) return;
      if (!clientId) {
        setStatus("unconfigured");
        return;
      }

      await loadScript();
      if (cancelled || !holder.current || !window.google) return;

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (res) => {
          if (res.credential && (await signIn(res.credential))) onDone?.();
        },
      });
      window.google.accounts.id.renderButton(holder.current, {
        theme: "filled_black",
        size: "large",
        shape: "pill",
        text: "signin_with",
        width: 260,
      });
      setStatus("ready");
    })().catch(() => {
      if (!cancelled) setStatus("blocked");
    });

    return () => {
      cancelled = true;
    };
  }, [signIn, onDone]);

  if (status === "unconfigured") {
    return (
      <p className="text-sm leading-relaxed text-[var(--text-faint)]">
        Google sign-in isn&apos;t set up yet. Create an OAuth client ID in Google Cloud Console and set{" "}
        <code className="rounded bg-[var(--surface-2)] px-1 py-0.5 font-mono text-xs">GOOGLE_CLIENT_ID</code>.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div ref={holder} className="min-h-[44px]" />
      {status === "loading" && <p className="text-sm text-[var(--text-faint)]">Loading Google…</p>}
      {status === "blocked" && (
        <p className="text-sm text-[var(--text-faint)]">
          Couldn&apos;t load Google sign-in. An ad blocker or your school network may be blocking it.
        </p>
      )}
      {busy && <p className="text-sm text-[var(--text-faint)]">Signing you in…</p>}
      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
    </div>
  );
}
