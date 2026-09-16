// What the provider chain promises, checked rather than believed.
//
// Run with `npm run check:ai`. No framework: a few asserted facts and a
// non-zero exit, which is all this needs to be useful and is the reason it
// exists at all rather than being deferred until the repo has a test runner.
//
// Every case here is a bug that reached production and cost a class real time.
// Three of four providers were failing -- one retired model id, one unpaid
// account, one that accepted requests and never answered -- and none of it was
// visible, because a chain that falls through is indistinguishable from a chain
// that is merely slow. These are the seams where that hid.

import http from "node:http";

import {
  FIRST_TOKEN_MS,
  PROJECT_CHAIN_BUDGET_MS,
  PROJECT_FIRST_TOKEN_MS,
  patience,
} from "../../src/lib/ai/chain";
import { selectContextFiles } from "../../src/lib/ai/contextSelection";
import { OpenAiCompatibleProvider, ProviderHttpError } from "../../src/lib/ai/openaiCompatible";
import { readProjectStream } from "../../src/lib/ai/projectStream";
import { handleFrame } from "../../src/components/build/buildStream";
import { useLiveWrite } from "../../src/components/build/useLiveWrite";
import { MAX_NOTES_CHARS, PROJECT_NOTES_PATH, readProjectNotes } from "../../src/lib/ai/projectNotes";
import { buildUserTurnText } from "../../src/lib/ai/turn";
import { AiTimeoutError, clearProviderCooldown, coolDownProvider, providerCooldown } from "../../src/lib/ai/provider";

let failures = 0;
function ok(name: string, condition: boolean, detail = ""): void {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures++;
}

const project = { chatOnly: false } as never;
const chat = { chatOnly: true } as never;

// ---------------------------------------------------------------------------
// Sharing the budget
// ---------------------------------------------------------------------------
//
// One provider must never be able to spend the whole chain's time proving it
// is not there. NVIDIA did exactly that: thirty seconds of silence out of a
// forty-five second budget, on every project request, before the chain reached
// the provider that worked.

console.log("\nsharing the first-token budget");

const cuts: number[] = [];
let left = PROJECT_CHAIN_BUDGET_MS;
for (let i = 0; i < 4; i++) {
  const cut = Math.min(PROJECT_FIRST_TOKEN_MS, patience(left, i, 4, project));
  cuts.push(cut);
  left -= cut;
}
ok("the first of four does not get the whole cap", cuts[0] < PROJECT_FIRST_TOKEN_MS, `${cuts[0]}ms`);
ok("three silent providers still leave the fourth a real try", cuts[3] >= 8_000, `${cuts[3]}ms`);
ok(
  "the cuts fit inside the budget",
  cuts.reduce((a, b) => a + b, 0) <= PROJECT_CHAIN_BUDGET_MS,
  cuts.join(" + "),
);
ok("the last in line gets everything left", patience(9_000, 3, 4, project) === 9_000);
ok("nobody is cut below the floor", patience(PROJECT_CHAIN_BUDGET_MS, 0, 9, project) >= 8_000);
ok("the floor never exceeds what is left", patience(3_000, 0, 9, project) <= 3_000);
ok("a lone provider gets the whole budget", patience(PROJECT_CHAIN_BUDGET_MS, 0, 1, project) === PROJECT_CHAIN_BUDGET_MS);
ok("chat turns are untouched", Math.min(FIRST_TOKEN_MS, patience(22_000, 0, 4, chat)) === FIRST_TOKEN_MS);

// ---------------------------------------------------------------------------
// Which failures are worth remembering
// ---------------------------------------------------------------------------
//
// A cooldown is a guess about somebody else's service, so it has to be wrong in
// the safe direction: bench what cannot succeed, never bench a healthy provider
// over one bad minute.

console.log("\nclassifying failures");

clearProviderCooldown("groq");
const retired = coolDownProvider("groq", {
  status: 404,
  message: "The model `llama-3.3-70b-versatile` does not exist or you do not have access to it",
});
ok("a retired model id is benched as misconfigured", retired?.source === "misconfigured");
ok("and benched long, because only a redeploy fixes it", !!retired && retired.until - Date.now() > 50 * 60_000);
ok("the bench is live", providerCooldown("groq") !== undefined);
clearProviderCooldown("groq");

ok("a 404 that is not about a model is not benched", coolDownProvider("groq", { status: 404, message: "not found" }) === undefined);
ok("a dropped socket is not benched", coolDownProvider("x", { message: "fetch failed" }) === undefined);
ok("a 500 is not benched", coolDownProvider("x", { status: 500, message: "internal error" }) === undefined);

