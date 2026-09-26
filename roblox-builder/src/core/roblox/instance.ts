import type { RValue } from "./values";

/** One Roblox instance, as the project's files define it. */
export interface RNode {
  /** Stable id: the instance path, e.g. `game/ReplicatedStorage/Shared/Config`. */
  id: string;
  name: string;
  className: string;
  properties: Record<string, RValue>;
  attributes: Record<string, RValue>;
  tags: string[];
  children: RNode[];
  /** Script source, for Script/LocalScript/ModuleScript. */
  source?: string;
  /** The file (and JSON pointer, for model/project files) that defines this instance. */
  origin?: { file: string; pointer?: string };
  /** Rojo_Id, for Ref targets. */
  refId?: string;
  /** Property -> Rojo_Id of the target instance. */
  refTargets?: Record<string, string>;
  /** Defined in a binary file we cannot look inside. */
  opaque?: boolean;
}

export function walk(node: RNode, visit: (n: RNode, parent: RNode | undefined, depth: number) => void | false): void {
  const go = (n: RNode, parent: RNode | undefined, depth: number) => {
    if (visit(n, parent, depth) === false) return;
    for (const c of n.children) go(c, n, depth + 1);
  };
  go(node, undefined, 0);
}

export function findById(root: RNode, id: string): RNode | undefined {
  let found: RNode | undefined;
  walk(root, (n) => {
    if (found) return false;
    if (n.id === id) {
      found = n;
      return false;
    }
  });
  return found;
}

/** Index of every node by id, plus parent pointers. */
export function indexTree(root: RNode): { byId: Map<string, RNode>; parentOf: Map<string, RNode> } {
  const byId = new Map<string, RNode>();
  const parentOf = new Map<string, RNode>();
  walk(root, (n, p) => {
    byId.set(n.id, n);
    if (p) parentOf.set(n.id, p);
  });
  return { byId, parentOf };
}

/** `ReplicatedStorage.Shared.Config` style path, without the DataModel. */
export function dottedPath(id: string): string {
  return id.split("/").slice(1).join(".") || "game";
}

export function childNamed(node: RNode, name: string): RNode | undefined {
  return node.children.find((c) => c.name === name);
}

export function countNodes(root: RNode): number {
  let n = 0;
  walk(root, () => {
    n++;
  });
  return n;
}
