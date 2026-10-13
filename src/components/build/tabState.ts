// The open tabs, worked out away from React and away from the store.
//
// Every one of the bugs this replaces was a tab that kept pointing at a path
// after the file behind it had moved or gone: rename a folder and its open
// files kept their old paths; let Panda delete a file and its tab stayed open
// on nothing; delete the file you were looking at and the editor went blank
// instead of showing the tab beside it. They are all the same question —
// "given what just happened to the files, what should the tab strip be?" — so
// it is answered once, here, where `npm run check` can ask it directly.

export interface TabLike {
  path: string;
  dirty: boolean;
}

/**
 * Where `path` ends up when `from` is renamed to `to`, or null if the rename
 * does not touch it. Compared as path SEGMENTS: renaming `styles` must not
 * drag along a tab on `styles-old.css`.
 */
export function retargetPath(path: string, from: string, to: string): string | null {
  if (path === from) return to;
  if (path.startsWith(`${from}/`)) return `${to}${path.slice(from.length)}`;
  return null;
}

/** Every tab inside a renamed file or folder, moved with it. */
export function renameTabs<T extends TabLike>(tabs: T[], from: string, to: string): T[] {
  return tabs.map((tab) => {
    const next = retargetPath(tab.path, from, to);
    return next === null ? tab : { ...tab, path: next };
  });
}

/** The active path after a rename, by the same rule. */
export function renameActive(active: string | null, from: string, to: string): string | null {
  if (!active) return active;
  return retargetPath(active, from, to) ?? active;
}

/**
 * Which tab to show when `closing` tabs go away and the active one is among
 * them: the nearest survivor to the right, else to the left — the tab the
 * student's eye was already next to. Null only when nothing is left open.
 */
export function neighbourAfterClosing(
  tabs: TabLike[],
  active: string | null,
  closing: (path: string) => boolean,
): string | null {
  const survivors = tabs.filter((t) => !closing(t.path));
  if (active && !closing(active)) return active;
  if (survivors.length === 0) return null;
  const index = active ? tabs.findIndex((t) => t.path === active) : -1;
  if (index === -1) return survivors[survivors.length - 1].path;
  for (let i = index + 1; i < tabs.length; i++) if (!closing(tabs[i].path)) return tabs[i].path;
  for (let i = index - 1; i >= 0; i--) if (!closing(tabs[i].path)) return tabs[i].path;
  return survivors[0].path;
}

/**
 * Drops every tab whose file no longer exists and moves the active tab to a
 * neighbour if it was one of them. Run after anything that may have deleted
 * files behind the tab strip's back — Panda's changes, the Changes panel's
 * undo, a restored version.
 */
export function reconcileTabs<T extends TabLike>(
  tabs: T[],
  active: string | null,
  exists: (path: string) => boolean,
): { tabs: T[]; activeTab: string | null } {
  const gone = (path: string) => !exists(path);
  return {
    tabs: tabs.filter((t) => exists(t.path)),
    activeTab: neighbourAfterClosing(tabs, active, gone),
  };
}

/**
 * The file to open when a project is opened with nothing remembered: the page
 * the preview will show, so the code and the result match on the first
 * screen. A project with no web page opens its first file instead of nothing —
 * an empty editor reading "pick a file" is a question the student should never
 * have to answer before they have seen anything.
 */
export function defaultFile(paths: string[]): string | null {
  if (paths.includes("index.html")) return "index.html";
  const sorted = [...paths].sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b));
  return sorted.find((p) => /\.html?$/i.test(p)) ?? sorted.find((p) => /\.(js|css|md|txt|json)$/i.test(p)) ?? sorted[0] ?? null;
}
