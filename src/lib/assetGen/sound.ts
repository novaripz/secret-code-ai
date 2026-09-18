// Making a real sound file out of arithmetic.
//
// Panda cannot write an MP3. It emits text, and audio is bytes, so "add a click
// sound" has always ended at "find a sound and drop it in" — which for a
// student in a lesson means it does not happen.
//
// It does not need a sound library or an API to fix that. A click is a short
// burst of a waveform under a falling envelope, and that is a formula. So the
// model describes the sound it wants and this turns the description into PCM
// samples and wraps them in a WAV header. The result is a genuine audio file in
// the project: it plays, it exports, it survives a zip round trip, it costs
// nothing, it works on a school network that blocks everything, and it is the
// same on every machine because there is no randomness in it that is not seeded.
//
// WAV rather than MP3 deliberately. MP3 needs an encoder — a large dependency,
// and patent-adjacent history nobody needs — while WAV is a 44-byte header in
// front of the samples, which is why this file can be read in one sitting. The
// cost is size, bounded below by a low sample rate and a short maximum length:
// a click is about 2KB, which is smaller than the PNG of a button.

/** Mono, and low enough that a one-second sound is a few KB. Plenty for effects. */
const SAMPLE_RATE = 22_050;

/** Long enough for a fanfare, short enough that nobody fills a project with one file. */
export const MAX_SOUND_SECONDS = 5;

export type Waveform = "sine" | "square" | "saw" | "triangle" | "noise";

export interface SoundSpec {
  waveform?: Waveform;
  /** Hz at the start of the sound. */
  freq?: number;
  /** Hz at the end, for a slide. Defaults to `freq`, meaning a steady tone. */
  freqEnd?: number;
  seconds?: number;
  /** 0–1. The envelope's peak, before the decay curve. */
  volume?: number;
  /** Seconds spent rising to full volume. A click wants this at zero. */
  attack?: number;
  /** How sharply it falls away. Higher is snappier. */
  decay?: number;
}

/**
 * Presets, because "coin" is what a student asks for and a set of six numbers
 * is not. Each one is an ordinary SoundSpec, so a preset can be named and then
 * partially overridden rather than being a closed box.
 */
export const SOUND_PRESETS: Record<string, SoundSpec> = {
  click: { waveform: "square", freq: 900, freqEnd: 380, seconds: 0.07, decay: 40, volume: 0.35 },
  beep: { waveform: "sine", freq: 880, seconds: 0.14, decay: 14, volume: 0.4 },
  coin: { waveform: "square", freq: 988, freqEnd: 1319, seconds: 0.28, decay: 9, volume: 0.35 },
  jump: { waveform: "square", freq: 320, freqEnd: 760, seconds: 0.18, decay: 12, volume: 0.35 },
  hit: { waveform: "noise", freq: 200, seconds: 0.16, decay: 26, volume: 0.45 },
  powerup: { waveform: "triangle", freq: 440, freqEnd: 1320, seconds: 0.45, decay: 5, volume: 0.35 },
  explosion: { waveform: "noise", freq: 120, seconds: 0.7, decay: 6, volume: 0.5 },
  blip: { waveform: "triangle", freq: 1200, seconds: 0.05, decay: 45, volume: 0.3 },
  error: { waveform: "saw", freq: 300, freqEnd: 140, seconds: 0.35, decay: 8, volume: 0.35 },
  success: { waveform: "sine", freq: 660, freqEnd: 1320, seconds: 0.4, decay: 6, volume: 0.35 },
};

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(Math.max(value, min), max) : min;
}

/**
 * Deterministic noise.
 *
 * Math.random() would make the same spec produce a different file every time,
 * which turns a re-run into a spurious diff in the Changes panel and makes the
 * checks below impossible to write. This is a plain LCG seeded from the spec,
 * so "hit" is always byte-for-byte the same "hit".
 */
function seededNoise(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state / 0xffffffff) * 2 - 1;
  };
}

