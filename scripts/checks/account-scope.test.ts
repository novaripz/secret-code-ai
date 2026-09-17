// Two students on one classroom laptop are two students.
//
// This is the check for a real cross-student leak: lib/storage.ts and
// useMemoryStore.ts were the only two persistence modules in the app that
// never called accountScope(). Projects lived in a fixed "projects" store and
// the AI build log in a fixed "memory" store, so the second student to sign in
// on a shared machine opened /build and saw the first student's projects by
// name — and could open, edit and delete them — while Panda, fed the inherited
// build log as `projectMemory`, would describe the first student's project to
// the second.
//
// Everything here is asserted against the exported name-deriving functions
// rather than against IndexedDB, on purpose: the bug was entirely in how the
// store name was chosen, and a check that needs a browser is a check nobody
// runs. Run with `npx tsx scripts/checks/account-scope.test.ts`.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { claimLegacyProject, listLegacyProjects, projectsStoreName } from "../../src/lib/storage";
import { memoryStoreName } from "../../src/store/useMemoryStore";
import { accountScope } from "../../src/store/useAuthStore";

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel: string) => readFileSync(resolve(here, "../../src", rel), "utf8");

let failures = 0;
function ok(name: string, condition: boolean, detail = ""): void {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures++;
}

// accountScope() returns ":<account id>" for a signed-in student, so these are
// the shapes the real app passes in: two Supabase UUIDs.
const ALICE = ":8b1f0c2a-4f3d-4a11-9b60-1d2e3f4a5b6c";
const BOB = ":c7e9d410-22a8-4bd5-8f31-0a9b8c7d6e5f";
const GUEST = "";

console.log("\ntwo accounts cannot see each other's work");

ok("projects: two accounts get different stores", projectsStoreName(ALICE) !== projectsStoreName(BOB));
ok("memory: two accounts get different stores", memoryStoreName(ALICE) !== memoryStoreName(BOB));
ok("projects: neither account lands on the guest store",
   projectsStoreName(ALICE) !== projectsStoreName(GUEST) && projectsStoreName(BOB) !== projectsStoreName(GUEST));
ok("memory: neither account lands on the guest store",
   memoryStoreName(ALICE) !== memoryStoreName(GUEST) && memoryStoreName(BOB) !== memoryStoreName(GUEST));
ok("a store name carries the whole account id, so two ids never collapse together",
   projectsStoreName(ALICE).includes(ALICE.slice(1).replace(/-/g, "_")));

// The name is sanitised for IndexedDB. That is only safe if sanitising cannot
// map two different accounts onto one name, so pin that rather than assume it:
// the substitution is character-for-character, never a truncation.
ok("sanitising is length-preserving, so it cannot merge two accounts",
   projectsStoreName(ALICE).length === "projects".length + ALICE.length);
ok("and leaves nothing IndexedDB would have to reinterpret",
   /^[a-zA-Z0-9_]+$/.test(projectsStoreName(ALICE)) && /^[a-zA-Z0-9_]+$/.test(memoryStoreName(BOB)));

// The two modules must not collide with each other either, or a scoped project
// store would land on top of a scoped memory store for the same account.
ok("projects and memory stay separate stores within one account",
   projectsStoreName(ALICE) !== memoryStoreName(ALICE));

console.log("\nthe migration path: existing work is where it was, and is never deleted");

// This is the whole migration story. Everything written before the fix is in
// the bare "projects" / "memory" stores; a guest resolves to exactly those, so
// for a room where nobody signs in the fix changes nothing and no project
// moves, is copied, or disappears.
ok("guest projects resolve to the pre-fix store name", projectsStoreName(GUEST) === "projects");
ok("guest memory resolves to the pre-fix store name", memoryStoreName(GUEST) === "memory");
ok("in node, with nobody signed in, the app asks for exactly that store",
   projectsStoreName(accountScope()) === "projects" && memoryStoreName(accountScope()) === "memory",
   `scope ${JSON.stringify(accountScope())}`);

