// What the chat promises about a reply that did not finish.
//
// Run with `npx tsx scripts/checks/assistant-chat.test.ts`. No framework: a few
// asserted facts and a non-zero exit, the same shape as ai-chain.test.ts.
//
// Every case here is a bug a student actually hit. The provider chain
// propagates a mid-stream failure rather than retrying it (src/lib/ai/chain.ts:
// once words have reached the student they are never replayed), so a partial
// answer followed by an error is a NORMAL ending in this app. The chat rendered
// `m.error ? <box> : m.content ? <text> : null`, which meant that normal ending
// deleted three paragraphs of a worked explanation the student was halfway
// through — permanently, because the text is persisted with the flag.
//
// These are components, so there is no DOM here. What is checked is the part
// that can be wrong without a screen: the store's state transitions, and the
// pure predicates the render now asks instead of inlining the logic.

import {
  isAbandonedStream,
  isCutShort,
  pruneAbandonedStreams,
  showsText,
  usableAsHistory,
  useAssistantStore,
  type AssistantMessage,
} from "../../src/store/useAssistantStore";

let failures = 0;
function ok(name: string, condition: boolean, detail = ""): void {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures++;
}

function msg(over: Partial<AssistantMessage> = {}): AssistantMessage {
  return { id: "m", role: "assistant", content: "", createdAt: 0, ...over };
}

const partial = msg({ content: "Step 1: divide both sides by 2.", error: "Panda lost the connection." });
const bare = msg({ content: "", error: "Panda lost the connection." });
const plain = msg({ content: "Because 2x = 10, x = 5." });

// ---------------------------------------------------------------------------
// The answer the student was reading
// ---------------------------------------------------------------------------

console.log("\nwhat a cut-short reply still shows");

ok("a reply that broke mid-stream still draws its text", showsText(partial));
ok("and is marked as cut short, not as a plain failure", isCutShort(partial));
ok("a turn that failed before speaking has nothing to draw", !showsText(bare));
ok("and is not a cut-short reply", !isCutShort(bare));
ok("an ordinary reply draws its text", showsText(plain));
ok("and carries no notice", !isCutShort(plain));
ok("an empty non-error message draws nothing", !showsText(msg()));

// ---------------------------------------------------------------------------
// What Panda is reminded it said
// ---------------------------------------------------------------------------
//
// The old filter was `m.content && !m.error`, so the student could see three
// paragraphs Panda had no memory of writing. The next turn then either repeated
// them word for word or contradicted them.

console.log("\nhistory");

{
  const thread = [msg({ id: "u", role: "user", content: "solve 2x = 10" }), partial, bare, msg()];
  const kept = usableAsHistory(thread).map((m) => m.id);
  ok("the partial answer is remembered", usableAsHistory(thread).includes(partial));
  ok("a turn that said nothing is not", !usableAsHistory(thread).includes(bare));
  ok("and neither is an empty placeholder", kept.length === 2, kept.join(","));
  ok("the student's own message survives", usableAsHistory(thread)[0].role === "user");
}

// ---------------------------------------------------------------------------
// The placeholder nobody came back for
// ---------------------------------------------------------------------------

console.log("\nabandoned streams");

const abandoned = msg({ streaming: true });
ok("an empty streaming bubble is abandoned", isAbandonedStream(abandoned));
ok("one with text is not — that is a live reply", !isAbandonedStream(msg({ content: "hi", streaming: true })));
ok("one that recorded an error is not — it has something to say", !isAbandonedStream(msg({ streaming: true, error: "x" })));
ok("a finished message is never abandoned", !isAbandonedStream(plain));
ok(
  "a thread read off disk loses the placeholder and keeps the rest",
  pruneAbandonedStreams([plain, abandoned, partial]).length === 2,
);

// ---------------------------------------------------------------------------
// The store's own transitions
// ---------------------------------------------------------------------------
//
// localforage has no IndexedDB under tsx, so `save` rejects in the background.
// That is fine and is the point of the first check below: the in-memory state
// these assertions read is set synchronously, before any write is attempted.

console.log("\nthe store");

const store = useAssistantStore;

{
  store.getState().newThread();
  store.getState().addUserMessage("solve 2x = 10");
  const id = store.getState().startAssistantMessage();
  const opened = store.getState().activeThread!.messages.at(-1)!;
  ok("starting a reply opens an empty streaming bubble", opened.streaming === true && opened.content === "");

  store.getState().appendToAssistantMessage(id, "Step 1: divide ");
  store.getState().appendToAssistantMessage(id, "both sides by 2.");
  ok(
    "chunks accumulate",
    store.getState().activeThread!.messages.at(-1)!.content === "Step 1: divide both sides by 2.",
  );

  // The mid-stream failure: the route wrote an error frame after the text.
  store.getState().finishAssistantMessage(id, "Panda lost the connection.");
  const done = store.getState().activeThread!.messages.find((m) => m.id === id)!;
  ok("the text that arrived is kept", done.content === "Step 1: divide both sides by 2.");
  ok("the failure is recorded alongside it", done.error === "Panda lost the connection.");
  ok("and the panda stops animating", done.streaming === false);
  ok("the student still sees the answer", showsText(done));
  ok("with a notice rather than a red box in its place", isCutShort(done));
  ok("and Panda can be reminded of it", usableAsHistory(store.getState().activeThread!.messages).includes(done));
}

{
  // Pressing Stop before the first token. The component passes no error in that
  // case; what is checked here is that the store does not invent one, so the
  // deliberate stop cannot come back as "The reply came back empty."
  store.getState().newThread();
  store.getState().addUserMessage("hi");
  const id = store.getState().startAssistantMessage();
  store.getState().finishAssistantMessage(id, undefined);
  const stopped = store.getState().activeThread!.messages.find((m) => m.id === id)!;
  ok("a stop before the first token is not an error", stopped.error === undefined);
  ok("and nothing is left claiming to stream", stopped.streaming === false);
  ok("it also draws nothing at all, rather than an empty bubble", !showsText(stopped) && !isCutShort(stopped));
}

{
  // An error recorded on an earlier finish is never wiped by a later one.
  store.getState().newThread();
  store.getState().addUserMessage("hi");
  const id = store.getState().startAssistantMessage();
  store.getState().finishAssistantMessage(id, "Panda lost the connection.");
  store.getState().finishAssistantMessage(id, undefined);
  ok(
    "a second finish does not erase the failure",
    store.getState().activeThread!.messages.find((m) => m.id === id)!.error === "Panda lost the connection.",
  );
}

console.log(failures === 0 ? "\nall good\n" : `\n${failures} failed\n`);
process.exit(failures === 0 ? 0 : 1);
