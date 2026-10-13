"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { create } from "zustand";
import { stripRemembered } from "./remember";

// Listening and speaking, with nothing but what the browser already has.
//
// Both are free, need no account and no server, and matter most to exactly the
// students this app is for: hearing an explanation read aloud while reading it
// is how a lot of English learners follow a long answer, and saying a question
// is easier than spelling it for a student who reads better than they write.
//
// Both are feature-detected and their buttons simply do not render where the
// browser cannot do them (speech recognition is Chrome, Edge and Safari only;
// Firefox has none). A button that exists and then fails is worse than none.

// ---------------------------------------------------------------------------
// Support
// ---------------------------------------------------------------------------

interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

const noop = () => () => {};

/** Whether this browser can read text aloud. False during the server render. */
export function useCanSpeak(): boolean {
  return useSyncExternalStore(noop, () => "speechSynthesis" in window, () => false);
}

/** Whether this browser can turn speech into text. False during the server render. */
export function useCanListen(): boolean {
  return useSyncExternalStore(noop, () => recognitionCtor() !== undefined, () => false);
}

// ---------------------------------------------------------------------------
// Read aloud
// ---------------------------------------------------------------------------

/**
 * A reply as it should sound.
 *
 * Markdown punctuation is read out literally by every engine ("asterisk
 * asterisk"), code is unspeakable, and TeX is worse — so code becomes a short
 * spoken note, math keeps only its plain characters, and the markers go.
 */
export function speakableText(markdown: string, codeNote: string): string {
  return stripRemembered(markdown)
    .replace(/```[\s\S]*?(```|$)/g, ` ${codeNote}. `)
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\$\$([\s\S]+?)\$\$/g, " $1 ")
    .replace(/\$([^$\n]+)\$/g, "$1")
    .replace(/\\[a-zA-Z]+/g, " ")
    .replace(/[{}^_]/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*\|?[\s:|-]+\|[\s:|-]*$/gm, "")
    .replace(/\|/g, ", ")
    .replace(/[*_~]{1,3}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Splits text into pieces an engine will finish.
 *
 * Chrome's voices stop dead after roughly fifteen seconds of a single
 * utterance, so a long answer is queued as sentence-sized pieces instead.
 */
function chunks(text: string, max = 220): string[] {
  const sentences = text.match(/[^.!?。！？]+[.!?。！？]*\s*/g) ?? [text];
  const out: string[] = [];
  let current = "";
  for (const s of sentences) {
    if ((current + s).length > max && current) {
      out.push(current.trim());
      current = "";
    }
    if (s.length > max) {
      for (let i = 0; i < s.length; i += max) out.push(s.slice(i, i + max).trim());
    } else {
      current += s;
    }
  }
  if (current.trim()) out.push(current.trim());
  return out.filter(Boolean);
}

/** Which message is being read, app-wide, so only one ever talks at once. */
const useSpeaking = create<{ id: string | null; set: (id: string | null) => void }>((set) => ({
  id: null,
  set: (id) => set({ id }),
}));

export function useReadAloud() {
  const speakingId = useSpeaking((s) => s.id);
  const setSpeaking = useSpeaking((s) => s.set);

  const stop = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeaking(null);
  }, [setSpeaking]);

  const speak = useCallback(
    (id: string, text: string, lang: string) => {
      if (!("speechSynthesis" in window)) return;
      const synth = window.speechSynthesis;
      synth.cancel();
      const pieces = chunks(text);
      if (pieces.length === 0) return;
      // A voice that actually speaks the reply's language, when the device
      // has one. Without this some engines read Spanish with an English voice.
      const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith(lang.toLowerCase()));
      setSpeaking(id);
      pieces.forEach((piece, i) => {
        const u = new SpeechSynthesisUtterance(piece);
        u.lang = lang;
        if (voice) u.voice = voice;
        u.rate = 1;
        if (i === pieces.length - 1) {
          u.onend = () => {
            if (useSpeaking.getState().id === id) setSpeaking(null);
          };
        }
        u.onerror = () => {
          if (useSpeaking.getState().id === id) setSpeaking(null);
        };
        synth.speak(u);
      });
    },
    [setSpeaking],
  );

  return { speakingId, speak, stop };
}

/** Stops any reading when the chat goes away, so a voice does not follow the student to Settings. */
export function useStopSpeakingOnUnmount() {
  useEffect(
    () => () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
      useSpeaking.getState().set(null);
    },
    [],
  );
}

// ---------------------------------------------------------------------------
// Voice typing
// ---------------------------------------------------------------------------

export type DictationError = "blocked" | "network" | "failed";

/**
 * Speech to text into the composer.
 *
 * One utterance per press rather than continuous listening: continuous mode on
 * Android Chrome repeats itself and never ends, and a mic that keeps listening
 * after the student stopped talking is a privacy surprise in a classroom. What
 * is heard is appended after anything already typed, live, so the student can
 * see it being understood.
 */
export function useDictation({
  lang,
  value,
  onChange,
}: {
  lang: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<DictationError | null>(null);
  const recRef = useRef<Recognition | null>(null);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    valueRef.current = value;
    onChangeRef.current = onChange;
  });

  useEffect(() => () => recRef.current?.abort(), []);

  const stop = useCallback(() => {
    recRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    setError(null);
    const rec = new Ctor();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = false;
    const base = valueRef.current.trimEnd();
    const lead = base ? `${base} ` : "";
    rec.onresult = (e) => {
      let heard = "";
      for (let i = 0; i < e.results.length; i++) heard += e.results[i][0].transcript;
      onChangeRef.current(lead + heard.trimStart());
    };
    rec.onerror = (e) => {
      // Silence and a deliberate stop are not errors worth a sentence.
      if (e.error === "no-speech" || e.error === "aborted") return;
      setError(e.error === "not-allowed" || e.error === "service-not-allowed" ? "blocked" : e.error === "network" ? "network" : "failed");
    };
    rec.onend = () => {
      setListening(false);
      if (recRef.current === rec) recRef.current = null;
    };
    recRef.current?.abort();
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setError("failed");
    }
  }, [lang]);

  return { listening, error, start, stop, clearError: () => setError(null) };
}