function sample(waveform: Waveform, phase: number, noise: () => number): number {
  switch (waveform) {
    case "square":
      return phase % 1 < 0.5 ? 1 : -1;
    case "saw":
      return ((phase % 1) * 2) - 1;
    case "triangle":
      return 4 * Math.abs((phase % 1) - 0.5) - 1;
    case "noise":
      return noise();
    default:
      return Math.sin(phase * Math.PI * 2);
  }
}

/** The raw 16-bit mono samples for a spec. Exported so the checks can look at the sound itself. */
export function renderSamples(spec: SoundSpec): Int16Array {
  const waveform = spec.waveform ?? "sine";
  const freq = clamp(spec.freq ?? 440, 20, 8000);
  const freqEnd = clamp(spec.freqEnd ?? freq, 20, 8000);
  const seconds = clamp(spec.seconds ?? 0.2, 0.01, MAX_SOUND_SECONDS);
  const volume = clamp(spec.volume ?? 0.4, 0, 1);
  const attack = clamp(spec.attack ?? 0.005, 0, seconds);
  const decay = clamp(spec.decay ?? 12, 0.1, 100);

  const total = Math.floor(SAMPLE_RATE * seconds);
  const out = new Int16Array(total);
  const noise = seededNoise(Math.floor(freq * 1000 + seconds * 7919 + decay * 31));

  let phase = 0;
  for (let i = 0; i < total; i++) {
    const t = i / SAMPLE_RATE;
    const progress = t / seconds;
    // Frequency glides linearly; the phase is accumulated rather than computed
    // from t * freq, because a changing frequency applied to absolute time
    // makes the waveform jump discontinuously and you hear it as a crackle.
    const currentFreq = freq + (freqEnd - freq) * progress;
    phase += currentFreq / SAMPLE_RATE;

    const rise = attack > 0 ? Math.min(1, t / attack) : 1;
    const fall = Math.exp(-decay * t);
    const envelope = rise * fall * volume;

    // A short fade at the very end. Cutting samples off mid-swing leaves a
    // step in the waveform, which every speaker reproduces as an audible click
    // — the exact artefact a "click" sound is supposed to be, arriving on
    // sounds that did not ask for one.
    const tail = Math.min(1, (total - i) / 64);

    out[i] = Math.round(clamp(sample(waveform, phase, noise) * envelope * tail, -1, 1) * 32767);
  }
  return out;
}

/** Portable base64: no Buffer, no btoa, identical in node and the browser. */
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function toBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += B64[a >> 2];
    out += B64[((a & 3) << 4) | ((b ?? 0) >> 4)];
    out += b === undefined ? "=" : B64[((b & 15) << 2) | ((c ?? 0) >> 6)];
    out += c === undefined ? "=" : B64[c & 63];
  }
  return out;
}

/** A complete WAV file as a data URL, ready to store as an asset. */
export function renderWav(spec: SoundSpec): string {
  const samples = renderSamples(spec);
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);

  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  // The canonical 44-byte RIFF/WAVE header for 16-bit mono PCM.
  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // format: uncompressed PCM
  view.setUint16(22, 1, true); // channels
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, "data");
  view.setUint32(40, samples.length * 2, true);

  for (let i = 0; i < samples.length; i++) view.setInt16(44 + i * 2, samples[i], true);

  return `data:audio/wav;base64,${toBase64(bytes)}`;
}

/** A named preset with optional overrides, which is how the model asks for one. */
export function soundFromSpec(spec: SoundSpec & { preset?: string }): string {
  const base = spec.preset ? (SOUND_PRESETS[spec.preset] ?? {}) : {};
  return renderWav({ ...base, ...stripUndefined(spec) });
}

function stripUndefined(spec: SoundSpec & { preset?: string }): SoundSpec {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(spec)) {
    if (key !== "preset" && value !== undefined) out[key] = value;
  }
  return out as SoundSpec;
}
