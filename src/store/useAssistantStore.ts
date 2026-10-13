"use client";

import { create } from "zustand";
import localforage from "localforage";
import { nanoid } from "nanoid";
import { accountScope } from "./useAuthStore";
import type { Attachment } from "@/lib/attachments";
import type { Phase, Source } from "@/components/chat/frames";

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
  /**
   * Trimmed copy of what the user attached, for re-rendering the thread — and
   * for sending it again when the student edits the message or asks for a new
   * answer. `text` is the content of a text file, capped; an image needs
   * nothing more than its data URL.
   */
  attachments?: StoredAttachment[];
  error?: string;
}

export interface StoredAttachment {
  id: string;
  kind: Attachment["kind"];
  name: string;
  dataUrl?: string;
  text?: string;
}

/** A text file's content is kept for resending, up to this many characters. */
const STORED_TEXT_CHARS = 40_000;

/**
 * Turns a stored attachment back into one that can be sent.
 *
 * Images come back whole from their data URL. A text file comes back with
 * whatever was kept of it; one stored before text was kept comes back as its
 * name only, which is the honest most that can be resent.
 */
export function restoreAttachment(a: StoredAttachment): Attachment {
  if (a.kind === "image" && a.dataUrl) {
    const comma = a.dataUrl.indexOf(",");
    const mimeType = a.dataUrl.slice(5, a.dataUrl.indexOf(";")) || "image/png";
    const base64 = comma === -1 ? "" : a.dataUrl.slice(comma + 1);
    return { id: a.id, kind: "image", name: a.name, size: Math.round((base64.length * 3) / 4), dataUrl: a.dataUrl, base64, mimeType };
  }
  return { id: a.id, kind: "text", name: a.name, size: a.text?.length ?? 0, text: a.text ?? "" };
}

/** What Panda is doing in a thread right now. Mirrors the server's progress frames. */
export interface ActivityState {
  phase: Phase;
  query?: string;
  count?: number;
  reason?: string;
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
  /** Kept at the top of the sidebar, whatever its age. */
  pinned?: boolean;
}

export interface ThreadSummary {
  id: string;
  title: string;
  updatedAt: number;
  pinned?: boolean;
}

interface AssistantState {
  threads: ThreadSummary[];
  activeThread: Thread | null;
  hydrated: boolean;
  /**
   * Threads with a request in flight, from the moment a message is sent until
   * its stream has closed. This is the one "busy" signal: the old screen read a
   * global `loading` that went false as soon as the stream OPENED, so pressing
   * Enter mid-reply started a second request on top of the first.
   */
  pending: Record<string, true>;
  /** What Panda is doing in each thread, while it is doing it. */
  activity: Record<string, ActivityState>;
  /**
   * Citations, by the message they belong to. In memory only: the stored
   * message shape stays what it was, and the cost is that sources are lost on
   * reload — the same trade the screen made when they lived in component state.
   */
  sources: Record<string, Source[]>;

  hydrate: () => Promise<void>;
  newThread: () => void;
  /** Resolves false when there is no such thread on this device. */
  openThread: (id: string) => Promise<boolean>;
  deleteThread: (id: string) => Promise<void>;
  renameThread: (id: string, title: string) => Promise<void>;
  pinThread: (id: string, pinned: boolean) => Promise<void>;

  addUserMessage: (content: string, attachments?: Attachment[]) => void;
  addAssistantMessage: (content: string) => void;
  /** Records a turn that failed before saying anything, in the thread that asked. */
  addErrorMessage: (error: string, threadId?: string) => void;
  /** Drops a message and everything after it from the open thread (edit, regenerate). */
  truncateFrom: (messageId: string) => void;

  /** Opens an empty assistant message to stream into. Returns its id. */
  startAssistantMessage: (threadId?: string) => string;
  /** Appends newly arrived text to a streaming message, wherever its thread now is. */
  appendToAssistantMessage: (id: string, chunk: string) => void;
  /** Marks the stream done and writes the finished thread to storage. */
  finishAssistantMessage: (id: string, error?: string) => void;