clearProviderCooldown("nvidia");
const quiet = coolDownProvider("nvidia", { message: "nvidia sent nothing for 30000ms." });
ok("silence is benched", quiet?.source === "silent");
const firstBench = quiet!.until - Date.now();
ok("the first silence is a short bench", firstBench > 110_000 && firstBench < 130_000, `${Math.round(firstBench / 1000)}s`);
ok("silence doubles", coolDownProvider("nvidia", { message: "nvidia sent nothing for 8000ms." })!.until - Date.now() > 230_000);
clearProviderCooldown("nvidia");

clearProviderCooldown("cerebras");
ok(
  "payment required is still a quota refusal",
  coolDownProvider("cerebras", { status: 402, message: "Payment required to access this resource." })?.source === "backoff",
);
clearProviderCooldown("cerebras");
clearProviderCooldown("z");
ok("a rejected key is still a rejected key", coolDownProvider("z", { status: 401, message: "Invalid API Key" })?.source === "bad-key");
clearProviderCooldown("z");


// ---------------------------------------------------------------------------
// The project's brief
// ---------------------------------------------------------------------------
//
// PANDA.md only pays for itself if it is ALWAYS there. A brief that gets
// dropped whenever the project grows past twelve files is worse than none:
// the model silently goes back to re-deriving everything, on exactly the
// projects where that costs most.

console.log("\nthe project brief");

function projectWith(files: Record<string, string>): never {
  const nodes: Record<string, unknown> = {};
  let n = 0;
  for (const [path, content] of Object.entries(files)) {
    const id = `f${n++}`;
    nodes[id] = { id, name: path.split("/").pop(), kind: "file", path, parentId: "root", content, createdAt: 0, updatedAt: 0 };
  }
  nodes.root = { id: "root", name: "", kind: "folder", path: "", parentId: null, createdAt: 0, updatedAt: 0 };
  return { id: "p", name: "Test", createdAt: 0, updatedAt: 0, rootId: "root", files: nodes } as never;
}

const crowded: Record<string, string> = { [PROJECT_NOTES_PATH]: "# Test\nWhat it is: a game." };
for (let i = 0; i < 20; i++) crowded[`src/file${i}.js`] = `// file ${i}\n`.repeat(50);
const crowdedProject = projectWith(crowded);

// With an open file, as the editor always has: the brief rides along on top of
// the source the selector would have sent anyway.
const selected = selectContextFiles(crowdedProject, {
  prompt: "add a score counter",
  currentFilePath: "src/file3.js",
});
ok("the brief survives a project with twenty files", PROJECT_NOTES_PATH in selected);
ok("and does not displace the source files", Object.keys(selected).length > 1, Object.keys(selected).join(", "));

const long = projectWith({ [PROJECT_NOTES_PATH]: "x".repeat(MAX_NOTES_CHARS * 3) });
ok("an overgrown brief is capped", (readProjectNotes(long) ?? "").length === MAX_NOTES_CHARS);
ok("an empty brief reads as absent", readProjectNotes(projectWith({ [PROJECT_NOTES_PATH]: "   \n" })) === undefined);

const turn = buildUserTurnText({
  prompt: "add a score counter",
  fileTree: `${PROJECT_NOTES_PATH}\nsrc/game.js`,
  contextFiles: { [PROJECT_NOTES_PATH]: "# Test\nWhat it is: a game.", "src/game.js": "let score = 0;" },
  chatOnly: false,
  history: [],
} as never);
ok("the brief gets its own heading", turn.includes("THIS PROJECT'S BRIEF"));
ok("and is stated before the source", turn.indexOf("THIS PROJECT'S BRIEF") < turn.indexOf("RELEVANT FILE CONTENTS"));
ok("and is not repeated as a source file", !turn.includes(`--- FILE: ${PROJECT_NOTES_PATH} ---`));
ok("while the real source files still arrive", turn.includes("--- FILE: src/game.js ---"));


// ---------------------------------------------------------------------------
// Watching a file being written
// ---------------------------------------------------------------------------
//
// The editor shows code landing in a file as the model emits it, which means
// decoding a JSON string that is by definition unfinished: no closing quote,
// and a last character that may be half an escape sequence. Getting that wrong
// is not a cosmetic bug -- a `\` or a partial `\u00` at a chunk boundary is the
// NORMAL case, not the edge one, and a decoder that throws on it either kills
// the turn or silently shows nothing.
//
// So the stream is driven one character at a time, which is the cruellest chunk
// boundary available, and the reassembled deltas are checked against the text
// the model meant to send.

