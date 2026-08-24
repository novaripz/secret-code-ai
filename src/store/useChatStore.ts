"use client";

import { create } from "zustand";
import localforage from "localforage";
import { nanoid } from "nanoid";
import type { ChatMessage, FileOperation } from "@/types";

const chatStore = localforage.createInstance({ name: "ai-code-studio", storeName: "chats" });

interface ChatState {
  projectId: string | null;
  messages: ChatMessage[];
  loading: boolean;
  loadForProject: (projectId: string) => Promise<void>;
  addUserMessage: (content: string) => ChatMessage;
  addAssistantMessage: (content: string, operations?: FileOperation[]) => ChatMessage;
  addErrorMessage: (error: string) => ChatMessage;
  markApplied: (id: string) => void;
  markRejected: (id: string) => void;
  setLoading: (loading: boolean) => void;
}

async function persist(projectId: string, messages: ChatMessage[]) {
  await chatStore.setItem(`chat:${projectId}`, messages);
}

export const useChatStore = create<ChatState>((set) => ({
  projectId: null,
  messages: [],
  loading: false,

  loadForProject: async (projectId) => {
    const messages = (await chatStore.getItem<ChatMessage[]>(`chat:${projectId}`)) ?? [];
    set({ projectId, messages });
  },

  addUserMessage: (content) => {
    const msg: ChatMessage = { id: nanoid(10), role: "user", content, createdAt: Date.now() };
    set((s) => {
      const messages = [...s.messages, msg];
      if (s.projectId) persist(s.projectId, messages);
      return { messages };
    });
    return msg;
  },

  addAssistantMessage: (content, operations) => {
    const msg: ChatMessage = {
      id: nanoid(10),
      role: "assistant",
      content,
      createdAt: Date.now(),
      proposedOperations: operations && operations.length > 0 ? operations : undefined,
      applied: !operations || operations.length === 0,
    };
    set((s) => {
      const messages = [...s.messages, msg];
      if (s.projectId) persist(s.projectId, messages);
      return { messages };
    });
    return msg;
  },

  addErrorMessage: (error) => {
    const msg: ChatMessage = { id: nanoid(10), role: "assistant", content: "", createdAt: Date.now(), error };
    set((s) => {
      const messages = [...s.messages, msg];
      if (s.projectId) persist(s.projectId, messages);
      return { messages };
    });
    return msg;
  },

  markApplied: (id) =>
    set((s) => {
      const messages = s.messages.map((m) => (m.id === id ? { ...m, applied: true } : m));
      if (s.projectId) persist(s.projectId, messages);
      return { messages };
    }),

  markRejected: (id) =>
    set((s) => {
      const messages = s.messages.map((m) => (m.id === id ? { ...m, rejected: true } : m));
      if (s.projectId) persist(s.projectId, messages);
      return { messages };
    }),

  setLoading: (loading) => set({ loading }),
}));
