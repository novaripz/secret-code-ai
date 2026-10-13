// The sound at the end of a focus session.
//
// Three soft sine notes, made on the spot with the Web Audio API: no file to
// download, nothing for a school filter to block, and the same everywhere.
// Quiet on purpose. It is there to lift a student's head out of an essay, not
// to make the room jump.
//
// Browsers only let a page make sound after the person has interacted with it,
// and an AudioContext created later (when the timer runs out, perhaps twenty
// minutes after the last click) starts suspended. So `primeAudio` is called
// from the click that starts the timer, and the context it makes is the one
// the chime plays through.

type AudioCtor = typeof AudioContext;

let context: AudioContext | null = null;

function ctor(): AudioCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** Call from a click. Safe to call often; it makes one context and wakes it. */
export function primeAudio(): void {
  try {
    const Ctor = ctor();
    if (!Ctor) return;
    if (!context) context = new Ctor();
    if (context.state === "suspended") void context.resume();
  } catch {
    // No audio on this device or in this browser. The timer still works; the
    // tab title and the on-screen message carry the news instead.
  }
}

export function playChime(): void {
  try {
    if (!context) primeAudio();
    const ctx = context;
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume();
    const start = ctx.currentTime + 0.05;
    // E5, G5, C6: a rising major arpeggio reads as "done", not as an alarm.
    [659.25, 783.99, 1046.5].forEach((frequency, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = frequency;
      const t = start + i * 0.18;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 1.2);
    });
  } catch {
    // Same as above: silence is an acceptable failure for a nicety.
  }
}
