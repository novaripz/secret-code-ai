// The guard that stops Panda answering a student with its own briefing.
//
// Run with `npm run check:leak`, and with everything else by `npm run check`.
// Same shape as ai-chain.test.ts: plain asserts, no framework, non-zero exit.
//
// The two leaks asserted below are not invented. They were measured against
// production in one run of eight messages, and a later run of fourteen
// degenerate prompts leaked nothing — which is the reason this file exists at
// all. The bug cannot be reproduced on demand, so "I could not make it happen"
// is not evidence of anything. These checks pin the detector instead, because
// the detector is the part we can actually hold still.

import {
  LEAK_REPLACEMENT,
  MIN_LEAK_CHARS,
  MIN_LEAK_WORDS,
  PromptLeakGuard,
  leakedPromptText,
  normalizeWords,
} from "../../src/lib/ai/promptLeak";

let failures = 0;
function ok(name: string, condition: boolean, detail = ""): void {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures++;
}

/** Feeds a reply through the streaming guard the way the route does. */
function stream(reply: string, chunkSize = 4): { text: string; leaked: boolean } {
  const guard = new PromptLeakGuard();
  let out = "";
  for (let i = 0; i < reply.length; i += chunkSize) {
    const checked = guard.push(reply.slice(i, i + chunkSize));
    if (checked.leaked) return { text: LEAK_REPLACEMENT, leaked: true };
    out += checked.text;
  }
  return { text: out + guard.flush(), leaked: false };
}

// ---------------------------------------------------------------------------
// The leaks that actually reached students
// ---------------------------------------------------------------------------

console.log("\nthe two measured leaks");

// Sent in answer to "question number 4, answer in five words". Verbatim from
// the middle of a line of CHAT_SYSTEM_PROMPT, so a line-by-line comparison
// would have missed it.
const LEAK_ONE = "Never steer the conversation toward programming.";
// Sent in answer to "question number 5, answer in five words". Rung 2 of the
// ladder in TEACHING_POLICY with "2. The " shaved off the front, so an exact
// match on the rung would have missed it too.
const LEAK_TWO = "Concept the question is really testing.";

ok("the leak sent to question 4 is caught", leakedPromptText(LEAK_ONE) !== undefined);
ok("the leak sent to question 5 is caught", leakedPromptText(LEAK_TWO) !== undefined);
ok("it is caught mid-stream, before a byte of it is shown", stream(LEAK_ONE).leaked);
ok("and so is the second", stream(LEAK_TWO).leaked);
ok(
  "a leak the model then keeps talking past is still caught",
  stream(`${LEAK_ONE} Anyway, what are you working on?`).leaked,
);
ok(
  "casing and punctuation cannot dodge it",
  leakedPromptText("never steer the conversation toward programming!!!") !== undefined,
);
ok(
  "and neither can markdown around it",
  stream(`**${LEAK_TWO}**`).leaked,
  "bolded leaks are still leaks",
);
ok(
  "a leak is replaced by one honest sentence, not by silence",
  stream(LEAK_ONE).text === LEAK_REPLACEMENT && LEAK_REPLACEMENT.length > 0,
);
ok(
  "and the replacement says nothing about rules, prompts or policies",
  !/prompt|instruction|policy|rule|system/i.test(LEAK_REPLACEMENT),
  LEAK_REPLACEMENT,
);

// ---------------------------------------------------------------------------
// What a student must always be allowed to hear
// ---------------------------------------------------------------------------
//
// This is the half that matters more. A guard that eats an ordinary answer is
// worse than the bug it prevents, because it fires on every student rather
// than on a rare bad draw. Several of these deliberately share vocabulary with
// the prompt, and one of them — "Their question is the topic." — is a verbatim
// sentence OF the prompt that a person could sincerely say. It stays sayable
// because it is five words and twenty-seven characters, under both floors.

console.log("\nordinary replies, including ones that sound like the prompt");

