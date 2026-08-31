"use client";

import { useEffect, useState } from "react";
import { useSchoolStore } from "@/store/useSchoolStore";
import { useI18n } from "@/lib/i18n";
import { CLASS_COLORS } from "@/lib/school/types";

// Connecting Canvas, and pulling classes in.
//
// The merge is the careful part: a sync updates what Canvas owns (title, due
// date, points) and never touches what the student owns (whether they have
// marked it done). A failed sync changes nothing at all, because the server
// returns data for the client to merge rather than replacing anything itself.

interface Status {
  configured: boolean;
  connected: boolean;
  baseUrl?: string;
  userName?: string;
}

interface SyncedClass {
  externalId: string;
  name: string;
}
interface SyncedAssignment {
  externalId: string;
  classExternalId: string;
  title: string;
  instructions?: string;
  dueAt: number | null;
  points?: number;
}

export function CanvasSection() {
  const { t } = useI18n();
  const school = useSchoolStore();

  const [status, setStatus] = useState<Status | null>(null);
  const [school_, setSchool] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/canvas/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ configured: false, connected: false }));
  }, []);

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/canvas/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl: school_ }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("error.generic"));
        setBusy(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError(t("error.offline"));
      setBusy(false);
    }
  }

  async function sync() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch("/api/canvas/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("error.generic"));
        return;
      }

      const classes: SyncedClass[] = data.classes ?? [];
      const assignments: SyncedAssignment[] = data.assignments ?? [];

      // Canvas ids map to local ids, so a second sync updates rows rather than
      // creating duplicates.
      const classIdByExternal = new Map<string, string>();

      classes.forEach((c, i) => {
        const existing = school.classes.find((x) => x.source === "canvas" && x.externalId === c.externalId);
        if (existing) {
          school.updateClass(existing.id, { name: c.name });
          classIdByExternal.set(c.externalId, existing.id);
        } else {
          const created = school.addClass({ name: c.name, color: CLASS_COLORS[i % CLASS_COLORS.length] });
          school.updateClass(created.id, { source: "canvas", externalId: c.externalId });
          classIdByExternal.set(c.externalId, created.id);
        }
      });

      let added = 0;
      for (const a of assignments) {
        const classId = classIdByExternal.get(a.classExternalId);
        if (!classId) continue;

        const existing = school.assignments.find(
          (x) => x.source === "canvas" && x.externalId === a.externalId,
        );
        if (existing) {
          // Status is deliberately absent: Canvas does not know the student
          // ticked it off here, and overwriting that would undo their work.
          school.updateAssignment(existing.id, {
            title: a.title,
            instructions: a.instructions,
            dueAt: a.dueAt,
            points: a.points,
          });
        } else {
          const created = school.addAssignment({
            classId,
            title: a.title,
            instructions: a.instructions,
            dueAt: a.dueAt,
            points: a.points,
          });
          school.updateAssignment(created.id, { source: "canvas", externalId: a.externalId });
          added++;
        }
      }

      setNote(
        added > 0
          ? `Synced. ${added} new assignment${added === 1 ? "" : "s"}.`
          : "Synced. Everything was already up to date.",
      );
    } catch {
      setError(t("error.offline"));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    await fetch("/api/canvas/disconnect", { method: "POST" });
    setStatus({ configured: status?.configured ?? false, connected: false });
    setNote("Canvas disconnected. Your classes stayed.");
  }

  if (!status) {
    return <div className="h-24 rounded-2xl border border-[var(--line)]" />;
  }

  if (!status.configured) {
    return (
      <div className="rounded-2xl border border-[var(--line)] p-4">
        <p className="font-medium text-[var(--text)]">Canvas</p>
        <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-faint)]">
          Canvas isn&apos;t set up yet. It needs a developer key from whoever runs your school&apos;s
          Canvas, then <code className="rounded bg-[var(--surface-2)] px-1 py-0.5 font-mono text-xs">CANVAS_CLIENT_ID</code>,{" "}
          <code className="rounded bg-[var(--surface-2)] px-1 py-0.5 font-mono text-xs">CANVAS_CLIENT_SECRET</code> and{" "}
          <code className="rounded bg-[var(--surface-2)] px-1 py-0.5 font-mono text-xs">CANVAS_REDIRECT_URI</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--line)] p-4">
      <p className="font-medium text-[var(--text)]">Canvas</p>

      {status.connected ? (
        <>
          <p className="mt-1.5 text-sm text-[var(--text-faint)]">
            Connected{status.userName ? ` as ${status.userName}` : ""} · {status.baseUrl?.replace("https://", "")}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={sync}
              disabled={busy}
              className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-contrast)] disabled:opacity-40"
            >
              {busy ? "Syncing…" : "Sync now"}
            </button>
            <button
              onClick={disconnect}
              className="rounded-xl border border-[var(--line-strong)] px-4 py-2 text-sm text-[var(--text-dim)] transition-colors hover:border-[var(--danger)] hover:text-[var(--danger)]"
            >
              Disconnect
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-1.5 mb-3 text-sm leading-relaxed text-[var(--text-faint)]">
            Connect Canvas so your classes and assignments appear here automatically. Panda will see
            your classes, assignments and due dates. It never asks for your Canvas password.
          </p>
          <form onSubmit={connect} className="flex gap-2">
            <input
              value={school_}
              onChange={(e) => setSchool(e.target.value)}
              placeholder="myschool.instructure.com"
              aria-label="Your school's Canvas address"
              className="min-w-0 flex-1 rounded-xl border border-[var(--line-strong)] bg-[var(--surface-2)] px-3.5 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[var(--focus)]"
            />
            <button
              type="submit"
              disabled={busy || !school_.trim()}
              className="shrink-0 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-contrast)] disabled:opacity-40"
            >
              Connect
            </button>
          </form>
        </>
      )}

      {error && <p className="mt-3 text-sm text-[var(--danger)]">{error}</p>}
      {note && <p className="mt-3 text-sm text-[var(--success)]">{note}</p>}
    </div>
  );
}
