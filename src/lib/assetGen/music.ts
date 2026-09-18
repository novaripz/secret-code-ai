// Notes, chords and melodies — so Panda can write a tune, not just a beep.
//
// The first version of the sound generator was one oscillator under a falling
// envelope. That is genuinely all a click is, and it is why every sound it made
// had the same character: single voice, no harmonics, no movement, one shape of
// decay. Asked for a "victory fanfare" it produced a slightly longer beep.
//
// What makes a sound interesting is what makes any sound interesting: several
// partials at once, an envelope with more than one stage, and change over time.
// And what makes a TUNE is a sequence. Both are arithmetic, so both belong here
// rather than in an API call.

/** Note name to semitone offset from C. Sharps and flats are the same key. */
const SEMITONE: Record<string, number> = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5,
  "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
};

/**
 * "A4" or "C#5" to hertz. Returns undefined for anything unparseable, so a
 * typo in a melody skips a note rather than emitting a click at 0Hz.
 *
 * A4 = 440Hz is the anchor and the exponent is the standard equal-tempered
 * one: every semitone multiplies the frequency by the twelfth root of two.
 */
export function noteToFreq(note: string): number | undefined {
  const m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(note.trim());
  if (!m) return undefined;
  const key = m[1].toUpperCase() + (m[2] === "b" ? "b" : m[2]);
  const semitone = SEMITONE[key];
  if (semitone === undefined) return undefined;
  const octave = Number(m[3]);
  // MIDI note 69 is A4. Everything is expressed relative to it.
  const midi = (octave + 1) * 12 + semitone;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Chord shapes as semitone offsets from the root. */
export const CHORDS: Record<string, number[]> = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  sus4: [0, 5, 7],
  major7: [0, 4, 7, 11],
  minor7: [0, 3, 7, 10],
  dom7: [0, 4, 7, 10],
  fifth: [0, 7],
};

/**
 * Melodies a student asks for by name. Written as note lists rather than as
 * recordings so they transpose, re-time and re-voice for free — and so none of
 * them is a copy of anyone's music. Each is a plain arpeggio or scale figure of
 * the kind that has been game-audio vocabulary since the 1980s.
 */
export const MELODIES: Record<string, string> = {
  // Rising major arpeggio: the universal "you did it".
  victory: "C5/8 E5/8 G5/8 C6/4",
  fanfare: "G4/8 C5/8 E5/8 G5/8 C6/2",
  levelup: "C5/16 D5/16 E5/16 G5/16 C6/8",
  // Falling minor: the universal "you did not".
  gameover: "C5/8 G4/8 Eb4/8 C4/2",
  lose: "E5/8 Eb5/8 D5/8 Db5/4",
  // Short, neutral, repeatable.
  pickup: "E5/16 G5/16 C6/8",
  menu: "C5/16 E5/16",
  alarm: "A5/16 R/16 A5/16 R/16 A5/16",
  powerdown: "C6/16 A5/16 F5/16 C5/8",
  coinrun: "B5/16 E6/8",
};

export interface Note {
  /** Hz, or 0 for a rest. */
  freq: number;
  seconds: number;
}

/**
 * Parses "C5/8 E5/8 G5/4" — note name, slash, denominator of a whole note.
 *
 * Slash-denominator rather than millisecond durations because it is how music
 * is actually counted: /4 is a quarter note, /8 an eighth. One `tempo` then
 * re-times the whole melody, which is what makes these reusable rather than
 * ten fixed jingles. "R" is a rest.
 */
export function parseMelody(text: string, bpm = 140): Note[] {
  const beat = 60 / Math.max(40, Math.min(300, bpm));
  const out: Note[] = [];
  for (const token of text.trim().split(/\s+/)) {
    if (!token) continue;
    const [name, denom] = token.split("/");
    const division = Number(denom) || 4;
    // A quarter note is one beat, so a /8 is half a beat and a /2 is two.
    const seconds = Math.min(4, beat * (4 / Math.max(1, division)));
    if (/^r$/i.test(name)) {
      out.push({ freq: 0, seconds });
      continue;
    }
    const freq = noteToFreq(name);
    if (freq !== undefined) out.push({ freq, seconds });
  }
  return out;
}

/** A chord as the frequencies that make it up. */
export function chordFreqs(root: string, quality = "major"): number[] {
  const base = noteToFreq(root);
  if (base === undefined) return [];
  const shape = CHORDS[quality] ?? CHORDS.major;
  return shape.map((semi) => base * Math.pow(2, semi / 12));
}
