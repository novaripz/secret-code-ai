// The envelope must never reach the screen.
//
// Run with `npx tsx scripts/checks/envelope-repair.test.ts`. No framework, for
// the same reason as scripts/checks/ai-chain.test.ts: a few asserted facts and
// a non-zero exit.
//
// This file exists because of one turn in a real classroom. A student asked
// "where did you put all my jquery" and the build studio printed this into the
// transcript, verbatim, as Panda's reply:
//
//     {
//       "operations": [],
//       "message": "Your jQuery is still right here doing all the work!
//
//     Here is where it lives in your project:
//     ...
//
// The model had written LITERAL newlines inside the JSON string. JSON forbids
// raw control characters inside a string, so JSON.parse died on the first one
// — "Bad control character in string literal", at the `\n` immediately after
// "doing all the work!" — and the catch branch in parseAgentResponse handed the
// whole raw envelope back as prose.
//
// So: the real envelope must now parse; the other faults models commit must be
// repaired or degrade to prose; a valid envelope must come through untouched;
// and no input at all may produce a rendered `{"operations"`.

import { parseAgentResponse, repairJsonText, studentSafeMessage } from "../../src/lib/ai/turn";
import { recoverOperations } from "../../src/components/build/recoverOperations";

let failures = 0;
function ok(name: string, condition: boolean, detail = ""): void {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures++;
}

/** What the panel would put on screen for a given raw reply. */
function rendered(raw: string): string {
  return parseAgentResponse(raw).message;
}

/**
 * The one thing that must be true of every message in this file: it is not the
 * envelope. Same shape the floor in turn.ts rejects.
 */
