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
  /**
   * How many harmonics to stack above the fundamental.
   *
   * One partial is a test tone; real instruments are a stack of them. This is
   * the single biggest reason the first version of this file sounded like a
   * 1980s test signal whatever you asked for — every sound was one oscillator.
   */
  harmonics?: number;
  /** How quickly the stack falls away. Lower is brighter and buzzier. */
  brightness?: number;
  /** Hz of pitch wobble. Gives a held note life instead of a dead steady tone. */
  vibrato?: number;
  /** How far the vibrato swings, in semitones. */
  vibratoDepth?: number;
  /** A second voice this many semitones away — a fifth, an octave, a beat. */
  detune?: number;
  /** Seconds held at full volume between the attack and the decay. */
  sustain?: number;
  /** A percussive noise transient on the front. 0-1. Drums and impacts need it. */
  punch?: number;
  /** A melody: "C5/8 E5/8 G5/4", or the name of one in MELODIES. */
  melody?: string;
  /** Beats per minute for a melody. */
  bpm?: number;
  /** A chord root ("C4") to play instead of a single frequency. */
  chord?: string;
  /** major, minor, dim, aug, sus4, major7, minor7, dom7, fifth. */
  chordType?: string;
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
  // -- interface ---------------------------------------------------------
  click: { waveform: "square", freq: 900, freqEnd: 380, seconds: 0.07, decay: 40, volume: 0.3, punch: 0.25 },
  blip: { waveform: "triangle", freq: 1200, seconds: 0.05, decay: 45, volume: 0.28, harmonics: 2 },
  beep: { waveform: "sine", freq: 880, seconds: 0.14, decay: 14, volume: 0.35, harmonics: 3, brightness: 2.4 },
  select: { waveform: "square", freq: 660, freqEnd: 880, seconds: 0.09, decay: 28, volume: 0.28 },
  toggle: { waveform: "triangle", freq: 520, freqEnd: 780, seconds: 0.08, decay: 30, volume: 0.28 },
  // -- reward ------------------------------------------------------------
  // A coin is two notes, not a slide: the second arrives late and higher, and
  // that gap is the whole character of the sound.
  coin: { melody: "B5/16 E6/8", waveform: "square", bpm: 210, harmonics: 3, brightness: 3, volume: 0.3, decay: 9 },
  powerup: { waveform: "triangle", freq: 440, freqEnd: 1320, seconds: 0.45, decay: 5, volume: 0.32, harmonics: 4, vibrato: 14, vibratoDepth: 0.15 },
  victory: { melody: "victory", waveform: "square", bpm: 150, harmonics: 4, brightness: 2.2, volume: 0.3, decay: 5 },
  fanfare: { melody: "fanfare", waveform: "saw", bpm: 132, harmonics: 5, brightness: 2, volume: 0.26, decay: 4, detune: 12 },
  levelup: { melody: "levelup", waveform: "square", bpm: 190, harmonics: 3, volume: 0.3, decay: 7 },
  success: { melody: "pickup", waveform: "sine", bpm: 170, harmonics: 4, volume: 0.32, decay: 6 },
  // -- movement ----------------------------------------------------------
  jump: { waveform: "square", freq: 320, freqEnd: 760, seconds: 0.18, decay: 12, volume: 0.3, harmonics: 2 },
  land: { waveform: "triangle", freq: 200, freqEnd: 90, seconds: 0.14, decay: 20, volume: 0.32, punch: 0.4 },
  dash: { waveform: "noise", freq: 1400, freqEnd: 400, seconds: 0.22, decay: 11, volume: 0.3 },
  // -- impact ------------------------------------------------------------
  hit: { waveform: "noise", freq: 200, seconds: 0.16, decay: 26, volume: 0.42, punch: 0.7 },
  explosion: { waveform: "noise", freq: 120, freqEnd: 40, seconds: 0.8, decay: 5, volume: 0.5, punch: 1, harmonics: 2 },
  laser: { waveform: "saw", freq: 1800, freqEnd: 220, seconds: 0.24, decay: 13, volume: 0.28, harmonics: 3 },
  thud: { waveform: "sine", freq: 140, freqEnd: 55, seconds: 0.26, decay: 14, volume: 0.45, punch: 0.5 },
  // -- failure -----------------------------------------------------------
  error: { waveform: "saw", freq: 300, freqEnd: 140, seconds: 0.35, decay: 8, volume: 0.32, harmonics: 3, detune: -0.4 },
  gameover: { melody: "gameover", waveform: "triangle", bpm: 96, harmonics: 3, volume: 0.32, decay: 4 },
  powerdown: { melody: "powerdown", waveform: "saw", bpm: 150, harmonics: 3, volume: 0.28, decay: 7 },
  // -- ambient / musical -------------------------------------------------
  chime: { chord: "C5", chordType: "major", seconds: 1.2, waveform: "sine", harmonics: 6, brightness: 2.6, decay: 2.5, volume: 0.22, vibrato: 4, vibratoDepth: 0.05 },
  chord: { chord: "C4", chordType: "major", seconds: 1.0, waveform: "triangle", harmonics: 4, decay: 3, volume: 0.24 },
  alarm: { melody: "alarm", waveform: "square", bpm: 200, volume: 0.3, decay: 16 },
};
import { MELODIES, chordFreqs, parseMelody, type Note } from "./music";

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

