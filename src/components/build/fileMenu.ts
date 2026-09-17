// What the file tree's menus contain, worked out away from React.
//
// This is a separate module from the menu component and from the explorer on
// purpose. "Which entries does a folder get, and which of them are greyed out"
// is the part of a context menu that is easy to get quietly wrong — an entry
// that deletes the project root, a Collapse on an already-collapsed folder, a
// Duplicate that overwrites the file it was copying — and it is also the part
// that needs no DOM to check. Kept here it can be asserted in
// scripts/checks/context-menu.test.ts; kept inside the component it could only
// ever be checked by hand, in a browser, on whichever theme happened to be on.
//
// Labels are plain English rather than i18n keys because every other component
// under build/ is (the editor, the palette, the agent panel). Mixing the two
// inside one menu would be worse than either.

import { fileName, parentPath } from "@/lib/paths";

export type MenuActionId =
  | "open"
  | "rename"
  | "duplicate"
  | "delete"
  | "copyPath"
  | "copyRelativePath"
  | "download"
  | "newFile"
  | "newFolder"
  | "collapse"
  | "collapseAll";

export interface MenuItemSpec {
  id: MenuActionId;
  label: string;
  /** Shown greyed on the right. The SAME shortcut must really work; see FileExplorer. */
  shortcut?: string;
  /** Draws in --danger and asks before it does anything. */
  danger?: boolean;
  /** Present but not runnable, rather than absent: a menu whose entries move around is a menu you have to read every time. */
  disabled?: boolean;
  /** A hairline above this entry, grouping what came before it. */
  separatorBefore?: boolean;
}

export interface FileMenuContext {
  /** The project root cannot be renamed or deleted, and nothing else is exempt. */
  isRoot?: boolean;
}

export interface FolderMenuContext extends FileMenuContext {
  /** A collapsed folder has nothing to collapse. */
  expanded: boolean;
}

/** Entries for a right-click on a file row. */
export function buildFileMenu(ctx: FileMenuContext = {}): MenuItemSpec[] {
  const locked = ctx.isRoot === true;
  return [
    { id: "open", label: "Open", shortcut: "Enter" },
    { id: "rename", label: "Rename…", shortcut: "F2", disabled: locked, separatorBefore: true },
    { id: "duplicate", label: "Duplicate", shortcut: "Ctrl D" },
    { id: "delete", label: "Delete", shortcut: "Del", danger: true, disabled: locked },
    { id: "copyPath", label: "Copy path", separatorBefore: true },
    { id: "copyRelativePath", label: "Copy relative path" },
    { id: "download", label: "Download" },
    { id: "newFile", label: "New file here…", separatorBefore: true },
    { id: "newFolder", label: "New folder here…" },
  ];
}

/** Entries for a right-click on a folder row. */
export function buildFolderMenu(ctx: FolderMenuContext): MenuItemSpec[] {
  const locked = ctx.isRoot === true;
  return [
    { id: "newFile", label: "New file…" },
    { id: "newFolder", label: "New folder…" },
    { id: "rename", label: "Rename…", shortcut: "F2", disabled: locked, separatorBefore: true },
    { id: "delete", label: "Delete", shortcut: "Del", danger: true, disabled: locked },
    { id: "copyPath", label: "Copy path", separatorBefore: true },
    { id: "collapse", label: "Collapse", shortcut: "←", disabled: !ctx.expanded },
  ];
}

/** Entries for a right-click on the empty space below the tree. */
export function buildEmptyMenu(): MenuItemSpec[] {
  return [
    { id: "newFile", label: "New file…" },
    { id: "newFolder", label: "New folder…" },
    { id: "collapseAll", label: "Collapse all folders", separatorBefore: true },
  ];
}

/**
 * Splits a name into the part that gets " copy" appended and the extension that
 * stays on the end, so a duplicate of `script.js` is `script copy.js` and not
 * `script.js copy` — which is a file the preview would refuse to run and the
 * student would have to rename by hand.
 *
 * A leading dot is a dotfile, not an extension: `.gitignore` duplicates to
 * `.gitignore copy`, because `. copy gitignore` is nonsense.
 */
export function splitExtension(name: string): { stem: string; ext: string } {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return { stem: name, ext: "" };
  return { stem: name.slice(0, dot), ext: name.slice(dot) };
}

/**
 * The path a duplicate should take, given a way to ask whether a path is
 * already in use. It counts upward rather than failing, because a student who
 * hits Duplicate twice means it twice; the alternative is an error dialog
 * saying the obvious.
 *
 * `taken` is passed in rather than the project, so this can be checked without
 * building one, and so it cannot accidentally reach for anything else.
 */
export function duplicatePath(path: string, taken: (candidate: string) => boolean): string {
  const parent = parentPath(path);
  const { stem, ext } = splitExtension(fileName(path));
  const join = (name: string) => (parent ? `${parent}/${name}` : name);

  let candidate = join(`${stem} copy${ext}`);
  // A cap rather than a while(true): a `taken` that always answers yes would
  // otherwise hang the tab, and there is no honest number of copies above this.
  for (let n = 2; taken(candidate) && n < 500; n++) {
    candidate = join(`${stem} copy ${n}${ext}`);
  }
  return candidate;
}

/**
 * The two "copy path" answers. There is no filesystem behind this project, so
 * "absolute" can only mean "from the project", and saying the project's name
 * out loud is what makes the two entries different from each other rather than
 * mysteriously identical — which is how a student decides the menu is broken.
 */
export function displayPath(projectName: string, path: string): string {
  const safeName = projectName.trim() || "project";
  return `${safeName}/${path}`;
}
