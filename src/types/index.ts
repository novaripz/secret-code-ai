// Core domain types shared across the app (client + server).

export type FileKind = "file" | "folder";

export interface FileNode {
  id: string;
  name: string;
  kind: FileKind;
  /** Full path from project root, e.g. "src/components/Button.tsx". Always forward-slash separated, no leading slash. */
  path: string;
  parentId: string | null;
  /** Only present for kind === "file" */
  content?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** Flat map of file/folder id -> node. Tree is reconstructed from parentId. */
  files: Record<string, FileNode>;
  /** Root-level ordering / bookkeeping */
  rootId: string;
}

export type ChatRole = "user" | "assistant" | "system";

export interface FileOperation {
  type: "create" | "modify" | "delete" | "rename";
  path: string;
  /** New content for create/modify */
  content?: string;
  /** New path for rename */
  newPath?: string;
}

export interface AgentResponse {
  operations: FileOperation[];
  message: string;
  /** Paths the UI should open in tabs after applying, in order */
  openFiles?: string[];
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
  /** Present on assistant messages that proposed file operations */
  proposedOperations?: FileOperation[];
  /** Whether proposedOperations have been applied already */
  applied?: boolean;
  /** Set if operations were rejected by the user */
  rejected?: boolean;
  error?: string;
}

export interface ConsoleEntry {
  id: string;
  level: "log" | "warn" | "error" | "info";
  text: string;
  timestamp: number;
}

export interface ProblemEntry {
  id: string;
  filePath: string;
  message: string;
  severity: "error" | "warning";
  line?: number;
}