const LOOKS_LIKE_ENVELOPE =
  /^\s*(?:```(?:json)?\s*)?\{[\s\S]*?["'\u201C](?:operations|message|openFiles)["'\u201D]\s*:/;

// ---------------------------------------------------------------------------
// The actual failure, character for character
// ---------------------------------------------------------------------------

console.log("\nthe jQuery envelope");

const JQUERY_MESSAGE =
  "Your jQuery is still right here doing all the work!\n\n" +
  "Here is where it lives in your project:\n\n" +
  '1. The jQuery Library: Loaded in index.html inside the <head> tag ( <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script> ).';

// Reconstructed as the model emitted it: a well-formed envelope everywhere
// except that the message's own line breaks were never escaped.
const JQUERY_RAW = `{
  "operations": [],
  "message": "${JQUERY_MESSAGE.replace(/"/g, '\\"')}"
}`;

let died = "";
try {
  JSON.parse(JQUERY_RAW);
} catch (err) {
  died = err instanceof Error ? err.message : String(err);
}
ok("the reconstructed envelope really is the bug", /control character/i.test(died), died);
ok(
  "it dies on the first literal newline, not anywhere else",
  JQUERY_RAW[Number(/position (\d+)/.exec(died)?.[1] ?? -1)] === "\n",
);

const jquery = parseAgentResponse(JQUERY_RAW);
ok("it now parses", jquery.message === JQUERY_MESSAGE);
ok("and the line breaks survived the repair", jquery.message.includes("\n\n1. The jQuery Library"));
ok("with no operations invented", jquery.operations.length === 0);

// ---------------------------------------------------------------------------
// Salvaging operations matters as much as salvaging the message
// ---------------------------------------------------------------------------
//
// This student's turn wrote nothing. A turn that wrote four files and then put
// a raw newline in its last string used to lose all four, silently, because
// JSON.parse is all-or-nothing.

console.log("\noperations behind a broken string");

const FOUR_FILES = `{
  "operations": [
    { "type": "create", "path": "index.html", "content": "<h1>hi</h1>" },
    { "type": "create", "path": "style.css", "content": "body { color: red }" },
    { "type": "create", "path": "script.js", "content": "console.log(1)" },
    { "type": "create", "path": "about.html", "content": "<h1>about</h1>" }
  ],
  "message": "Built it.
Four files."
}`;
const four = parseAgentResponse(FOUR_FILES);
ok("all four files come back", four.operations.length === 4, `${four.operations.length}`);
ok("their contents are untouched", four.operations[1].content === "body { color: red }");
ok("and the message is decoded, not dropped", four.message === "Built it.\nFour files.");

// A reply cut off mid-file is a different animal. The repair CAN close its
// braces, and must not be believed when it does: half a file closed into a
// whole-looking one is a file a student would apply over a good one. The
// message survives; the operations are handed back to the salvage paths, which
// drop the truncated tail themselves.
{
  const cut = FOUR_FILES.slice(0, FOUR_FILES.indexOf("about.html") + 6);
  const truncated = parseAgentResponse(cut);
  ok("a truncated envelope proposes no operations", truncated.operations.length === 0);
  ok(
    "and the salvage path still recovers the whole files before the cut",
    recoverOperations(cut)?.operations.length === 3,
    `${recoverOperations(cut)?.operations.length}`,
  );
}

// ---------------------------------------------------------------------------
// The other ways a model breaks its own JSON
// ---------------------------------------------------------------------------

console.log("\nother faults: repaired, or degraded to prose");

const CASES: { name: string; raw: string; expect?: string }[] = [
  {
    name: "a trailing comma after the last operation",
    raw: '{ "operations": [ { "type": "create", "path": "a.js", "content": "x" }, ], "message": "Done." }',
    expect: "Done.",
  },
  {
    name: "a trailing comma after the last key",
    raw: '{ "operations": [], "message": "Done.", }',
    expect: "Done.",
  },
  {
    name: "an unescaped tab inside the message",
    raw: '{ "operations": [], "message": "Col1\tCol2" }',
    expect: "Col1\tCol2",
  },
  {
    name: "a bare control character",
    raw: '{ "operations": [], "message": "before\u0007after" }',
    expect: "before\u0007after",
  },
  {
    name: "smart quotes used as delimiters",
    raw: '{ \u201Coperations\u201D: [], \u201Cmessage\u201D: \u201CAll set.\u201D }',
    expect: "All set.",
  },
  {
    name: "a Windows path's lone backslash",
    raw: '{ "operations": [], "message": "Saved to C:\\Users\\me" }',
    expect: "Saved to C:\\Users\\me",
  },
  {
    name: "a code fence around the envelope",
    raw: '```json\n{ "operations": [], "message": "Fenced." }\n```',
    expect: "Fenced.",
  },
  {
    name: "the envelope truncated mid-message",
    raw: '{ "operations": [], "message": "I started explaining and then the budget',
    expect: "I started explaining and then the budget",
  },
];

for (const c of CASES) {
  const message = rendered(c.raw);
  ok(c.name, c.expect === undefined ? message.length > 0 : message === c.expect, JSON.stringify(message));
}

// A fault we deliberately do NOT repair — single-quoted strings are ambiguous
// against file content — still must not put JSON on screen.
const SINGLE_QUOTED = "{ 'operations': [], 'message': 'nope' }";
ok(
  "an unrepairable envelope degrades to a sentence, never to JSON",
  !LOOKS_LIKE_ENVELOPE.test(rendered(SINGLE_QUOTED)) && rendered(SINGLE_QUOTED).length > 0,
  JSON.stringify(rendered(SINGLE_QUOTED)),
);

// ---------------------------------------------------------------------------
// The repair must not touch anything that was already fine
// ---------------------------------------------------------------------------

console.log("\nleaving good replies alone");

const VALID = JSON.stringify({
  operations: [
    {
      type: "modify",
      path: "index.html",
      // Everything a naive regex repair would corrupt: braces, quotes,
      // backslashes, an escaped newline, and a trailing comma inside content.
      content: '<script>const re = /\\{,\\}/; const o = { a: 1, };</script>\n<p>"hi"</p>',
    },
  ],
  message: "Updated index.html.\nHave a look.",
  openFiles: ["index.html"],
});

ok("a valid envelope is byte-identical after repair", repairJsonText(VALID) === VALID);
const valid = parseAgentResponse(VALID);
ok("its message is unchanged", valid.message === "Updated index.html.\nHave a look.");
ok(
  "its content is unchanged",
  valid.operations[0].content === '<script>const re = /\\{,\\}/; const o = { a: 1, };</script>\n<p>"hi"</p>',
);
ok("its openFiles survive", valid.openFiles?.[0] === "index.html");

// Prose is a legitimate reply from a provider that ignored the format, and the
// floor must not eat it — including prose that quotes JSON in a code block.
const PROSE_WITH_JSON =
  'Your package.json needs one more line:\n\n```json\n{ "name": "site", "operations": 1 }\n```\n\nAdd it and reload.';
ok("prose containing a JSON example still renders", rendered(PROSE_WITH_JSON) === PROSE_WITH_JSON);
ok(
  "the same prose keeps its code block for the recovery pass",
  studentSafeMessage(PROSE_WITH_JSON) === PROSE_WITH_JSON,
);

// ---------------------------------------------------------------------------
// The floor: no input, ever, renders an envelope
// ---------------------------------------------------------------------------
//
// This is the guarantee the student was owed. It is asserted over every raw
// reply in this file plus a pile of deliberately hostile ones, because the
// failure mode was never one specific fault — it was that ANY parse failure
// fell through to "show them the JSON".

console.log("\nthe floor");

const HOSTILE: string[] = [
  JQUERY_RAW,
  FOUR_FILES,
  SINGLE_QUOTED,
  ...CASES.map((c) => c.raw),
  "",
  "   ",
  "{",
  '{"operations"',
  '{"operations": [}',
  '{"operations": [], "message": }',
  '{"operations": [], "message": null}',
  '{"operations": "not an array", "message": "hm"}',
  '[{"operations": []}]',
  '{"operations": [], "message": "{\\"operations\\": [], \\"message\\": \\"nested\\"}"}',
  '```json\n{"operations": [], "message": "unclosed fence',
  'Sorry! Here is the JSON:\n{"operations": [], "message": "after an apology',
  '{"operations": [], "message": "\u0000\u0001\u0002"}',
  "null",
  "42",
  '"just a string"',
];

let leaked = 0;
for (const raw of HOSTILE) {
  const message = rendered(raw);
  if (LOOKS_LIKE_ENVELOPE.test(message)) {
    leaked++;
    console.log(`   leaked for: ${JSON.stringify(raw.slice(0, 60))}`);
  }
  if (!message.trim() && parseAgentResponse(raw).operations.length === 0) {
    leaked++;
    console.log(`   nothing at all to show for: ${JSON.stringify(raw.slice(0, 60))}`);
  }
}
ok(`no envelope reaches the screen (${HOSTILE.length} replies)`, leaked === 0);

// The panel's second reading runs on the same raw text; whatever it proposes
// as a note must clear the same bar.
let notesLeaked = 0;
for (const raw of HOSTILE) {
  const note = recoverOperations(raw)?.note;
  if (note && LOOKS_LIKE_ENVELOPE.test(studentSafeMessage(note, "fallback"))) notesLeaked++;
}
ok("recovered notes clear the same bar", notesLeaked === 0);

console.log(failures === 0 ? "\nall good\n" : `\n${failures} failing\n`);
process.exit(failures === 0 ? 0 : 1);
