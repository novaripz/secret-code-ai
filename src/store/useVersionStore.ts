"use client";

import { create } from "zustand";
import localforage from "localforage";
import { nanoid } from "nanoid";
import type { FileNode, Project } from "@/types";

// Automatic version history for one project. A student who breaks their page at
// 10pm the night before it's due needs a way back that they never had to plan
// for, so nothing here is manual: the workspace reports that the project
// changed, and this store decides whether that's worth keeping.
//
// The three judgement calls, and why they went this way:
//
// * Snapshots are whole copies of the file map rather than diffs. These are a
//   handful of small text files; a patch format would cost more code — and more
//   ways for a restore to come back subtly wrong — than it could ever save in
//   IndexedDB.
// * A snapshot is taken QUIET_MS after the last change, and folds into the
//   previous one while that one is still inside MERGE_WINDOW_MS. Debouncing
//   alone isn't enough: typing pauses every few seconds, so a straight debounce
//   would spend the whole cap in ten minutes and leave a history that only
//   reaches back as far as the last paragraph. Folding turns a burst of work
//   into one checkpoint stamped at the moment the burst started.
// * MAX_VERSIONS caps growth. The browser's own quota is invisible until it
//   fails, and a quota error is not something a 15-year-old should have to
//   understand, so the ceiling is ours.

const versionStore = localforage.createInstance({ name: "ai-code-studio", storeName: "versions" });

const QUIET_MS = 3000;
const MERGE_WINDOW_MS = 90_000;
const MAX_VERSIONS = 30;

export interface Version {
  id: string;
  /** When this checkpoint opened. Folding measures from here, and this is the time shown. */
  createdAt: number;
  /** When its contents were last refreshed, while it was still inside the merge window. */
  capturedAt: number;
  /** Plain-language summary of what changed since the checkpoint before it. */
  label: string;
  /** "checkpoint" is the state we saved on the student's behalf before going back. */
  kind: "auto" | "checkpoint" | "restore";
  rootId: string;
  files: Record<string, FileNode>;
}

/** Nodes hold only primitives, so a copy per node is a deep copy. */
function cloneFiles(files: Record<string, FileNode>): Record<string, FileNode> {
  const out: Record<string, FileNode> = {};
  for (const [id, node] of Object.entries(files)) out[id] = { ...node };
  return out;
}

function contentsByPath(files: Record<string, FileNode>): Map<string, string> {
  const map = new Map<string, string>();
  for (const node of Object.values(files)) {
    if (node.kind === "file") map.set(node.path, node.content ?? "");
  }
  return map;
}

interface Change {
  label: string;
  changed: boolean;
}

/**
 * What happened between two snapshots, in words a student would use. This runs
 * on every candidate snapshot, so it stays a set comparison over paths — no
 * line diffing.
 */
function describeChange(prev: Version | undefined, next: Record<string, FileNode>): Change {
  const after = contentsByPath(next);
  if (!prev) return { label: "Starting point", changed: after.size > 0 };

  const before = contentsByPath(prev.files);
  const added: string[] = [];
  const edited: string[] = [];
  const removed: string[] = [];

  for (const [path, content] of after) {
    if (!before.has(path)) added.push(path);
    else if (before.get(path) !== content) edited.push(path);
  }
  for (const path of before.keys()) {
    if (!after.has(path)) removed.push(path);
  }

  const total = added.length + edited.length + removed.length;
  if (total === 0) return { label: "No changes", changed: false };

  const name = (path: string) => path.split("/").pop() ?? path;
  if (total === 1) {
    if (added.length) return { label: `Added ${name(added[0])}`, changed: true };
    if (removed.length) return { label: `Deleted ${name(removed[0])}`, changed: true };
    return { label: `Edited ${name(edited[0])}`, changed: true };
  }

  const parts: string[] = [];
  if (edited.length) parts.push(`edited ${edited.length}`);
  if (added.length) parts.push(`added ${added.length}`);
  if (removed.length) parts.push(`deleted ${removed.length}`);
  return { label: `Changed ${total} files — ${parts.join(", ")}`, changed: true };
}

