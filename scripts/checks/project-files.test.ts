// Two projects are two projects.
//
// The report was that files created in one project "seem to save into every
// project". Most of that turned out to be the starter seed -- every new project
// is given index.html, style.css and script.js, so all of them look alike on
// the first screen -- but the claim deserved to be checked rather than
// explained away, because the thing it describes would be a real data bug and
// an invisible one.
//
// Run with `npm run check`.

import { createEmptyProject, createFile, findByPath, listAllFiles, renameNode, deleteNode } from "../../src/lib/fileSystem";

let failures = 0;
function ok(name: string, condition: boolean, detail = ""): void {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures++;
}

console.log("\nprojects do not share state");

const a = createEmptyProject("Alpha");
const b = createEmptyProject("Beta");

ok("two projects get different ids", a.id !== b.id);
ok("and separate file maps", a.files !== b.files);

createFile(a, "js/shop.js", "// shop");
ok("a file created in one project is there", findByPath(a, "js/shop.js") !== undefined);
ok("and is not in the other", findByPath(b, "js/shop.js") === undefined);
ok("nor is the folder it made", findByPath(b, "js") === undefined);
ok("the other project is still empty", listAllFiles(b).length === 0, `${listAllFiles(b).length} files`);

// The root node id is the literal string "root" in every project. That is fine
// -- records are keyed by project id, so the ids never meet -- but it is
// exactly the kind of shared constant that would cause this symptom if the two
// file maps were ever merged, so it is pinned here on purpose.
ok("root ids collide by design, harmlessly", a.rootId === b.rootId && a.files[a.rootId] !== b.files[b.rootId]);

createFile(b, "js/shop.js", "// a different shop");
ok("the same path in both projects holds different content",
   findByPath(a, "js/shop.js")?.content !== findByPath(b, "js/shop.js")?.content);
ok("and different node ids", findByPath(a, "js/shop.js")!.id !== findByPath(b, "js/shop.js")!.id);

renameNode(a, "js/shop.js", "js/upgrades.js");
ok("renaming in one project leaves the other alone", findByPath(b, "js/shop.js") !== undefined);
deleteNode(a, "js/upgrades.js");
ok("deleting in one project leaves the other alone", findByPath(b, "js/shop.js") !== undefined);

console.log(failures === 0 ? "\nall good\n" : `\n${failures} failed\n`);
process.exit(failures === 0 ? 0 : 1);