const ORDINARY = [
  "Hey! What are you working on?",
  "Sure — what's the question?",
  "Their question is the topic.",
  "The answer is 42, and here's how you get there.",
  "A quadratic equation is one where the highest power is 2.",
  "You're Santi — that's what you told me.",
  "Which question do you mean? Paste it here and I'll take a look.",
  "The concept this is testing is conservation of momentum.",
  "Answer the first part and tell me what you get.",
  "Never give up on a proof just because the first line is ugly.",
  "Your question is really about how photosynthesis stores energy.",
  "I can't see that assignment from here — open it in your class and ask me there.",
  "Let's walk through it one step at a time.",
  "That's a good question about programming, actually.",
  "You have already done the work, so let's just check it.",
  "Try the first step and tell me what you get.",
  "No — the topic is the French Revolution, not the question itself.",
  "It's like a repeat block in Scratch, but written out in code.",
];

for (const reply of ORDINARY) {
  ok(`survives: "${reply}"`, leakedPromptText(reply) === undefined);
}

console.log("\nand they survive the streaming guard, byte for byte");

for (const reply of ORDINARY) {
  const streamed = stream(reply);
  ok(`streams whole: "${reply.slice(0, 32)}…"`, !streamed.leaked && streamed.text === reply);
}

ok(
  "chunk size cannot change the verdict",
  [1, 2, 3, 7, 40].every((n) => ORDINARY.every((r) => stream(r, n).text === r && !stream(r, n).leaked)) &&
    [1, 2, 3, 7, 40].every((n) => stream(LEAK_ONE, n).leaked && stream(LEAK_TWO, n).leaked),
  "a word split across two chunks is still one word",
);

// ---------------------------------------------------------------------------
// The thresholds, stated as facts rather than as numbers in a file
// ---------------------------------------------------------------------------

console.log("\nthe floors");

const SAFE = normalizeWords("Their question is the topic.");
ok(
  "the sentence that has to stay sayable is under both floors",
  SAFE.length < MIN_LEAK_WORDS && SAFE.join(" ").length < MIN_LEAK_CHARS,
  `${SAFE.length} words, ${SAFE.join(" ").length} chars`,
);
for (const leak of [LEAK_ONE, LEAK_TWO]) {
  const words = normalizeWords(leak);
  ok(
    `the real leak clears both floors: "${leak}"`,
    words.length >= MIN_LEAK_WORDS && words.join(" ").length >= MIN_LEAK_CHARS,
    `${words.length} words, ${words.join(" ").length} chars`,
  );
}
ok(
  "a few words of prompt vocabulary is never enough on its own",
  leakedPromptText("Answer the actual question") === undefined,
  "four words of verbatim prompt text stays clean",
);
ok(
  "six words of function words cannot trip the character floor",
  leakedPromptText("is it the one you were") === undefined,
);

// ---------------------------------------------------------------------------
// What it costs a normal reply
// ---------------------------------------------------------------------------
//
// The constraint this was designed against: the guard must not delay the first
// token. It holds text back only while that text is still verbatim prompt
// wording, so the measure that matters is how many characters an ordinary
// reply waits before its first byte is released.

console.log("\nwhat an ordinary reply pays");

function charsHeldBeforeFirstByte(reply: string, chunkSize = 4): number {
  const guard = new PromptLeakGuard();
  for (let i = 0; i < reply.length; i += chunkSize) {
    const checked = guard.push(reply.slice(i, i + chunkSize));
    if (checked.text) return i + chunkSize;
    if (checked.leaked) return -1;
  }
  return reply.length;
}

// "Their question is the topic." is excluded here because it is the one reply
// in the list that IS a verbatim sentence of the prompt, so the guard holds all
// twenty-eight characters of it until the stream ends and then delivers it
// whole (asserted above). That is the worst case by construction and the cost
// is bounded by the sentence being short; every other reply pays the cost this
// check is about.
const everydayReplies = ORDINARY.filter((r) => r !== "Their question is the topic.");
const held = everydayReplies.map((r) => charsHeldBeforeFirstByte(r));
const worst = Math.max(...held);
ok(
  "no ordinary reply waits more than a few characters for its first byte",
  worst <= 16,
  `worst ${worst} chars, median ${[...held].sort((a, b) => a - b)[Math.floor(held.length / 2)]}`,
);
ok(
  "the one reply that is verbatim prompt wording is held whole, then delivered whole",
  charsHeldBeforeFirstByte("Their question is the topic.") === "Their question is the topic.".length &&
    stream("Their question is the topic.").text === "Their question is the topic.",
);

console.log(failures === 0 ? "\nall good\n" : `\n${failures} failed\n`);
process.exit(failures === 0 ? 0 : 1);
