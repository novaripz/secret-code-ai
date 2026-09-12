"use client";

import { create } from "zustand";
import localforage from "localforage";
import { accountScope } from "./useAuthStore";
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

const store = localforage.createInstance({
  name: "ai-code-studio",
  storeName: `insights${accountScope().replace(/[^a-zA-Z0-9]/g, "_")}`,
});

const SIGNALS_KEY = "__struggle_signals__";

/**
 * A hard cap on top of the 14-day window. The window does the real pruning;
 * this is only insurance against a stuck button turning one row into megabytes.
 */
const MAX_SIGNALS = 1000;

/** Writing samples held for the estimate, newest kept. Memory only. */
const MAX_SAMPLES = 20;

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

  return {
    signals: [],
    samples: [],
    hydrated: false,

    hydrate: async () => {
      if (get().hydrated) return;
      try {
        const stored = await store.getItem<StruggleSignal[]>(SIGNALS_KEY);
        const signals = prune(Array.isArray(stored) ? stored : [], Date.now());
        set({ signals, hydrated: true });
      } catch {
        set({ signals: [], hydrated: true });
      }
    },

    record: (signal) => {
      if (!signal) return;
      const signals = prune([...get().signals, signal], Date.now());
      set({ signals });
      persist(signals);
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
      // storage. It never leaves the browser today.
      const value = summarizeStruggles(accountScope() || "local", signals, english, now);
      cache = { signals, samples, bucket, value };
      return value;
    },

    adaptation: () => buildAdaptiveAddendum(get().summary()),
  };
});
