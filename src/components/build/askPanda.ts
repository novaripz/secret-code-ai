"use client";

// Sending a piece of the student's own code to the agent, from wherever they
// are looking at it.
//
// This is the thing that makes the editor's right-click menu worth having:
// "Ask Panda about this" on a selection is not something a generic code editor
// can offer, and it is exactly the move a 15-year-old stuck on a line actually
// wants — they are already pointing at the problem.
//
// THE SEAM, AND WHY IT IS AN EVENT
//
// The agent panel owns its composer and its send loop, and it is not this
// component's to restructure. It already listens for one window event
// ("panda:focus-composer") for precisely this reason, so this follows the
// pattern it set rather than inventing a second one. The workspace hears
// "panda:ask", opens the chat, and drops the text into the composer.
//
// It PREFILLS rather than sends. That is a deliberate choice and not only a
// limitation: the student sees the question before it goes, can add the bit
// only they know ("it's meant to bounce"), and learns what a good question to
// an assistant looks like. A one-line listener in AgentPanel could make it send
// outright; the hand-off is described in this change's notes.

export const ASK_EVENT = "panda:ask";

export interface AskDetail {
  prompt: string;
}

/** Builds the question so the model gets the file and the code, not just the words. */
export function buildAskPrompt(kind: "explain" | "fix", path: string, code: string): string {
  const trimmed = code.trim();
  const opening =
    kind === "explain"
      ? `Explain what this part of ${path} does, in plain language.`
      : `Something is wrong with this part of ${path}. Find it and fix it.`;
  // No code fence when there is no code: a selection-less "explain this" is a
  // question about the whole file, and a fence around nothing reads to the
  // model as an empty file.
  if (!trimmed) return `${opening} (No selection — look at the whole file.)`;
  return `${opening}\n\n\`\`\`\n${trimmed}\n\`\`\``;
}

export function askPanda(prompt: string): void {
  window.dispatchEvent(new CustomEvent<AskDetail>(ASK_EVENT, { detail: { prompt } }));
}

/**
 * Puts text into the agent panel's composer from outside it.
 *
 * React owns that textarea's value, so assigning `.value` directly would be
 * overwritten on the panel's next render and the student would watch their
 * question vanish. Going through the element's native value setter and then
 * dispatching an `input` event is the supported way to tell React that a
 * controlled field changed — it is the same path a real keystroke takes.
 */
export function prefillComposer(text: string): boolean {
  const field = document.querySelector<HTMLTextAreaElement>("[data-agent-composer] textarea, textarea");
  if (!field) return false;
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  setter?.call(field, text);
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.focus();
  // Caret at the end, so the student types their own addition after the
  // question rather than in front of it.
  field.setSelectionRange(text.length, text.length);
  return true;
}