/**
 * One voice: a stack of harmonics at a frequency, under an ADSR envelope.
 *
 * Written as a function over a shared buffer rather than returning its own, so
 * a chord or a melody mixes into one place without allocating per note.
 *
 * The harmonic stack is what took this from a test tone to something with a
 * character. A single sine is a beep; the same note with four partials falling
 * off at 1/n^brightness is recognisably an instrument, and changing
 * `brightness` alone moves it from a flute to a reed.
 */
function renderVoice(
  buffer: Float32Array,
  offsetSamples: number,
  freq: number,
  seconds: number,
  spec: SoundSpec,
  noise: () => number,
): void {
  const waveform = spec.waveform ?? "sine";
  const volume = clamp(spec.volume ?? 0.4, 0, 1);
  const attack = clamp(spec.attack ?? 0.005, 0, seconds);
  const sustain = clamp(spec.sustain ?? 0, 0, seconds);
  const decay = clamp(spec.decay ?? 12, 0.1, 100);
  const harmonics = Math.round(clamp(spec.harmonics ?? 1, 1, 8));
  const brightness = clamp(spec.brightness ?? 1.6, 0.4, 5);
  const vibrato = clamp(spec.vibrato ?? 0, 0, 40);
  const vibratoDepth = clamp(spec.vibratoDepth ?? 0, 0, 2);
  const punch = clamp(spec.punch ?? 0, 0, 1);
  const freqEnd = clamp(spec.freqEnd ?? freq, 20, 12000);
  const detune = clamp(spec.detune ?? 0, -24, 24);

  const total = Math.floor(SAMPLE_RATE * seconds);
  // Partials are normalised so a bright stack is not simply louder than a dull
  // one — otherwise `harmonics` doubles as a volume control and nothing else
  // in the spec behaves predictably.
  const weights: number[] = [];
  let weightSum = 0;
  for (let h = 1; h <= harmonics; h++) {
    const w = 1 / Math.pow(h, brightness);
    weights.push(w);
    weightSum += w;
  }

  const phases = new Float32Array(harmonics);
  const detunePhases = new Float32Array(harmonics);
  const detuneRatio = detune === 0 ? 0 : Math.pow(2, detune / 12);

  for (let i = 0; i < total; i++) {
    const index = offsetSamples + i;
    if (index >= buffer.length) break;
    const t = i / SAMPLE_RATE;
    const progress = seconds > 0 ? t / seconds : 0;

    // Vibrato modulates the pitch; the glide moves the centre it wobbles around.
    const wobble = vibrato > 0 ? Math.sin(t * vibrato * Math.PI * 2) * vibratoDepth : 0;
    const base = (freq + (freqEnd - freq) * progress) * Math.pow(2, wobble / 12);

    let value = 0;
    for (let h = 0; h < harmonics; h++) {
      phases[h] += (base * (h + 1)) / SAMPLE_RATE;
      value += sample(waveform, phases[h], noise) * weights[h];
      if (detuneRatio !== 0) {
        detunePhases[h] += (base * detuneRatio * (h + 1)) / SAMPLE_RATE;
        value += sample(waveform, detunePhases[h], noise) * weights[h] * 0.6;
      }
    }
    value /= weightSum * (detuneRatio !== 0 ? 1.6 : 1);

    // A percussive transient on the front. This is what separates a drum from a
    // note: the body can be any waveform, but the first few milliseconds have
    // to be broadband noise or the ear does not hear an impact.
    if (punch > 0) {
      const transient = Math.exp(-t * 90) * punch;
      value = value * (1 - transient * 0.5) + noise() * transient;
    }

    const rise = attack > 0 ? Math.min(1, t / attack) : 1;
    const held = t <= attack + sustain ? 1 : Math.exp(-decay * (t - attack - sustain));
    const tail = Math.min(1, (total - i) / 64);

    buffer[index] += clamp(value, -1, 1) * rise * held * volume * tail;
  }
}

