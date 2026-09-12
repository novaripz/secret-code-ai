// Size caps on anything a browser sends us, and the replies we give when they
// are exceeded.
//
// The reason is cost, not tidiness. Every one of these routes either spends
// provider quota (AI), spends YouTube quota (Watch), or writes to a log
// (Report), and all three are billed or bounded by someone other than the
// person sending the request. An unbounded body is a way to spend that budget
// with one request instead of a thousand, and it is also a way to trip a
// provider's own limits and take the route down for everyone else.
//
// The caps below are deliberately generous — a student pasting a whole file
// into chat is normal use and must keep working. They are here to stop the
// absurd, not to police the large.
//
// Messages to the student are written for a fifteen-year-old: plain sentence,
// says what to do next, never a status code on its own and never a stack.

import { NextResponse } from "next/server";

/** Chat prompts already fold in attached files, hence the size. */
export const MAX_AI_BODY_BYTES = 12_000_000;
export const MAX_AI_PROMPT_CHARS = 400_000;
export const MAX_AI_HISTORY_MESSAGES = 20;
export const MAX_AI_HISTORY_CHARS = 200_000;
export const MAX_AI_CONTEXT_FILES = 60;
export const MAX_AI_CONTEXT_CHARS = 600_000;

/** Watch and Report send a handful of short strings; nothing needs to be big. */
export const MAX_SMALL_BODY_BYTES = 64_000;

export interface ReadBodyOk {
  ok: true;
  body: unknown;
}
export interface ReadBodyFailure {
  ok: false;
  response: NextResponse;
}

/**
 * Reads a JSON body, refusing anything over `maxBytes`.
 *
 * We check Content-Length first (cheap, and what a well-behaved client sends)
 * but do not trust it: the body is then read as text and measured for real, so
 * a lying or absent header cannot get past the cap. Reading as text rather
 * than streaming means we still buffer up to `maxBytes` — that is the price of
 * not pulling in a streaming parser, and `maxBytes` is chosen to be survivable.
 */
export async function readJsonBody(
  request: Request,
  maxBytes: number,
  /**
   * When true an empty body reads as `undefined` instead of a 400. Some routes
   * treat "no body" as a legitimate request for defaults, and turning that into
   * an error would be a behaviour change dressed up as hardening.
   */
  allowEmpty = false,
): Promise<ReadBodyOk | ReadBodyFailure> {
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, response: tooLarge() };
  }

  let text: string;
  try {
    text = await request.text();
  } catch {
    return { ok: false, response: badRequest("Panda couldn't read that request. Try again.") };
  }

  // Bytes, not characters — a prompt full of emoji is several bytes each.
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    return { ok: false, response: tooLarge() };
  }

  if (allowEmpty && text.trim().length === 0) return { ok: true, body: undefined };

  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false, response: badRequest("That request wasn't in a format Panda understands.") };
  }
}

export function tooLarge(
  message = "That's more than Panda can take in one go. Try sending less at once.",
): NextResponse {
  return NextResponse.json({ error: message }, { status: 413 });
}

export function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

/**
 * Total characters across a chat history, so a caller can reject a history
 * that is small in message count but enormous in bytes. Counting is cheap
 * compared with sending it to a provider.
 */
export function totalChars(values: Iterable<string>): number {
  let n = 0;
  for (const v of values) n += v.length;
  return n;
}