async function streamingChecks(): Promise<void> {
console.log("\nstreaming a file into the editor");

async function drainStream(raw: string, chunkSize: number) {
  async function* chunks() {
    for (let i = 0; i < raw.length; i += chunkSize) yield raw.slice(i, i + chunkSize);
  }
  const deltas: { path: string; delta: string }[] = [];
  const starts: string[] = [];
  const ops: string[] = [];
  let done: { truncated: boolean; count: number } | undefined;
  for await (const event of readProjectStream(chunks())) {
    if (event.kind === "op_delta") deltas.push({ path: event.path, delta: event.delta });
    if (event.kind === "op_start") starts.push(event.path);
    if (event.kind === "op") ops.push(event.op.path);
    if (event.kind === "done") done = { truncated: event.truncated, count: event.response.operations.length };
  }
  return { deltas, starts, ops, done };
}

// Every nasty thing a real file contains: newlines, quotes, backslashes, a tab,
// and a unicode escape -- each one a place the naive decoder breaks.
const fileText = 'const s = "hi\\n";\nif (a > 1) {\n\tconsole.log(\'x\\u00e9\');\n}\n';
const envelope = JSON.stringify({
  operations: [
    { type: "create", path: "js/game.js", content: fileText },
    { type: "create", path: "js/shop.js", content: "// shop\n" },
  ],
  message: "Done.",
});

for (const size of [1, 3, 17, 4096]) {
  const { deltas, starts, ops, done } = await drainStream(envelope, size);
  const rebuilt = new Map<string, string>();
  for (const d of deltas) rebuilt.set(d.path, (rebuilt.get(d.path) ?? "") + d.delta);
  ok(
    `chunked ${size}: the streamed file matches what was sent`,
    rebuilt.get("js/game.js") === fileText,
    JSON.stringify(rebuilt.get("js/game.js")?.slice(0, 40) ?? null),
  );
  ok(`chunked ${size}: the second file streams too`, rebuilt.get("js/shop.js") === "// shop\n");
  ok(`chunked ${size}: both files were announced`, starts.length === 2 && ops.length === 2);
  ok(`chunked ${size}: the envelope closed cleanly`, done?.truncated === false && done.count === 2);
}

// A delta must never carry another file's text. The scanner keys them on the
// announced path, and this is what proves the keying works rather than the
// deltas merely arriving in a lucky order.
{
  const { deltas } = await drainStream(envelope, 1);
  const game = deltas.filter((d) => d.path === "js/game.js").map((d) => d.delta).join("");
  ok("one file's deltas never contain another's", !game.includes("// shop"));
}

// A cut-off reply: the file being written when the stream died still arrives as
// far as it got, and the completed one before it survives as an operation.
{
  const cut = envelope.slice(0, envelope.indexOf("// shop") + 4);
  const { deltas, ops, done } = await drainStream(cut, 1);
  const rebuilt = deltas.filter((d) => d.path === "js/shop.js").map((d) => d.delta).join("");
  ok("a truncated stream still streams what arrived", rebuilt.startsWith("// s"), JSON.stringify(rebuilt));
  ok("and keeps the file that completed before the cut", ops.includes("js/game.js"));
  ok("and says it was truncated", done?.truncated === true);
}

// Deletes and renames have no content at all. The decoder must return nothing
// rather than throw or invent an empty file.
{
  const noContent = JSON.stringify({
    operations: [{ type: "delete", path: "old.js" }, { type: "rename", path: "a.js", newPath: "b.js" }],
    message: "Tidied up.",
  });
  const { deltas, ops } = await drainStream(noContent, 1);
  ok("an operation with no content streams no deltas", deltas.length === 0);
  ok("but still completes", ops.length === 2);
}
}


// The other half of the same feature: the frames the route sends have to reach
// the store the editor reads, and the store has to end up holding exactly the
// file. The server half is checked above against the model's own JSON; this is
// what happens to it on the way to the screen.

console.log("\nfrom the wire to the editor");