/** The notes a spec asks for: a melody, a chord, or a single tone. */
function notesFor(spec: SoundSpec): { notes: Note[][]; seconds: number } {
  if (spec.melody) {
    const text = MELODIES[spec.melody] ?? spec.melody;
    const parsed = parseMelody(text, spec.bpm ?? 140);
    const capped: Note[][] = [];
    let elapsed = 0;
    for (const note of parsed) {
      if (elapsed + note.seconds > MAX_SOUND_SECONDS) break;
      capped.push([note]);
      elapsed += note.seconds;
    }
    return { notes: capped, seconds: elapsed };
  }
  if (spec.chord) {
    const freqs = chordFreqs(spec.chord, spec.chordType ?? "major");
    const seconds = clamp(spec.seconds ?? 1, 0.01, MAX_SOUND_SECONDS);
    // A chord is one slot holding several simultaneous notes.
    return { notes: freqs.length > 0 ? [freqs.map((freq) => ({ freq, seconds }))] : [], seconds };
  }
  const seconds = clamp(spec.seconds ?? 0.2, 0.01, MAX_SOUND_SECONDS);
  return { notes: [[{ freq: clamp(spec.freq ?? 440, 20, 12000), seconds }]], seconds };
}

/** The raw 16-bit mono samples for a spec. Exported so the checks can look at the sound itself. */
export function renderSamples(spec: SoundSpec): Int16Array {
  const { notes, seconds } = notesFor(spec);
  // A note's decay is allowed to ring past its slot, which is what stops a
  // melody sounding like separate files played back to back. The room it gets
  // is derived from the decay rather than being a flat allowance. exp(-d*t)
  // reaches -40dB — the usual practical threshold for "gone" — at ln(100)/d,
  // so a click with decay 40 rings for 115ms and a chime with decay 2.5 takes
  // the full cap. A constant 0.5s made a 70ms click into a 570ms file that was
  // 88% silence, and -60dB (ln(1000)) spent half as much again on a tail
  // nobody can hear over a classroom.
  const ring = Math.min(0.5, Math.log(100) / clamp(spec.decay ?? 12, 0.1, 100));
  const total = Math.max(1, Math.floor(SAMPLE_RATE * Math.min(MAX_SOUND_SECONDS, seconds + ring)));
  const mix = new Float32Array(total);
  const noise = seededNoise(
    Math.floor((spec.freq ?? 440) * 1000 + seconds * 7919 + (spec.decay ?? 12) * 31) + 1,
  );

  let cursor = 0;
  for (const slot of notes) {
    const slotSeconds = slot[0]?.seconds ?? 0;
    for (const note of slot) {
      if (note.freq > 0) {
        // Each note rings for its slot plus the tail, rather than being cut at
        // the next note. Overlapping decays are what make a sequence sound
        // played rather than spliced.
        renderVoice(mix, cursor, note.freq, Math.min(note.seconds + ring, MAX_SOUND_SECONDS), spec, noise);
      }
    }
    cursor += Math.floor(SAMPLE_RATE * slotSeconds);
  }

  // Normalise only if the mix clipped. Scaling everything to full range would
  // make a quiet sound and a loud one identical, which throws away the
  // difference between a click and an explosion.
  let peak = 0;
  for (let i = 0; i < total; i++) peak = Math.max(peak, Math.abs(mix[i]));
  const scale = peak > 1 ? 1 / peak : 1;

  const out = new Int16Array(total);
  for (let i = 0; i < total; i++) out[i] = Math.round(clamp(mix[i] * scale, -1, 1) * 32767);
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
