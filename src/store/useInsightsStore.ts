"use client";

import { create } from "zustand";
import localforage from "localforage";
import { accountScope } from "./useAuthStore";
import { getSupabase } from "@/lib/supabase/browser";
import { insertSignals, type NewSignal } from "@/lib/db/signals";
import {
  buildAdaptiveAddendum,
  estimateEnglishLevel,
  summarizeStruggles,
  WINDOW_MS,
  type StruggleSignal,
  type StruggleSummary,
  type WritingSample,
} from "@/lib/insights";

// Where struggle signals live between the moment they happen and the moment
// they change how Panda teaches.
//
// Three decisions worth stating, because each one is a tradeoff:
//
// 1. Signals persist, writing samples do not. A signal is a topic id, a kind
//    and a timestamp — no message text, which is the privacy line the insights
//    engine draws structurally. `estimateEnglishLevel` also wants samples of
//    what the student wrote, and those are text by definition, so they are held
//    in memory for this tab only and never written to disk. The cost is that
//    the English estimate restarts each session and leans on button presses
//    until the student types a few things; the alternative is storing their
//    sentences, which we are not willing to do.
//
// 2. Per-account IndexedDB, same as threads and saves. Two students on one
//    school laptop must never see each other's signals, and the store name
//    carries the account id for exactly that reason.
//
// 3. The adaptation string is computed synchronously from state already in
//    memory. Nothing on the chat send path awaits storage — time-to-first-token
//    is the property this app is judged on, and summarising is arithmetic over
//    a few dozen small objects. Writes go the other way: fire-and-forget after
//    the signal is already in state, so a slow disk never delays a keystroke.
//
// 4. The browser is the source of truth; Supabase is a copy made for the
//    teacher. Capture writes locally and returns; a background push mirrors
//    class-attached signals into `struggle_signals` afterwards. That ordering
//    is the whole design: a student on school wifi that drops, or signed out,
//    or on a build with no Supabase configured at all, keeps working and keeps
//    being adapted to, because nothing on the chat path awaits or throws on
//    the network. The cost is that a teacher's view lags by up to one push and
//    misses a student who never reconnects -- the right way round, because the
//    student's session matters more than the dashboard's freshness.

const store = localforage.createInstance({
  name: "ai-code-studio",
  storeName: `insights${accountScope().replace(/[^a-zA-Z0-9]/g, "_")}`,
});

const SIGNALS_KEY = "__struggle_signals__";

/**
 * The ids already pushed to Supabase.
 *
 * Kept as its own record rather than a flag on the signal, because a signal is
 * a fact about the student and "we uploaded it" is a fact about this browser;
 * mixing them would put a sync detail inside the type the engine reads. It
 * also means a student who clears their local signals loses nothing on the
 * server, where deletion is their own separate decision.
 */
const SYNCED_KEY = "__synced_signal_ids__";

/**
 * A hard cap on top of the 14-day window. The window does the real pruning;
 * this is only insurance against a stuck button turning one row into megabytes.
 */
const MAX_SIGNALS = 1000;

/** Writing samples held for the estimate, newest kept. Memory only. */
const MAX_SAMPLES = 20;

/**
 * Quiet enough that a burst of button presses is one request, short enough
 * that a student who closes the tab after asking for a hint has usually been
 * pushed already. Nothing waits on it either way.
 */
const SYNC_DEBOUNCE_MS = 1500;

/** The columns are uuid foreign keys; a fixture id like "c-alg2" would be a
 *  constraint violation, so those rows simply stay local. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Which signals are worth sending, and why the general chat is not.
 *
 * A signal with no class is readable by no teacher, ever — that is the
 * migration's most important rule, not an accident of the current UI. So
 * uploading one would move a record of a student's private conversation with
 * Panda onto a server for exactly zero teacher benefit. It stays in their
 * browser, where it still does its real job: adapting how Panda explains
 * things to them. Only class-attached signals go, and only they come back.
 *
 * Returns null for anything unsendable, which is also the "keep it local" answer.
 */
function syncable(signal: StruggleSignal): NewSignal | null {
  const classId = signal.topic.classId;
  if (!classId || !UUID.test(classId)) return null;
  return {
    classId,
    // The topic id is the assignment id when the chat was about one, and
    // "class:<id>" when it was about the class in general. Only the first is a
    // real foreign key; the topic_key column carries either, unchanged, so the
    // engine groups server-side rows exactly as it groups local ones.
    assignmentId: UUID.test(signal.topic.id) ? signal.topic.id : null,
    topicKey: signal.topic.id,
    topicLabel: signal.topic.label,
    kind: signal.kind,
    action: signal.action,
    occurredAt: signal.at,
  };
}

/** Drop anything the engine would ignore anyway. Pruning on write keeps the
 *  stored row roughly the size of one fortnight of school. */
function prune(signals: StruggleSignal[], now: number): StruggleSignal[] {
  const from = now - WINDOW_MS;
  const kept = signals.filter((s) => s.at >= from);
  return kept.length > MAX_SIGNALS ? kept.slice(kept.length - MAX_SIGNALS) : kept;
}

interface InsightsState {
  signals: StruggleSignal[];
  /** Not persisted. See the note at the top of this file. */
  samples: WritingSample[];
  hydrated: boolean;

