#!/usr/bin/env python3
"""Synthesizes every Wiki Race UI sound effect (original, procedurally generated audio).

Writes one .ogg per key in Config.Sounds to assets/sounds/. Upload them to Roblox
(Creator Hub → Creations → Audio, or Studio's Asset Manager bulk import) and paste the
resulting rbxassetid:// IDs into src/shared/Config.luau → Config.Sounds.

Requires: numpy, soundfile  (pip install numpy soundfile)
"""

import os
import numpy as np
import soundfile as sf

RATE = 44100
OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "sounds")
rng = np.random.default_rng(7)


def t(seconds):
    return np.arange(int(RATE * seconds)) / RATE


def env(length, attack=0.005, decay=None, release=0.05):
    n = length
    e = np.ones(n)
    a = min(max(1, int(RATE * attack)), n // 4 or 1)
    e[:a] = np.linspace(0, 1, a)
    if decay:
        e *= np.exp(-np.arange(n) / (RATE * decay))
    r = min(max(1, int(RATE * release)), n // 3 or 1)
    e[-r:] *= np.linspace(1, 0, r)
    return e


def sine(freq, seconds, phase=0.0):
    x = t(seconds)
    if callable(freq):
        f = freq(x)
        return np.sin(2 * np.pi * np.cumsum(f) / RATE + phase)
    return np.sin(2 * np.pi * freq * x + phase)


def square(freq, seconds):
    return np.sign(sine(freq, seconds)) * 0.6


def saw(freq, seconds):
    x = t(seconds)
    if callable(freq):
        phase = np.cumsum(freq(x)) / RATE
    elif isinstance(freq, np.ndarray):
        phase = np.cumsum(freq) / RATE
    else:
        phase = x * freq
    return 2 * (phase % 1.0) - 1


def noise(seconds):
    return rng.uniform(-1, 1, int(RATE * seconds))


def lowpass(signal, amount=0.1):
    out = np.zeros_like(signal)
    acc = 0.0
    for i, s in enumerate(signal):
        acc += amount * (s - acc)
        out[i] = acc
    return out


def concat(*parts):
    return np.concatenate(parts)


def mix(*parts):
    n = max(len(p) for p in parts)
    out = np.zeros(n)
    for p in parts:
        out[: len(p)] += p
    return out


def note(freq, seconds, kind=sine, decay=0.25, gain=0.6):
    s = kind(freq, seconds)
    return s * env(len(s), decay=decay) * gain


def silence(seconds):
    return np.zeros(int(RATE * seconds))


def chord(freqs, seconds, kind=sine, decay=0.4, gain=0.35):
    return mix(*[note(f, seconds, kind, decay, gain) for f in freqs])


C5, E5, G5, C6, E6, G6 = 523.25, 659.25, 783.99, 1046.5, 1318.5, 1568.0

SOUNDS = {
    "click": lambda: note(1200, 0.05, decay=0.012, gain=0.5),
    "hover": lambda: note(1800, 0.03, decay=0.008, gain=0.25),
    "tick": lambda: note(2100, 0.02, decay=0.004, gain=0.45),
    "link": lambda: concat(note(880, 0.05, decay=0.03), note(1320, 0.08, decay=0.04)),
    "back": lambda: concat(note(660, 0.05, decay=0.03), note(440, 0.08, decay=0.04)),
    "error": lambda: note(170, 0.18, kind=square, decay=0.08, gain=0.35),
    "whoosh": lambda: lowpass(noise(0.5), 0.08) * np.sin(np.linspace(0, np.pi, int(RATE * 0.5))) * 1.6,
    "countdown": lambda: note(880, 0.14, decay=0.07, gain=0.6),
    "go": lambda: mix(note(1320, 0.35, decay=0.2), note(660, 0.35, decay=0.2, gain=0.3), note(1980, 0.35, decay=0.12, gain=0.15)),
    "tempUp": lambda: note(lambda x: 420 + 1400 * x, 0.22, decay=0.12, gain=0.5),
    "tempDown": lambda: note(lambda x: 760 - 1300 * x, 0.22, decay=0.12, gain=0.45),
    "freeze": lambda: mix(*[note(f, 0.5, decay=0.18, gain=0.18) for f in (2637, 3136, 3520, 4186)]),
    "burning": lambda: mix(
        note(lambda x: 300 + 1100 * x, 0.8, kind=saw, decay=0.5, gain=0.25),
        lowpass(noise(0.8), 0.3) * env(int(RATE * 0.8), decay=0.4) * 0.5,
    ),
    "heartbeat": lambda: concat(
        note(58, 0.16, decay=0.06, gain=0.9), silence(0.1), note(52, 0.16, decay=0.06, gain=0.7), silence(0.43)
    ),
    "complete": lambda: concat(*[note(f, 0.14, decay=0.12) for f in (C5, E5, G5)], note(C6, 0.5, decay=0.35)),
    "finishOther": lambda: note(E6, 0.35, decay=0.15, gain=0.35),
    "roundEnd": lambda: chord((C5, G5, E6), 0.7, decay=0.3),
    "drumroll": lambda: lowpass(noise(1.5), 0.25)
    * (0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 22 * t(1.5))))
    * np.linspace(0.2, 1.0, int(RATE * 1.5))
    * 0.7,
    "podium": lambda: concat(note(lambda x: 220 + 400 * x, 0.5, kind=saw, decay=0.6, gain=0.2), chord((C5, E5, G5, C6), 0.8, kind=saw, decay=0.5, gain=0.12)),
    "fanfare": lambda: concat(
        *[lowpass(chord((f, f * 1.25, f * 1.5), d, kind=saw, decay=0.6, gain=0.18), 0.2) for f, d in ((392, 0.18), (392, 0.18), (523.25, 0.7))]
    ),
    "award": lambda: concat(*[note(f, 0.09, decay=0.08, gain=0.35) for f in (C6, E6, G6, 2093)]),
    "achievement": lambda: concat(note(G5, 0.12, decay=0.1), note(C6, 0.55, decay=0.35)),
    "coin": lambda: concat(note(988, 0.07, kind=square, decay=0.06, gain=0.3), note(1319, 0.3, kind=square, decay=0.15, gain=0.3)),
    "purchase": lambda: concat(note(1568, 0.08, decay=0.06), note(2093, 0.4, decay=0.25), silence(0.02)),
    "revealStart": lambda: concat(*[note(f, 0.1, decay=0.08, gain=0.45) for f in (C5, E5, G5)], note(C6, 0.35, decay=0.25)),
    "revealTarget": lambda: mix(
        lowpass(noise(1.0), 0.15) * env(int(RATE * 1.0), decay=0.25) * 0.8,
        chord((110, 164.8, 220, 440), 1.0, kind=saw, decay=0.45, gain=0.2),
    ),
    "siren": lambda: note(lambda x: 700 + 250 * np.sign(np.sin(2 * np.pi * 2.5 * x)), 2.0, kind=saw, decay=None, gain=0.22)
    * env(int(RATE * 2.0), release=0.3),
    "boom": lambda: mix(
        note(lambda x: 90 - 50 * x, 1.0, decay=0.3, gain=0.9), lowpass(noise(1.0), 0.05) * env(int(RATE * 1.0), decay=0.2) * 1.4
    ),
    "jumpscare": lambda: mix(
        noise(0.8) * env(int(RATE * 0.8), decay=0.3) * 0.7, chord((311, 440, 466, 622), 0.8, kind=saw, decay=0.4, gain=0.25)
    ),
    "boing": lambda: note(lambda x: 220 + 180 * np.sin(2 * np.pi * 9 * x) * np.exp(-x * 4), 0.6, decay=0.3, gain=0.6),
    "airhorn": lambda: lowpass(
        mix(*[saw(f * (1 + 0.004 * np.sin(2 * np.pi * 6 * t(1.2))), 1.2) * 0.25 for f in (440, 554.4, 659.3)]), 0.35
    )
    * env(int(RATE * 1.2), release=0.15),
}


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, build in SOUNDS.items():
        signal = np.asarray(build(), dtype=np.float64)
        peak = np.max(np.abs(signal)) or 1.0
        signal = signal / peak * 0.85
        path = os.path.join(OUT, name + ".ogg")
        sf.write(path, signal.astype(np.float32), RATE, format="OGG", subtype="VORBIS")
        print(f"{name:13s} {len(signal) / RATE:5.2f}s  {path}")


if __name__ == "__main__":
    main()