  /** Marks a thread busy and hands back the controller that can stop it. */
  beginRequest: (threadId: string) => AbortController;
  /** Clears the busy mark — only if `controller` is still the thread's current one. */
  endRequest: (threadId: string, controller: AbortController) => void;
  /** Stops whatever the thread is waiting on. The partial reply stays. */
  stopRequest: (threadId: string) => void;
  setActivity: (threadId: string, activity: ActivityState | null) => void;
  setSources: (messageId: string, items: Source[]) => void;
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

function summaryOf(thread: Thread): ThreadSummary {
  return { id: thread.id, title: thread.title, updatedAt: thread.updatedAt, pinned: thread.pinned || undefined };
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

// ---------------------------------------------------------------------------
// Replies that outlive the screen they started on
// ---------------------------------------------------------------------------
//
// Every write used to go to whichever thread was OPEN, so switching chats
// mid-reply poured the rest of the answer into the chat the student had just
// opened, and renaming one mid-reply swapped the live thread for a stale copy
// off disk. Now a streaming message remembers the thread it belongs to, and a
// thread that is still being written to is parked here when the student opens
// another one. The reply finishes where it started, is saved there, and is
// waiting — complete — when they come back.
//
// Module state rather than store state on purpose: nothing renders from these,
// and putting a Map in zustand would re-render the sidebar on every chunk.

/** Streaming message id → the thread it belongs to. */
const streamOwner = new Map<string, string>();
/** Threads with a live request that are not the one on screen. */
const background = new Map<string, Thread>();
/** The way to stop each thread's request, by thread id. */
const controllers = new Map<string, AbortController>();
/**
 * Bumped by every open, so a slow read that loses the race to a later click
 * does not land on screen after it. Clicking chat B then chat C quickly used
 * to be able to finish on B.
 */
let openSeq = 0;

export const useAssistantStore = create<AssistantState>((set, get) => {
  /** Writes a thread to disk and keeps the sidebar index in sync. */
  async function save(thread: Thread) {
    await persistThread(thread);
    const index = await readIndex();
    const next = [summaryOf(thread), ...index.filter((t) => t.id !== thread.id)]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_THREADS);
    await writeIndex(next);
    set({ threads: next });
  }

  /** Whether a thread still has something arriving, so leaving it must not drop it. */
  function isLive(thread: Thread) {
    return !!get().pending[thread.id] || thread.messages.some((m) => m.streaming);
  }

  /** Called before the open thread is replaced, so a live reply keeps going. */
  function parkActive() {
    const current = get().activeThread;
    if (current && isLive(current)) background.set(current.id, current);
  }

  /**
   * Applies `fn` to a thread wherever it currently lives — on screen or parked.
   * Returns the updated thread, or null when it is gone (deleted mid-reply).
   */
  function updateThread(threadId: string, fn: (thread: Thread) => Thread): Thread | null {
    const active = get().activeThread;
    if (active?.id === threadId) {
      const next = fn(active);
      set({ activeThread: next });
      return next;
    }
    const parked = background.get(threadId);
    if (parked) {
      const next = fn(parked);
      background.set(threadId, next);
      return next;
    }
    return null;
  }

  /**
   * Appends to a thread, creating the open one on the fly if needed.
   *
   * `persist: false` keeps the message in memory only. That exists for the
   * empty streaming placeholder, which is worth nothing on disk and actively
   * harmful there if the tab closes before the stream ends.
   */
  function append(message: AssistantMessage, persist = true, threadId?: string) {
    if (threadId && threadId !== get().activeThread?.id) {
      const next = updateThread(threadId, (t) => ({ ...t, updatedAt: Date.now(), messages: [...t.messages, message] }));
      if (next && persist) void save(next);
      return;
    }
    const current = get().activeThread ?? emptyThread();
    // Titled from the first thing the student says — but only a chat that
    // still has the placeholder name. Editing or retrying the first message
    // empties the thread for a moment, and that must not undo a rename.
    const isFirstUserTurn = message.role === "user" && current.messages.length === 0 && current.title === "New chat";
    const thread: Thread = {
      ...current,
      title: isFirstUserTurn ? titleFrom(message.content || message.attachments?.[0]?.name || "") : current.title,
      updatedAt: Date.now(),
      messages: [...current.messages, message],
    };
    set({ activeThread: thread });
    if (persist) void save(thread);
  }

  /** Changes a stored thread's metadata wherever it lives, then the index. */
  async function patchMeta(id: string, patch: Partial<Pick<Thread, "title" | "pinned">>) {
    // The live copy wins over the disk copy. Reading from disk here is what
    // used to swap a streaming thread for the version saved before the reply.
    const live = updateThread(id, (t) => ({ ...t, ...patch }));
    const stored = live ?? (await threadStore.getItem<Thread>(`thread:${id}`));
    if (!stored) return;
    const updated = live ?? { ...stored, ...patch };
    // A thread with no messages has never been saved and should not start
    // now just because it was renamed; the first message will save it.
    if (updated.messages.length > 0) await persistThread(updated);
    const index = (await readIndex()).map((t) => (t.id === id ? { ...t, ...patch, pinned: updated.pinned || undefined } : t));
    await writeIndex(index);
    set({ threads: index });
  }

  return {
    threads: [],
    activeThread: null,
    hydrated: false,
    pending: {},
    activity: {},
    sources: {},

    hydrate: async () => {
      const index = await readIndex();
      set({ threads: index.sort((a, b) => b.updatedAt - a.updatedAt), hydrated: true });
      if (!get().activeThread) set({ activeThread: emptyThread() });
    },

    newThread: () => {
      openSeq++;
      parkActive();
      set({ activeThread: emptyThread() });
    },

    openThread: async (id) => {
      const seq = ++openSeq;
      if (get().activeThread?.id === id) return true;
      const parked = background.get(id);
      if (parked) {
        parkActive();
        background.delete(id);
        set({ activeThread: parked });
        return true;
      }
      const thread = await threadStore.getItem<Thread>(`thread:${id}`);
      if (seq !== openSeq) return true;
      if (!thread) return false;
      parkActive();
      // Threads stored before the placeholder stopped being persisted can
      // still hold an empty `streaming: true` bubble from a tab that was
      // closed mid-answer. It is dropped on the way in, so the student never
      // sees a panda animating over nothing.
      set({ activeThread: { ...thread, messages: pruneAbandonedStreams(thread.messages) } });
      return true;
    },

    deleteThread: async (id) => {
      // A reply still being written into a deleted chat has nowhere to go;
      // stopping it saves the tokens and stops `finish` resurrecting the file.
      get().stopRequest(id);
      background.delete(id);
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
      await patchMeta(id, { title: clean });
    },

    pinThread: async (id, pinned) => {
      await patchMeta(id, { pinned: pinned || undefined });
    },

    addUserMessage: (content, attachments) =>
      append({
        id: nanoid(10),
        role: "user",
        content,
        createdAt: Date.now(),
        attachments: attachments?.map((a) => ({
          id: a.id,
          kind: a.kind,
          name: a.name,
          dataUrl: a.dataUrl,
          text: a.kind === "text" && a.text ? a.text.slice(0, STORED_TEXT_CHARS) : undefined,
        })),
      }),

    addAssistantMessage: (content) =>
      append({ id: nanoid(10), role: "assistant", content, createdAt: Date.now() }),

    addErrorMessage: (error, threadId) =>
      append({ id: nanoid(10), role: "assistant", content: "", createdAt: Date.now(), error }, true, threadId),

    truncateFrom: (messageId) => {
      const current = get().activeThread;
      if (!current) return;
      const at = current.messages.findIndex((m) => m.id === messageId);
      if (at === -1) return;
      const thread: Thread = { ...current, updatedAt: Date.now(), messages: current.messages.slice(0, at) };
      set({ activeThread: thread });
      if (thread.messages.length > 0) void save(thread);
    },

    startAssistantMessage: (threadId) => {
      const id = nanoid(10);
      const owner = threadId ?? get().activeThread?.id;
      // Deliberately NOT persisted: an empty placeholder is worth nothing on
      // disk, and if the tab closes mid-stream it is all that would be left —
      // stored forever as an empty message that still claims to be streaming.
      // The real text is written by `finishAssistantMessage`, which is the
      // first moment there is anything worth keeping.
      append({ id, role: "assistant", content: "", createdAt: Date.now(), streaming: true }, false, owner);
      const resolved = owner ?? get().activeThread?.id;
      if (resolved) streamOwner.set(id, resolved);
      return id;
    },

    // Chunks land many times a second, so this only touches in-memory state.
    // Persistence waits for finishAssistantMessage.
    appendToAssistantMessage: (id, chunk) => {
      const owner = streamOwner.get(id) ?? get().activeThread?.id;
      if (!owner) return;
      updateThread(owner, (thread) => ({
        ...thread,
        messages: thread.messages.map((m) => (m.id === id ? { ...m, content: m.content + chunk } : m)),
      }));
    },

    finishAssistantMessage: (id, error) => {
      const owner = streamOwner.get(id) ?? get().activeThread?.id;
      streamOwner.delete(id);
      if (!owner) return;
      const thread = updateThread(owner, (current) => ({
        ...current,
        updatedAt: Date.now(),
        messages: current.messages.map((m) =>
          m.id === id ? { ...m, streaming: false, error: error ?? m.error } : m,
        ),
      }));
      // Null means the thread was deleted while the reply was arriving, and
      // saving it now would bring it back from the dead.
      if (thread) void save(thread);
    },

    beginRequest: (threadId) => {
      controllers.get(threadId)?.abort();
      const controller = new AbortController();
      controllers.set(threadId, controller);
      set((s) => ({ pending: { ...s.pending, [threadId]: true } }));
      return controller;
    },

    endRequest: (threadId, controller) => {
      if (controllers.get(threadId) !== controller) return;
      controllers.delete(threadId);
      set((s) => {
        const pending = { ...s.pending };
        delete pending[threadId];
        const activity = { ...s.activity };
        delete activity[threadId];
        return { pending, activity };
      });
      // Finished while parked: the saved copy on disk is now the whole story,
      // so the parked one can go and the next open reads it fresh.
      const parked = background.get(threadId);
      if (parked && !parked.messages.some((m) => m.streaming)) background.delete(threadId);
    },

    stopRequest: (threadId) => {
      controllers.get(threadId)?.abort();
    },

    setActivity: (threadId, activity) =>
      set((s) => {
        const next = { ...s.activity };
        if (activity) next[threadId] = activity;
        else delete next[threadId];
        return { activity: next };
      }),

    setSources: (messageId, items) => set((s) => ({ sources: { ...s.sources, [messageId]: items } })),
  };
});