// The rejected option was to move the legacy store into the first account that
// signs in. Nobody can know whose work it is on a shared machine, so that hands
// one student the class's pooled projects under their own name. These assert
// the code contains no such adoption, and no destruction either: a student's
// work is never silently deleted, which is why neither module may drop or clear
// a store.
const storageSrc = src("lib/storage.ts");
const memorySrc = src("store/useMemoryStore.ts");
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

ok("lib/storage.ts never drops or clears a store", !/dropInstance|\.clear\s*\(/.test(code(storageSrc)));
ok("useMemoryStore never drops or clears a store", !/dropInstance|\.clear\s*\(/.test(code(memorySrc)));
// This assertion used to be "the string \"projects\" never appears in
// storage.ts", as a proxy for "nothing opens the legacy store". That proxy
// stopped matching the design: /build now shows a signed-in student the
// pre-sign-in projects and lets them claim one, by name, one at a time. The
// student is the only party who knows whose work it is, so asking them is the
// correct answer and the grep was banning it.
//
// So the invariant is pinned directly instead, and it is the one that actually
// protects a student. Adoption must be IMPOSSIBLE WITHOUT A DELIBERATE CLAIM,
// and a claim must never cost anyone their only copy:
//   - the legacy store is never opened while the module loads, so nothing can
//     happen to it just because a page was visited;
//   - claiming copies, never moves — no removeItem on the legacy store, so the
//     original is still there for whoever it really belongs to;
//   - and neither module may drop or clear a store, asserted above.
ok("useMemoryStore opens no second store at all", !code(memorySrc).includes('"memory"'));
ok(
  "the legacy store is only ever opened inside a function, never at module load",
  /function legacyStore\(\)/.test(code(storageSrc)) &&
    !/^const\s+\w+\s*=\s*localforage\.createInstance\([^)]*"projects"/m.test(code(storageSrc)),
);
ok(
  "claiming copies rather than moves, so the original survives a wrong guess",
  !/legacyStore\(\)[\s\S]{0,200}?removeItem/.test(code(storageSrc)),
);
ok("both modules actually scope, rather than hardcoding a name",
   code(storageSrc).includes("accountScope()") && code(memorySrc).includes("accountScope()"));

// Behaviour, not text. A guest must never be offered their own projects back
// as "older work" — for a guest the legacy store IS their store, so the offer
// would be a duplicate of everything they own.
// Wrapped in a function rather than awaited at the top level: top-level await
// makes this file ESM, which under this package's CommonJS resolution loads the
// modules under test a second time and quietly breaks every identity check
// against them. Same reason as the note in ai-chain.test.ts.
async function guestIsOfferedNothing(): Promise<void> {
  const legacyForGuest = await listLegacyProjects();
  ok("a guest is offered nothing to claim", Array.isArray(legacyForGuest) && legacyForGuest.length === 0);
  ok("and a guest cannot claim anything", (await claimLegacyProject("any-id")) === undefined);
}

console.log("\na guest still gets a working project list");

// accountScope() returning "" for a guest is deliberate — all guest state is
// shared between guests, and this check pins that rather than quietly changing
// it, because a classroom where nobody signs in is the common case and the one
// that must keep working. Two guests share a store by design; that is the same
// behaviour the app has always had for every other store.
ok("a guest gets a usable store name, not an empty one", projectsStoreName(GUEST).length > 0);
ok("two guests deliberately share one store", projectsStoreName(GUEST) === projectsStoreName(""));
ok("and guests share memory the same way", memoryStoreName(GUEST) === memoryStoreName(""));
ok("signing out returns a student to the store their pre-fix work is in",
   projectsStoreName(GUEST) === "projects" && projectsStoreName(ALICE) !== "projects");

void guestIsOfferedNothing().then(() => {
  console.log(failures === 0 ? "\nall good\n" : `\n${failures} failed\n`);
  process.exit(failures === 0 ? 0 : 1);
});
