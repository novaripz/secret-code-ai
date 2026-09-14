// Turning "my name is Santi, by the way" into something Panda still knows
// tomorrow.
//
// The design decision is where the judgement happens. Deciding what is worth
// remembering is a language problem — "call me Santi" is durable, "I'm tired
// today" is not, and no regex over the student's prose tells those apart
// without writing nonsense into a fourteen year old's profile. So the model
// makes the call and says so explicitly, in a marker it is asked to emit only
// when a student states a fact about themselves. This file does no inference at
// all: it reads markers and nothing else, which is why a false positive has to
// come from a deliberate statement rather than from a parser guessing.
//
// The marker is stripped before the reply is drawn. The student sees "got it,
// Santi" and the fact quietly appears in Settings, where they can delete it —
// that visibility is the consent story, so nothing is stored that they cannot
// see and remove.

/** The marker Panda emits, e.g. `[[remember: goes by Santi]]`. */
const MARKER = /\[\[remember:\s*([^\]]{1,200})\]\]/gi;

/**
 * A half-arrived marker at the very end of a streaming reply.
 *
 * Without this the student watches "[[remem" appear and then vanish, which
 * looks like a bug and gives away the mechanism. Only matched at the end, so a
 * stray bracket mid-sentence still renders as the student typed it.
 */
const PARTIAL = /\[\[?r?e?m?e?m?b?e?r?:?[^\]]*$/i;

/** The facts Panda asked to keep. Trimmed, deduped, empty ones dropped. */
export function parseRemembered(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(MARKER)) {
    const fact = m[1].trim();
    // A long one is almost always the model summarising the conversation
    // rather than stating a fact, and a profile is not a transcript.
    if (fact && fact.length <= 160 && !out.includes(fact)) out.push(fact);
  }
  return out;
}

/** The reply as the student should see it: markers gone, spacing tidy. */
export function stripRemembered(text: string, streaming = false): string {
  let clean = text.replace(MARKER, "");
  if (streaming) clean = clean.replace(PARTIAL, "");
  return clean.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}