function clockTime(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

interface VersionState {
  projectId: string | null;
  /** Oldest first, matching how the rest of the app stores append-only lists. */
  versions: Version[];
  loaded: boolean;

  load: (projectId: string) => Promise<void>;
  /** Called on every project change; the snapshot itself waits for quiet. */
  noteChange: (project: Project) => void;
  /**
   * Puts the given version's files back. Nothing is deleted: the state being
   * left behind is saved first, so going back is itself undoable — the student
   * can restore that checkpoint and land exactly where they started.
   * Returns the project to hand to the studio store, or null if it's gone.
   */
  restore: (versionId: string, current: Project) => Project | null;
}

// The pending snapshot lives outside the store: it's a timer, not state anything
// renders, and re-rendering the workspace on every keystroke would defeat the
// point of debouncing at all.
let timer: ReturnType<typeof setTimeout> | null = null;
let pendingProject: Project | null = null;

function cancelPending() {
  if (timer) clearTimeout(timer);
  timer = null;
  pendingProject = null;
}

export const useVersionStore = create<VersionState>((set, get) => {
  function persist(projectId: string, versions: Version[]) {
    // Fire and forget: a failed write costs the student a version, not their work.
    versionStore.setItem(`versions:${projectId}`, versions).catch(() => {});
  }

  /** Records a snapshot, folding into the newest one when it's still open. */
  function capture(project: Project, override?: { label: string; kind: Version["kind"] }) {
    const { projectId, versions } = get();
    if (!projectId || projectId !== project.id) return;

    const newest = versions[versions.length - 1];
    const { label, changed } = describeChange(newest, project.files);
    // Reopening a project, switching tabs, or an edit that was typed and undone
    // all arrive here with nothing actually different. Don't spend a slot.
    if (!override && !changed) return;

    const now = Date.now();
    const snapshot: Version = {
      id: nanoid(10),
      createdAt: now,
      capturedAt: now,
      label: override?.label ?? label,
      kind: override?.kind ?? "auto",
      rootId: project.rootId,
      files: cloneFiles(project.files),
    };

    const foldable =
      !override && newest && newest.kind === "auto" && now - newest.createdAt < MERGE_WINDOW_MS;

    let next: Version[];
    if (foldable) {
      // Keep the checkpoint's original time — it marks when this stretch of work
      // began, which is the moment a student would actually want to return to.
      const folded: Version = {
        ...snapshot,
        id: newest.id,
        createdAt: newest.createdAt,
        // Re-describe against the checkpoint before the one being replaced, so
        // the label covers the whole burst rather than the last three seconds.
        label: describeChange(versions[versions.length - 2], project.files).label,
      };
      next = [...versions.slice(0, -1), folded];
    } else {
      next = [...versions, snapshot];
    }

    if (next.length > MAX_VERSIONS) next = next.slice(next.length - MAX_VERSIONS);
    set({ versions: next });
    persist(projectId, next);
  }

  return {
    projectId: null,
    versions: [],
    loaded: false,

    load: async (projectId) => {
      cancelPending();
      set({ projectId, versions: [], loaded: false });
      const stored = (await versionStore.getItem<Version[]>(`versions:${projectId}`)) ?? [];
      // A slower project could finish loading after the student moved on.
      if (get().projectId !== projectId) return;
      set({ versions: stored, loaded: true });
    },

    noteChange: (project) => {
      if (get().projectId !== project.id) return;
      pendingProject = project;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const project = pendingProject;
        cancelPending();
        if (project) capture(project);
      }, QUIET_MS);
    },

    restore: (versionId, current) => {
      const version = get().versions.find((v) => v.id === versionId);
      if (!version) return null;

      // Anything typed in the last few seconds hasn't been snapshotted yet, so
      // take it now — otherwise going back would silently eat it.
      cancelPending();
      capture(current, { label: "Before going back", kind: "checkpoint" });
      capture(
        { ...current, files: version.files, rootId: version.rootId },
        { label: `Went back to ${clockTime(version.createdAt)}`, kind: "restore" },
      );

      // The name and id stay as they are: going back to older code shouldn't
      // quietly rename the project the student has been showing people.
      return {
        ...current,
        files: cloneFiles(version.files),
        rootId: version.rootId,
        updatedAt: Date.now(),
      };
    },
  };
});
