"use client";

import { create } from "zustand";
import localforage from "localforage";
import { nanoid } from "nanoid";
import type { ChatMessage, FileOperation } from "@/types";

const chatStore = localforage.createInstance({ name: "ai-code-studio", storeName: "chats" });

// EVERY WRITE NAMES ITS PROJECT
//
// The build agent's turn takes anything from five seconds to a minute, and a
// student can open a different project while it runs. Every write used to go
// to "whichever project is open now", so project A's reply — and its Apply
// button, holding A's files — landed in project B's chat, where applying it
// would have written A's code into B.
//
// So each write says which project it belongs to, and a write for a project
// that is no longer open is dropped rather than redirected. The agent panel
// also aborts the request when the project changes; this is the second lock on
// the same door, for whatever was already in flight.
//
// `loading` is per project for the same reason: a turn running in A must not
// show B's composer as busy, and must not stop B from sending.

interface ChatState {
  projectId: string | null;
  messages: ChatMessage[];
  /** The project a turn is running for, if any. */
  loadingFor: string | null;
  loadForProject: (projectId: string) => Promise<void>;
  addUserMessage: (projectId: string, content: string) => ChatMessage | null;
  addAssistantMessage: (projectId: string, content: string, operations?: FileOperation[]) => ChatMessage | null;
  addErrorMessage: (projectId: string, error: string) => ChatMessage | null;
  markApplied: (projectId: string, id: string) => void;
  markRejected: (projectId: string, id: string) => void;
  setLoading: (projectId: string, loading: boolean) => void;
}

async function persist(projectId: string, messages: ChatMessage[]) {
  await chatStore.setItem(`chat:${projectId}`, messages);
}

/** Removes a project's chat for good. Called when the project itself is deleted. */
export async function forgetChat(projectId: string): Promise<void> {
  await chatStore.removeItem(`chat:${projectId}`);
}

/** Is a turn running for this project? */
export function isLoadingFor(state: Pick<ChatState, "loadingFor">, projectId: string | null | undefined): boolean {
  return !!projectId && state.loadingFor === projectId;
}

export const useChatStore = create<ChatState>((set, get) => {
  /** Appends to the open project's chat, or does nothing if that project has been left. */
  function append(projectId: string, msg: ChatMessage): ChatMessage | null {
    if (get().projectId !== projectId) return null;
    set((s) => {
      const messages = [...s.messages, msg];
      void persist(projectId, messages);
      return { messages };
    });
    return msg;
  }

  function update(projectId: string, id: string, patch: Partial<ChatMessage>) {
    if (get().projectId !== projectId) return;
    set((s) => {
      const messages = s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m));
      void persist(projectId, messages);
      return { messages };
    });
  }

  return {
    projectId: null,
    messages: [],
    loadingFor: null,

    loadForProject: async (projectId) => {
      // The id is claimed before the read, and the read is only accepted if
      // it is still the one asked for: two quick project switches used to let
      // the slower read land last and show the first project's chat.
      set({ projectId, messages: [] });
      const messages = (await chatStore.getItem<ChatMessage[]>(`chat:${projectId}`)) ?? [];
      if (get().projectId !== projectId) return;
      set({ messages });
    },

    addUserMessage: (projectId, content) =>
      append(projectId, { id: nanoid(10), role: "user", content, createdAt: Date.now() }),

    addAssistantMessage: (projectId, content, operations) =>
      append(projectId, {
        id: nanoid(10),
        role: "assistant",
        content,
        createdAt: Date.now(),
        proposedOperations: operations && operations.length > 0 ? operations : undefined,
        applied: !operations || operations.length === 0,
      }),

    addErrorMessage: (projectId, error) =>
      append(projectId, { id: nanoid(10), role: "assistant", content: "", createdAt: Date.now(), error }),

    markApplied: (projectId, id) => update(projectId, id, { applied: true }),

    markRejected: (projectId, id) => update(projectId, id, { rejected: true }),

    setLoading: (projectId, loading) =>
      set((s) => {
        if (loading) return { loadingFor: projectId };
        // Only the project that started the turn may end it.
        return s.loadingFor === projectId ? { loadingFor: null } : s;
      }),
  };
});
