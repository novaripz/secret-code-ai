// The one diagnostic shape every checker in the system produces: the Luau
// analyzer, the Roblox project validator, the asset validator and the UI
// checks. The UI renders these as ✓ / ⚠ / ✕ and the repair engine consumes
// the optional `fix`.

export type Severity = "error" | "warning" | "info";

export type DiagnosticCategory =
  | "syntax"
  | "script"
  | "client-server"
  | "remote"
  | "security"
  | "hierarchy"
  | "reference"
  | "property"
  | "naming"
  | "ui"
  | "asset"
  | "dependency"
  | "deprecated"
  | "performance"
  | "project";

export interface TextEdit {
  line: number;
  col: number;
  endLine: number;
  endCol: number;
  text: string;
}

export type Fix =
  | { kind: "text-edits"; file: string; edits: TextEdit[]; description: string }
  | { kind: "move-file"; from: string; to: string; description: string }
  | { kind: "write-file"; file: string; content: string; description: string }
  | { kind: "json-patch"; file: string; pointer: string; value: unknown; remove?: boolean; description: string };

export interface Diagnostic {
  /** Stable rule id, e.g. `luau/syntax`, `roblox/client-server`. */
  rule: string;
  severity: Severity;
  category: DiagnosticCategory;
  message: string;
  file?: string;
  line?: number;
  col?: number;
  endLine?: number;
  endCol?: number;
  /** Dotted DataModel path, when the finding is about an instance. */
  instancePath?: string;
  fix?: Fix;
}

export function countBySeverity(diags: Diagnostic[]): Record<Severity, number> {
  const out: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  for (const d of diags) out[d.severity]++;
  return out;
}

export function sortDiagnostics(diags: Diagnostic[]): Diagnostic[] {
  const rank: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
  return [...diags].sort(
    (a, b) =>
      rank[a.severity] - rank[b.severity] ||
      (a.file ?? "").localeCompare(b.file ?? "") ||
      (a.line ?? 0) - (b.line ?? 0),
  );
}