{
  const live = useLiveWrite.getState();
  live.end();

  const seen: string[] = [];
  const handlers = {
    onOpStart: (op: { type: string; path: string }) => {
      seen.push(`start:${op.path}`);
      useLiveWrite.getState().begin(op.path, op.type);
    },
    onOpDelta: (path: string, delta: string) => useLiveWrite.getState().append(path, delta),
    onOp: () => {},
    onDone: () => {},
    onError: () => {},
  };

  handleFrame({ t: "op_start", opType: "create", path: "js/game.js" }, handlers as never);
  ok("an op_start opens the live view", useLiveWrite.getState().path === "js/game.js");
  ok("and names what it is doing", useLiveWrite.getState().kind === "create");

  for (const piece of ["let n = 0;\n", "function tick() {\n", "  n++;\n", "}\n"]) {
    handleFrame({ t: "op_delta", path: "js/game.js", delta: piece }, handlers as never);
  }
  ok(
    "the deltas accumulate into the file",
    useLiveWrite.getState().content === "let n = 0;\nfunction tick() {\n  n++;\n}\n",
    JSON.stringify(useLiveWrite.getState().content),
  );

  // The guard that matters: frames for the previous file can still be in flight
  // when the next one is announced, and appending one file's tail to another
  // file's head would show the student code that was never written anywhere.
  const before = useLiveWrite.getState().content;
  handleFrame({ t: "op_delta", path: "css/theme.css", delta: "body { }" }, handlers as never);
  ok("a delta for another file is ignored", useLiveWrite.getState().content === before);

  handleFrame({ t: "op_start", opType: "modify", path: "index.html" }, handlers as never);
  ok("the next file starts from empty", useLiveWrite.getState().content === "");
  ok("and carries its own verb", useLiveWrite.getState().kind === "modify");

  useLiveWrite.getState().end();
  ok("ending the turn clears the live view", useLiveWrite.getState().path === null);
  ok("and stops claiming to be streaming", useLiveWrite.getState().streaming === false);
  ok("both files were announced on the way", seen.join(",") === "start:js/game.js,start:index.html");
}

// ---------------------------------------------------------------------------
// Against a provider that behaves like the broken ones did
// ---------------------------------------------------------------------------
//
// The two halves above only fit together if the watchdog's wording is the
// wording the cooldown matches on. Nothing in the type system says so, and if
// that sentence is ever reworded, silence quietly stops being remembered and
// the thirty seconds come back.

console.log("\nend to end, against a mock provider");

async function endToEnd(): Promise<void> {
const server = http.createServer((req, res) => {
  if (req.url === "/silent") {
    // Headers and then nothing, forever. This is what NVIDIA did.
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    return;
  }
  if (req.url === "/gone") {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: {
          message: "The model `llama-3.3-70b-versatile` does not exist or you do not have access to it.",
          code: "model_not_found",
        },
      }),
    );
    return;
  }
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "hello " } }] })}\n\n`);
  res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "world" } }] })}\n\n`);
  res.write("data: [DONE]\n\n");
  res.end();
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

const provider = (label: string, path: string) =>
  new OpenAiCompatibleProvider({ label, endpoint: base + path, apiKey: "not-a-real-key", model: "test-model" });

const request = { prompt: "hi", fileTree: "", contextFiles: {}, chatOnly: true, history: [] } as never;

async function drain(p: OpenAiCompatibleProvider, sliceMs: number): Promise<string> {
  let out = "";
  for await (const chunk of p.generateStream(request, undefined, {
    firstTokenTimeoutMs: sliceMs,
    idleTimeoutMs: sliceMs,
  })) {
    out += chunk;
  }
  return out;
}

ok("a working provider streams its text", (await drain(provider("good", "/ok"), 5_000)).includes("hello world"));

const startedAt = Date.now();
let silentError: unknown;
try {
  await drain(provider("quiet", "/silent"), 1_200);
} catch (err) {
  silentError = err;
}
const waited = Date.now() - startedAt;
ok("silence raises a timeout", silentError instanceof AiTimeoutError, (silentError as Error)?.message);
ok("silence is abandoned at the slice it was given", waited < 3_000, `waited ${waited}ms for a 1200ms slice`);

clearProviderCooldown("quiet");
ok(
  "and the wording the watchdog used is the wording the cooldown benches on",
  coolDownProvider("quiet", { message: (silentError as Error).message })?.source === "silent",
);
clearProviderCooldown("quiet");

let goneError: unknown;
try {
  await drain(provider("retired", "/gone"), 5_000);
} catch (err) {
  goneError = err;
}
ok("a retired model id surfaces as a 404", goneError instanceof ProviderHttpError && goneError.status === 404);
clearProviderCooldown("retired");
ok(
  "and the provider's own 404 text is benched as misconfigured",
  coolDownProvider("retired", {
    status: (goneError as ProviderHttpError).status,
    message: (goneError as Error).message,
  })?.source === "misconfigured",
);

server.close();
}

// Top-level await would make this file ESM, which under this package's CommonJS
// resolution loads provider.ts a second time and quietly breaks every
// instanceof check against it. A plain async function keeps one copy of each
// module, which is what the app has.
void streamingChecks()
  .then(endToEnd)
  .then(() => {
    console.log(failures === 0 ? "\nall good\n" : `\n${failures} failed\n`);
    process.exit(failures === 0 ? 0 : 1);
  });
