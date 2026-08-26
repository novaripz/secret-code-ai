"use client";

import { create } from "zustand";
import localforage from "localforage";
import { nanoid } from "nanoid";
import type { Attachment } from "@/lib/attachments";

// The main chat: threads that live outside any single project, so the
// conversation (and everything the AI remembers from it) follows the user
// across the whole app.

const threadStore = localforage.createInstance({ name: "ai-code-studio", storeName: "threads" });

const INDEX_KEY = "__thread_index__";
const MAX_THREADS = 100;

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  /** True while text is still arriving, so the UI knows to animate new pieces. */
  streaming?: boolean;
  /** Trimmed copy of what the user attached, for re-rendering the thread. */
  attachments?: { id: string; kind: Attachment["kind"]; name: string; dataUrl?: string }[];
  error?: string;
}

export interface Thread {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: AssistantMessage[];
}

export interface ThreadSummary {
  id: string;
  title: string;
  updatedAt: number;
}

interface AssistantState {
  threads: ThreadSummary[];
  activeThread: Thread | null;
  loading: boolean;
  hydrated: boolean;

  hydrate: () => Promise<void>;
  newThread: () => void;
  openThread: (id: string) => Promise<void>;
  deleteThread: (id: string) => Promise<void>;
  renameThread: (id: string, title: string) => Promise<void>;

  addUserMessage: (content: string, attachments?: Attachment[]) => void;
  addAssistantMessage: (content: string) => void;
  addErrorMessage: (error: string) => void;
  setLoading: (loading: boolean) => void;

  /** Opens an empty assistant message to stream into. Returns its id. */
  startAssistantMessage: () => string;
  /** Appends newly arrived text to a streaming message. */
  appendToAssistantMessage: (id: string, chunk: string) => void;
  /** Marks the stream done and writes the finished thread to storage. */
  finishAssistantMessage: (id: string, error?: string) => void;
}

function titleFrom(text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "New chat";
  return clean.length > 42 ? `${clean.slice(0, 42)}…` : clean;
}

function emptyThread(): Thread {
  const now = Date.now();
  return { id: nanoid(10), title: "New chat", createdAt: now, updatedAt: now, messages: [] };
}

async function persistThread(thread: Thread) {
  await threadStore.setItem(`thread:${thread.id}`, thread);
}

async function readIndex(): Promise<ThreadSummary[]> {
  return (await threadStore.getItem<ThreadSummary[]>(INDEX_KEY)) ?? [];
}

async function writeIndex(index: ThreadSummary[]) {
  await threadStore.setItem(INDEX_KEY, index);
}

export const useAssistantStore = create<AssistantState>((set, get) => {
  /** Writes the active thread to disk and keeps the sidebar index in sync. */
  async function save(thread: Thread) {
    await persistThread(thread);
    const index = await readIndex();
    const summary: ThreadSummary = { id: thread.id, title: thread.title, updatedAt: thread.updatedAt };
    const next = [summary, ...index.filter((t) => t.id !== thread.id)]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_THREADS);
    await writeIndex(next);
    set({ threads: next });
  }

  /** Appends to the active thread, creating one on the fly if needed. */
  function append(message: AssistantMessage) {
    const current = get().activeThread ?? emptyThread();
    const isFirstUserTurn = message.role === "user" && current.messages.length === 0;
    const thread: Thread = {
      ...current,
      title: isFirstUserTurn ? titleFrom(message.content) : current.title,
      updatedAt: Date.now(),
      messages: [...current.messages, message],
    };
    set({ activeThread: thread });
    void save(thread);
  }

  return {
    threads: [],
    activeThread: null,
    loading: false,
    hydrated: false,

    hydrate: async () => {
      const index = await readIndex();
      set({ threads: index.sort((a, b) => b.updatedAt - a.updatedAt), hydrated: true });
      if (!get().activeThread) set({ activeThread: emptyThread() });
    },

    newThread: () => set({ activeThread: emptyThread() }),

    openThread: async (id) => {
      const thread = await threadStore.getItem<Thread>(`thread:${id}`);
      if (thread) set({ activeThread: thread });
    },

    deleteThread: async (id) => {
      await threadStore.removeItem(`thread:${id}`);
      const index = (await readIndex()).filter((t) => t.id !== id);
      await writeIndex(index);
      set((s) => ({
        threads: index,
        activeThread: s.activeThread?.id === id ? emptyThread() : s.activeThread,
      }));
    },

    renameThread: async (id, title) => {
      const clean = title.trim();
      if (!clean) return;
      const thread = await threadStore.getItem<Thread>(`thread:${id}`);
      if (!thread) return;
      const updated = { ...thread, title: clean };
      await persistThread(updated);
      const index = (await readIndex()).map((t) => (t.id === id ? { ...t, title: clean } : t));
      await writeIndex(index);
      set((s) => ({ threads: index, activeThread: s.activeThread?.id === id ? updated : s.activeThread }));
    },

    addUserMessage: (content, attachments) =>
      append({
        id: nanoid(10),
        role: "user",
        content,
        createdAt: Date.now(),
        attachments: attachments?.map((a) => ({ id: a.id, kind: a.kind, name: a.name, dataUrl: a.dataUrl })),
      }),

    addAssistantMessage: (content) =>
      append({ id: nanoid(10), role: "assistant", content, createdAt: Date.now() }),

    addErrorMessage: (error) =>
      append({ id: nanoid(10), role: "assistant", content: "", createdAt: Date.now(), error }),

    startAssistantMessage: () => {
      const id = nanoid(10);
      append({ id, role: "assistant", content: "", createdAt: Date.now(), streaming: true });
      return id;
    },

    // Chunks land many times a second, so this only touches in-memory state.
    // Persistence waits for finishAssistantMessage.
    appendToAssistantMessage: (id, chunk) => {
      const thread = get().activeThread;
      if (!thread) return;
      set({
        activeThread: {
          ...thread,
          messages: thread.messages.map((m) =>
            m.id === id ? { ...m, content: m.content + chunk } : m,
          ),
        },
      });
    },

    finishAssistantMessage: (id, error) => {
      const current = get().activeThread;
      if (!current) return;
      const thread: Thread = {
        ...current,
        updatedAt: Date.now(),
        messages: current.messages.map((m) =>
          m.id === id ? { ...m, streaming: false, error: error ?? m.error } : m,
        ),
      };
      set({ activeThread: thread });
      void save(thread);
    },

    setLoading: (loading) => set({ loading }),
  };
});