  hydrate: () => Promise<void>;
  /** Takes the value the capture helpers return, including their nulls. */
  record: (signal: StruggleSignal | null) => void;
  /** Something the student typed, for the English estimate only. */
  noteWriting: (text: string) => void;
  summary: (now?: number) => StruggleSummary;
  /**
   * Push anything class-attached that has not been pushed yet. Safe to call
   * whenever; it never throws and never blocks anything a student is doing.
   */
  sync: () => Promise<void>;
  /** "" when the evidence is too thin to say anything honest. */
  adaptation: () => string;
}

export const useInsightsStore = create<InsightsState>((set, get) => {
  // Memoised on the exact inputs plus a coarse clock. Summarising is cheap, but
  // it runs on every send and the answer only changes when a signal lands, so
  // recomputing it per keystroke would be work for nothing.
  let cache: { signals: StruggleSignal[]; samples: WritingSample[]; bucket: number; value: StruggleSummary } | null =
    null;

  const persist = (signals: StruggleSignal[]) => {
    void store.setItem(SIGNALS_KEY, signals).catch(() => {
      // Private mode, or storage full. Signals stay in memory for this session
      // and the chat is unaffected — losing them is better than throwing.
    });
  };

  // Sync bookkeeping. Module-local rather than store state because no
  // component renders it, and putting it in state would re-render the chat
  // every time a background push finished.
  let synced = new Set<string>();
  let pushing = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const persistSynced = () => {
    void store.setItem(SYNCED_KEY, [...synced]).catch(() => {
      // Same tradeoff as above, with one extra consequence worth naming: if
      // this never lands, a later session can re-push signals it already sent
      // and the teacher sees a topic counted twice. Duplicated evidence is bad;
      // a student's chat hanging on a storage write would be worse.
    });
  };

  const push = async (): Promise<void> => {
    if (pushing) return;
    pushing = true;
    try {
      const pending = get()
        .signals.filter((s) => !synced.has(s.id))
        .flatMap((s) => {
          const row = syncable(s);
          return row ? [{ id: s.id, row }] : [];
        });
      if (pending.length === 0) return;

      // Both of these are ordinary states, not failures: a deployment with no
      // Supabase, and a student who never signed in. Either way the signals
      // stay local and keep working.
      const supabase = await getSupabase();
      if (!supabase) return;
      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id;
      if (!userId) return;

      // One insert, so a failure leaves nothing marked and the next attempt
      // retries the whole batch. The row-level security policy compares
      // student_id to auth.uid(), which is why the id comes from the session
      // rather than from the local account scope.
      await insertSignals(supabase, userId, pending.map((p) => p.row));
      for (const p of pending) synced.add(p.id);
      persistSynced();
    } catch {
      // Offline, denied, expired session, project paused. Nothing is marked
      // synced, so the next signal or the next page load tries again. Capture
      // must never fail because of the network, so this is swallowed here
      // rather than allowed anywhere near the chat path.
    } finally {
      pushing = false;
    }
  };

  /** Coalesce a burst of presses into one request. */
  const schedulePush = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void push();
    }, SYNC_DEBOUNCE_MS);
  };

  return {
    signals: [],
    samples: [],
    hydrated: false,

    hydrate: async () => {
      if (get().hydrated) return;
      try {
        const [stored, storedSynced] = await Promise.all([
          store.getItem<StruggleSignal[]>(SIGNALS_KEY),
          store.getItem<string[]>(SYNCED_KEY),
        ]);
        const signals = prune(Array.isArray(stored) ? stored : [], Date.now());
        // Ids for signals that have aged out of the window are dead weight;
        // they can never be re-pushed because they are no longer here to push.
        const live = new Set(signals.map((s) => s.id));
        synced = new Set((Array.isArray(storedSynced) ? storedSynced : []).filter((id) => live.has(id)));
        set({ signals, hydrated: true });
      } catch {
        set({ signals: [], hydrated: true });
      }
      // A reconnect catches up on everything captured while offline. Not
      // awaited: hydration gates the chat surfaces, and the network must not.
      schedulePush();
    },

    record: (signal) => {
      if (!signal) return;
      const signals = prune([...get().signals, signal], Date.now());
      set({ signals });
      persist(signals);
      // Local first, then the copy. Deliberately not awaited and deliberately
      // after the state update, so a dead network cannot delay or break the
      // press that produced this signal.
      schedulePush();
    },

    noteWriting: (text) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const samples = [...get().samples, { text: trimmed, at: Date.now() }].slice(-MAX_SAMPLES);
      set({ samples });
    },

    summary: (now = Date.now()) => {
      const { signals, samples } = get();
      // A minute is finer than any of the engine's thresholds move, so it is a
      // safe bucket to treat as "the same now".
      const bucket = Math.floor(now / 60_000);
      if (cache && cache.signals === signals && cache.samples === samples && cache.bucket === bucket) {
        return cache.value;
      }
      const english = estimateEnglishLevel(signals, samples);
      // The student id is the account scope, which is what namespaces their
      // storage. Server-side rows are keyed by auth.uid() instead; the two are
      // only ever compared inside one browser, so the local label is fine here.
      const value = summarizeStruggles(accountScope() || "local", signals, english, now);
      cache = { signals, samples, bucket, value };
      return value;
    },

    adaptation: () => buildAdaptiveAddendum(get().summary()),

    sync: push,
  };
});
