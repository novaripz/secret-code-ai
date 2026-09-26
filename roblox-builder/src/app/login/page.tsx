"use client";

import { useState } from "react";
import { Logo } from "@/ui/common/ui";

export default function Login() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="grid min-h-screen place-items-center p-4">
      <form
        className="glass w-full max-w-sm rounded-2xl p-6"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const res = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) });
          if (res.ok) window.location.replace("/");
          else {
            setError((await res.json()).error ?? "Sign in failed");
            setBusy(false);
          }
        }}
      >
        <Logo className="size-8" />
        <h1 className="mt-4 text-lg font-semibold">Sign in to Roblox Builder</h1>
        <p className="mt-1 text-sm text-fg-3">This workspace is password protected.</p>
        <input type="password" className="input mt-5 h-10" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        {error && <p className="mt-2 text-sm text-err">{error}</p>}
        <button className="btn btn-primary mt-4 h-10 w-full justify-center" disabled={busy || !password}>
          Continue
        </button>
      </form>
    </div>
  );
}
