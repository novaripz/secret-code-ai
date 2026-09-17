"use client";

import { create } from "zustand";
import localforage from "localforage";
import { nanoid } from "nanoid";
import { accountScope } from "./useAuthStore";
import type { Attachment } from "@/lib/attachments";

// The main chat: threads that live outside any single project, so the
// conversation (and everything the AI remembers from it) follows the user
// across the whole app.

// One thread store per account, so a shared browser keeps conversations
// apart. Signed out uses the original store, so existing chats stay put.
const threadStore = localforage.createInstance({
  name: "ai-code-studio",
  storeName: `threads${accountScope().replace(/[^a-zA-Z0-9]/g, "_")}`,
});

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

/**
 * Whether this message's own text should be drawn.
 *
 * This used to be `m.error ? <box> : m.content ? <text> : null` inline in the
 * chat, which meant an error flag HID the text. That is exactly backwards for
 * this app: the provider chain propagates a mid-stream failure instead of
 * retrying it (see `src/lib/ai/chain.ts` — once words have reached the student
 * they are never replayed), so "three good paragraphs and then an error" is a
 * normal ending, not an exotic one. The student was reading those paragraphs;
 * replacing them with a red box deletes the answer they were halfway through,
 * permanently, because the partial text is persisted with the flag.
 *
 * So text is drawn whenever there is text, error or not. The error becomes a
 * notice UNDER the prose (see `isCutShort`) rather than a replacement for it.
 */
export function showsText(m: Pick<AssistantMessage, "content">): boolean {
  return m.content.length > 0;
}

/**
 * A reply that started, said something real, and then broke.
 *
 * Distinct from a turn that failed before saying anything (no content, only an
 * error): that one has nothing to keep and is still shown as a plain error box.
 */
export function isCutShort(m: Pick<AssistantMessage, "content" | "error">): boolean {
  return !!m.error && m.content.length > 0;
}

/**
 * What Panda is allowed to be reminded it said.
 *
 * The old filter was `m.content && !m.error`, which dropped partial answers
 * from history entirely. That is the worst of the options: the student can see
 * three paragraphs on screen that Panda has no memory of writing, so the next
 * turn either repeats them verbatim or contradicts them. Keeping the partial
 * text is honest — those words were really sent to the student — and it is what
 * lets "carry on from where you stopped" mean anything at all.
 *
 * Messages with no content are still dropped, which covers every
 * failed-before-it-spoke turn, because an empty assistant turn in history tells
 * the model nothing and invites it to imitate the emptiness.
 */
export function usableAsHistory(messages: AssistantMessage[]): AssistantMessage[] {
  return messages.filter(showsText);
}

/**
 * A streaming placeholder whose stream will never come back.
 *
 * `startAssistantMessage` opens an empty bubble to stream into. If the tab is
 * closed mid-stream, an empty `streaming: true` message with no error is all
 * that is left, and on reopen it renders as an avatar row with nothing beside
 * it and a panda that animates forever waiting for a request that died with
 * the old page.
 */
export function isAbandonedStream(m: AssistantMessage): boolean {
  return m.streaming === true && m.content.length === 0 && !m.error;
}

/**
 * Drops abandoned placeholders from a thread read back off disk.
 *
 * This is the read-time half of the fix; the write-time half is that
 * `startAssistantMessage` no longer persists the placeholder at all. Both are
 * needed and neither is redundant: not writing it fixes every thread from now
 * on, and pruning on read fixes the threads real students already have stored,
 * which no amount of care at write time can reach. Pruning alone was rejected
 * because it leaves the store knowingly writing a record it plans to throw
 * away, and not writing alone was rejected because it abandons existing users.
 */
export function pruneAbandonedStreams(messages: AssistantMessage[]): AssistantMessage[] {
  return messages.filter((m) => !isAbandonedStream(m));
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

  /**
   * Appends to the active thread, creating one on the fly if needed.
   *
   * `persist: false` keeps the message in memory only. That exists for the
   * empty streaming placeholder, which is worth nothing on disk and actively
   * harmful there if the tab closes before the stream ends.
   */
  function append(message: AssistantMessage, persist = true) {
    const current = get().activeThread ?? emptyThread();
    const isFirstUserTurn = message.role === "user" && current.messages.length === 0;
    const thread: Thread = {
      ...current,
      title: isFirstUserTurn ? titleFrom(message.content) : current.title,
      updatedAt: Date.now(),
      messages: [...current.messages, message],
    };
    set({ activeThread: thread });
    if (persist) void save(thread);
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
      // Threads stored before the placeholder stopped being persisted can
      // still hold an empty `streaming: true` bubble from a tab that was
      // closed mid-answer. It is dropped on the way in, so the student never
      // sees a panda animating over nothing.
      if (thread) set({ activeThread: { ...thread, messages: pruneAbandonedStreams(thread.messages) } });
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
      // Deliberately NOT persisted: an empty placeholder is worth nothing on
      // disk, and if the tab closes mid-stream it is all that would be left —
      // stored forever as an empty message that still claims to be streaming.
      // The real text is written by `finishAssistantMessage`, which is the
      // first moment there is anything worth keeping.
      append({ id, role: "assistant", content: "", createdAt: Date.now(), streaming: true }, false);
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
