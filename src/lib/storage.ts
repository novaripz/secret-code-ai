"use client";

import localforage from "localforage";
import type { Project } from "@/types";

// Client-side persistence via IndexedDB (through localforage). Keeps the app
// fully usable with zero backend config. Firebase sync can be layered on top
// later (see lib/firebase.ts) without changing this interface.

const store = localforage.createInstance({
  name: "ai-code-studio",
  storeName: "projects",
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
