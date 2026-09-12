"use client";

// The roster, and the one-sided way students get onto it.
//
// A teacher types an email and the student is in. No code for the student to
// type, no request for them to accept, nothing to explain to thirty people at
// once — because the half of this that fails in a real classroom is always the
// step that depends on a teenager doing something. If the address already has
// an account it becomes an enrollment; if it does not, it waits as an invite
// and turns into one the moment they sign up.
//
// Joined and invited are therefore visually different, not two shades of the
// same list: the teacher's question is "who can I actually see work from?", and
// a pending invite is not an answer to it.

import Link from "next/link";
import { useState } from "react";
import { useTeacherStore } from "./store";
import {
  ActionErrorNote,
  Chip,
  Scroller,
  SectionHeading,
  buttonClass,
  cardClass,
  fieldClass,
  formatLastActive,
  formatDate,
} from "./primitives";
import { TrashIcon } from "@/components/icons";
import { useDialog } from "@/components/ui/Dialog";

export function RosterView({ classId }: { classId: string }) {
  const students = useTeacherStore((s) => s.roster[classId] ?? []);
  const invites = useTeacherStore((s) => s.invites[classId] ?? []);
  const invite = useTeacherStore((s) => s.invite);
  const cancelInvite = useTeacherStore((s) => s.cancelInvite);
  const removeStudent = useTeacherStore((s) => s.removeStudent);
  const actionError = useTeacherStore((s) => s.actionError);
  const clearActionError = useTeacherStore((s) => s.clearActionError);
  const dialog = useDialog();

  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The format and duplicate checks answer instantly; the server's answer takes
  // a round trip. Clearing the field only after the write lands means a teacher
  // never has to remember what they typed to try it again.
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const typed = email.trim().toLowerCase();
    const problem = await invite(classId, email);
    setBusy(false);
    setError(problem);
    if (!problem) {
      setAdded(typed);
      setEmail("");
    }
  }

  async function confirmRemove(id: string, name: string) {
    const ok = await dialog.confirm({
      title: `Remove ${name} from this class?`,
      description:
        "They keep their own work and chats. They stop appearing in this roster and in this class's learning signals.",
      confirmLabel: "Remove",
      danger: true,
    });
    if (ok) await removeStudent(classId, id);
  }

  return (
    <>
      <ActionErrorNote error={actionError} onDismiss={clearActionError} />

      <form onSubmit={(e) => void submit(e)} className={`${cardClass} mt-3 p-4`}>
        <SectionHeading
          title="Add a student"
          sub="Type their school email. They don't have to accept anything."
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          {/* Deliberately not type="email": the browser's own validation bubble
              looks like Chrome rather than like Panda, and it fires before our
              message ever renders. We check the format ourselves and say so in
              the line below the field. */}
          <input
            type="text"
            inputMode="email"
            autoComplete="off"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
            }}
            placeholder="student@school.edu"
            aria-label="Student email address"
            aria-invalid={error ? true : undefined}
            className={fieldClass}
          />
          <button
            type="submit"
            className={`${buttonClass} sm:w-36`}
            disabled={!email.trim() || busy}
          >
            {busy ? "Adding…" : "Add student"}
          </button>
        </div>

        {/* Both messages live in the same slot so the form never jumps. */}
        <p
          role="status"
          className="mt-2 text-xs leading-relaxed"
          style={{ color: error ? "var(--danger)" : "var(--text-faint)" }}
        >
          {error ??
            (added
              ? `${added} is invited. They join this class automatically the first time they sign in.`
              : "If they already use Panda they appear below straight away. If not, the invite waits for them.")}
        </p>
      </form>

      <div className="mt-6">
        <SectionHeading
          title={`In this class (${students.length})`}
          sub="Signed in, enrolled, and visible in this class's analytics."
        />

        <Scroller>
          <table className="w-full min-w-[620px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] text-left">
                <th scope="col" className="px-3 py-2 text-xs font-medium text-[var(--text-faint)]">Student</th>
                <th scope="col" className="px-3 py-2 text-xs font-medium text-[var(--text-faint)]">Progress</th>
                <th scope="col" className="px-3 py-2 text-xs font-medium text-[var(--text-faint)]">Last active</th>
                <th scope="col" className="px-3 py-2 text-xs font-medium text-[var(--text-faint)]">Joined</th>
                {/* `relative` matters: an sr-only span is absolutely positioned, and
                    without a positioned ancestor it escapes the table's scroller and
                    drags the whole page sideways at phone width. */}
                <th scope="col" className="relative px-3 py-2"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id} className="border-b border-[var(--line)] last:border-0">
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/teacher/classes/${classId}/students/${s.id}`}
                      className="block font-medium text-[var(--text)] underline-offset-4 hover:underline"
                    >
                      {s.displayName}
                    </Link>
                    <span className="text-xs text-[var(--text-faint)]">{s.email}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="flex flex-wrap items-center gap-1">
                      <Chip tone="good">{s.done} done</Chip>
                      {s.doing > 0 && <Chip>{s.doing} in progress</Chip>}
                      {s.overdue > 0 && <Chip tone="bad">{s.overdue} overdue</Chip>}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-xs text-[var(--text-dim)]">
                    {/* Nothing in the schema records when a student last used
                        Panda, so this says "not recorded" rather than the
                        "never opened Panda" that a null would otherwise print
                        — which would be a claim we cannot support. */}
                    {s.lastActiveAt === null ? "Not recorded" : formatLastActive(s.lastActiveAt)}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-xs text-[var(--text-faint)]">
                    {formatDate(s.joinedAt)}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      onClick={() => confirmRemove(s.id, s.displayName)}
                      aria-label={`Remove ${s.displayName} from this class`}
                      title={`Remove ${s.displayName}`}
                      className="rounded-lg p-1.5 text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--danger)]"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Scroller>
      </div>

      <div className="mt-7">
        <SectionHeading
          title={`Invited (${invites.length})`}
          sub="No account yet. Nothing to see from them until they sign in."
        />
        {invites.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--line-strong)] px-4 py-6 text-center text-sm text-[var(--text-faint)]">
            Everyone you&apos;ve added has signed in.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {invites.map((i) => (
              <li
                key={i.id}
                className="flex items-center gap-3 rounded-xl border border-dashed border-[var(--line-strong)] px-3.5 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-[var(--text-dim)]">{i.email}</p>
                  <p className="text-xs text-[var(--text-faint)]">Invited {formatDate(i.invitedAt)}</p>
                </div>
                <Chip tone="warn">Waiting for first sign-in</Chip>
                <button
                  onClick={() => void cancelInvite(classId, i.id)}
                  aria-label={`Cancel the invite for ${i.email}`}
                  title="Cancel invite"
                  className="rounded-lg p-1.5 text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--danger)]"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
