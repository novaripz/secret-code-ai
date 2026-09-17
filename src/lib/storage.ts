"use client";

import localforage from "localforage";
import { accountScope } from "@/store/useAuthStore";
import type { Project } from "@/types";

// Client-side persistence via IndexedDB (through localforage). Keeps the app
// fully usable with zero backend config. Firebase sync can be layered on top
// later (see lib/firebase.ts) without changing this interface.

/**
 * One object store per account, the same way useAssistantStore, useWatchStore
 * and useInsightsStore already name theirs. This module used to be the one
 * place that skipped it, and the result was the exact thing accountScope()
 * exists to prevent: on a shared classroom machine the second student to sign
 * in opened /build and saw the first student's projects by name, and could
 * open, edit and delete them.
 *
 * The suffix is sanitised because localforage turns storeName into an
 * IndexedDB object-store name, and account ids carry characters (the leading
 * ":" from accountScope(), and the dashes in a UUID) that are better not
 * spelled into one. Exported so a check can assert two accounts never land on
 * the same store without having to stand up IndexedDB.
 */
export function projectsStoreName(scope: string): string {
  return `projects${scope.replace(/[^a-zA-Z0-9]/g, "_")}`;
}

/**
 * What happens to the projects that are already on disk, and why nothing is
 * migrated.
 *
 * Everything written before this fix lives under the bare storeName
 * "projects". accountScope() returns "" for a guest, so projectsStoreName("")
 * is still exactly "projects" — the legacy store IS the guest store. That
 * matters more than it sounds: the common classroom case is a room where
 * nobody signs in at all, and for that room this change is a no-op. Every
 * project stays where it was, under the key it was written with, and opens as
 * it did yesterday.
 *
 * Only a signed-in account starts empty, and that is deliberate. The rejected
 * alternative was to move the legacy store into the first account that signs
 * in after the update. On a shared machine nobody can know whose work that is
 * — it is the pooled output of every student who used the browser — so
 * "adopt it" means handing one student the rest of the class's projects under
 * their own name, which is the leak we are fixing, made permanent and
 * plausible-looking. Copying it into every account instead multiplies the leak
 * rather than removing it. Deleting it is worse than either: it destroys work
 * we were only ever asked to stop showing to strangers.
 *
 * So the legacy data is left untouched and reachable. Nothing here deletes or
 * rewrites it; there is deliberately no dropInstance() or clear() in this
 * module. A student who signed in and finds their old work missing gets it
 * back by signing out, which returns the app to the exact state the work was
 * created in. The harm chosen is a signed-in student having to sign out to see
 * pre-fix projects, over any student ever seeing, editing or deleting
 * another's. Surfacing an "older projects from before sign-in" entry in the
 * /build UI would soften that, but it is a change in app/build/page.tsx and
 * belongs to whoever owns that file.
 */
const store = localforage.createInstance({
  name: "ai-code-studio",
  // Read once at module load, which is the convention the other stores follow
  // and is safe because useAuthStore.adopt() reloads the page whenever the
  // scope changes — see the comment above adopt().
  storeName: projectsStoreName(accountScope()),
});

const INDEX_KEY = "__project_index__";

export interface ProjectSummary {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

async function getIndex(): Promise<ProjectSummary[]> {
  return (await store.getItem<ProjectSummary[]>(INDEX_KEY)) ?? [];
}

async function setIndex(index: ProjectSummary[]): Promise<void> {
  await store.setItem(INDEX_KEY, index);
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const index = await getIndex();
  return [...index].sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function loadProject(id: string): Promise<Project | undefined> {
  return (await store.getItem<Project>(`project:${id}`)) ?? undefined;
}

export async function saveProject(project: Project): Promise<void> {
  await store.setItem(`project:${project.id}`, project);
  const index = await getIndex();
  const existing = index.find((p) => p.id === project.id);
  const summary: ProjectSummary = {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
  if (existing) {
    Object.assign(existing, summary);
  } else {
    index.push(summary);
  }
  await setIndex(index);
}

export async function deleteProject(id: string): Promise<void> {
  await store.removeItem(`project:${id}`);
  const index = await getIndex();
  await setIndex(index.filter((p) => p.id !== id));
}

// ---------------------------------------------------------------------------
// Work made before sign-in
// ---------------------------------------------------------------------------
//
// The comment above explains why nothing is migrated automatically: on a shared
// machine the pre-fix store is the pooled output of every student who used the
// browser, and no code can tell whose project is whose. But the STUDENT can.
// They know which one they made. So instead of guessing, we show them the old
// store and let them say.
//
// That is the whole design. Nothing moves until a person points at one project
// and claims it, one at a time, by name. A claim copies rather than moves, so a
// wrong claim costs nothing and the original stays where the next student will
// still find it — this is the one place where leaving a duplicate behind is
// better than being tidy, because the alternative is a student destroying
// somebody else's only copy by misremembering.

/** The store everything was written to before projects were scoped. */
function legacyStore() {
  return localforage.createInstance({ name: "ai-code-studio", storeName: "projects" });
}

/**
 * Projects sitting in the pre-sign-in store, for a signed-in student to look
 * through. Empty for a guest, because for a guest the legacy store IS their
 * store — offering to copy their own projects into their own store would be
 * nonsense, and would put a duplicate of everything in front of them.
 */
export async function listLegacyProjects(): Promise<ProjectSummary[]> {
  if (accountScope() === "") return [];
  try {
    const index = (await legacyStore().getItem<ProjectSummary[]>(INDEX_KEY)) ?? [];
    const mine = new Set((await getIndex()).map((p) => p.id));
    // Anything already claimed is filtered out, so the list shrinks as they
    // work through it and a second claim cannot make a second copy.
    return index.filter((p) => !mine.has(p.id)).sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    // No legacy store on this device, or storage is blocked. Nothing to offer.
    return [];
  }
}

/**
 * Copy one pre-sign-in project into the signed-in student's own store.
 *
 * Deliberately a copy. The original is left for whoever else used this browser,
 * and a student who claims the wrong thing can simply delete their copy without
 * having taken anything from anyone.
 */
export async function claimLegacyProject(id: string): Promise<Project | undefined> {
  if (accountScope() === "") return undefined;
  const project = await legacyStore().getItem<Project>(`project:${id}`);
  if (!project) return undefined;
  await saveProject(project);
  return project;
}
