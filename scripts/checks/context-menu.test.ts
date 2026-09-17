// What the file tree's menus offer, and what a duplicate is called.
//
// The menus themselves are React and a browser away, but the decisions inside
// them are not: which entries a folder gets, which of them are greyed out, and
// what path "Duplicate" picks are all plain functions in
// src/components/build/fileMenu.ts precisely so they can be asserted here. The
// two that would actually hurt a student are pinned hardest:
//
// * A duplicate must never land on a path that already exists, because the
//   store's copyNode throws on a collision and the student would get an error
//   dialog for pressing a button that should always work.
// * The extension has to survive. `script.js copy` is not JavaScript, and the
//   preview would stop running the moment somebody duplicated a file.
//
// Run with `tsx scripts/checks/context-menu.test.ts`.

import {
  buildEmptyMenu,
  buildFileMenu,
  buildFolderMenu,
  displayPath,
  duplicatePath,
  splitExtension,
  type MenuActionId,
  type MenuItemSpec,
} from "../../src/components/build/fileMenu";
import { createEmptyProject, createFile, createFolder, copyNode, findByPath } from "../../src/lib/fileSystem";

let failures = 0;
function ok(name: string, condition: boolean, detail = ""): void {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures++;
}

const ids = (items: MenuItemSpec[]) => items.map((i) => i.id);
const find = (items: MenuItemSpec[], id: MenuActionId) => items.find((i) => i.id === id);

console.log("\nthe file menu");

const file = buildFileMenu();
ok("offers everything the brief asked for on a file",
   (["open", "rename", "duplicate", "delete", "copyPath", "copyRelativePath", "download", "newFile", "newFolder"] as MenuActionId[])
     .every((id) => ids(file).includes(id)),
   ids(file).join(", "));
ok("marks delete as dangerous", find(file, "delete")?.danger === true);
ok("and nothing else", file.filter((i) => i.danger).length === 1);
ok("nothing on a normal file is greyed out", file.every((i) => !i.disabled));
ok("every entry has a label", file.every((i) => i.label.trim().length > 0));
ok("ids are unique", new Set(ids(file)).size === file.length);

const rootFile = buildFileMenu({ isRoot: true });
ok("the project root cannot be renamed", find(rootFile, "rename")?.disabled === true);
ok("or deleted", find(rootFile, "delete")?.disabled === true);
ok("but is still copyable", find(rootFile, "copyPath")?.disabled !== true);
ok("and the entries stay in the same order, disabled or not",
   ids(rootFile).join(",") === ids(file).join(","));

console.log("\nthe folder menu");

const openFolder = buildFolderMenu({ expanded: true });
ok("a folder can make files and folders inside itself",
   ids(openFolder).includes("newFile") && ids(openFolder).includes("newFolder"));
ok("an open folder can be collapsed", find(openFolder, "collapse")?.disabled !== true);
ok("a closed one cannot", find(buildFolderMenu({ expanded: false }), "collapse")?.disabled === true);
ok("a folder is not downloadable on its own", !ids(openFolder).includes("download"));
ok("and has no Open entry — clicking it already toggles it", !ids(openFolder).includes("open"));

console.log("\nthe empty-space menu");

const empty = buildEmptyMenu();
ok("empty space offers new file, new folder and collapse all",
   ids(empty).join(",") === "newFile,newFolder,collapseAll");
ok("and nothing destructive, because nothing was pointed at",
   empty.every((i) => !i.danger));

console.log("\nnames and extensions");

ok("a normal name splits at the last dot", splitExtension("script.js").ext === ".js");
ok("a name with two dots keeps only the last as the extension",
   splitExtension("styles.min.css").stem === "styles.min");
ok("a dotfile is all stem", splitExtension(".gitignore").ext === "");
ok("a name with no dot is all stem", splitExtension("README").ext === "");

console.log("\nduplicate paths");

const nothingTaken = () => false;
ok("a duplicate keeps the extension", duplicatePath("script.js", nothingTaken) === "script copy.js");
ok("and stays in its folder", duplicatePath("js/script.js", nothingTaken) === "js/script copy.js");
ok("a folder duplicates without inventing an extension",
   duplicatePath("images", nothingTaken) === "images copy");
ok("a dotfile duplicates sensibly", duplicatePath(".gitignore", nothingTaken) === ".gitignore copy");

const taken = new Set(["script copy.js", "script copy 2.js"]);
ok("it counts past names already in use",
   duplicatePath("script.js", (p) => taken.has(p)) === "script copy 3.js");
// A `taken` that always says yes is the shape of a bug elsewhere; this must
// still return rather than spin the tab forever.
ok("and gives up rather than hanging when everything is taken",
   typeof duplicatePath("a.js", () => true) === "string");

console.log("\nthe two copy-path answers");

ok("copy path is qualified by the project", displayPath("My Game", "js/app.js") === "My Game/js/app.js");
ok("an unnamed project still copies something usable", displayPath("   ", "a.js") === "project/a.js");
ok("the two entries give different answers", displayPath("My Game", "a.js") !== "a.js");

console.log("\nduplicate against a real project");

const project = createEmptyProject("Demo");
createFile(project, "js/script.js", "// original");
createFolder(project, "images");
createFile(project, "images/logo.svg", "<svg/>");

const isTaken = (p: string) => findByPath(project, p) !== undefined;
const first = duplicatePath("js/script.js", isTaken);
copyNode(project, "js/script.js", first);
ok("the copy exists", findByPath(project, first) !== undefined, first);
ok("with the same contents", findByPath(project, first)?.content === "// original");
ok("and the original is untouched", findByPath(project, "js/script.js")?.content === "// original");

const second = duplicatePath("js/script.js", isTaken);
ok("duplicating again picks a free name", second !== first, second);
copyNode(project, "js/script.js", second);
ok("so the second copy lands too", findByPath(project, second) !== undefined);

const folderCopy = duplicatePath("images", isTaken);
copyNode(project, "images", folderCopy);
ok("a folder copies with what is inside it",
   findByPath(project, `${folderCopy}/logo.svg`)?.content === "<svg/>");
ok("and the original folder keeps its file", findByPath(project, "images/logo.svg") !== undefined);

console.log(failures === 0 ? "\nall good\n" : `\n${failures} failed\n`);
process.exit(failures === 0 ? 0 : 1);
