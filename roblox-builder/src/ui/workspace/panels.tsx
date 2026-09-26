"use client";

import { Bot, Box, Boxes, ClipboardCheck, Code2, FileCode2, Flame, FlaskConical, FolderTree, History, LayoutTemplate, MonitorPlay, PackageOpen, ScrollText, Settings2, SquareTerminal } from "lucide-react";
import { lazy, type ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import type { ProjectKind } from "@/core/roblox/template";

export interface PanelDef {
  title: string;
  icon: LucideIcon;
  component: ComponentType;
  robloxOnly?: boolean;
}

export const PANELS: Record<string, PanelDef> = {
  agent: { title: "Agent", icon: Bot, component: lazy(() => import("../panels/AgentPanel")) },
  files: { title: "Files", icon: FolderTree, component: lazy(() => import("../panels/FilesPanel")) },
  hierarchy: { title: "Explorer", icon: Boxes, component: lazy(() => import("../panels/HierarchyPanel")), robloxOnly: true },
  assets: { title: "Assets", icon: PackageOpen, component: lazy(() => import("../panels/AssetsPanel")) },
  editor: { title: "Code", icon: FileCode2, component: lazy(() => import("../panels/EditorPanel")) },
  preview: { title: "Preview", icon: MonitorPlay, component: lazy(() => import("../panels/PreviewPanel")) },
  "ui-editor": { title: "UI Editor", icon: LayoutTemplate, component: lazy(() => import("../panels/UIEditorPanel")), robloxOnly: true },
  viewport: { title: "3D", icon: Box, component: lazy(() => import("../panels/ViewportPanel")) },
  history: { title: "History", icon: History, component: lazy(() => import("../panels/HistoryPanel")) },
  forge: { title: "Forge", icon: Flame, component: lazy(() => import("../panels/ForgePanel")) },
  export: { title: "Export", icon: Code2, component: lazy(() => import("../panels/ExportPanel")) },
  settings: { title: "Project", icon: Settings2, component: lazy(() => import("../panels/SettingsPanel")) },
  checks: { title: "Compatibility", icon: ClipboardCheck, component: lazy(() => import("../panels/ChecksPanel")) },
  terminal: { title: "Terminal", icon: SquareTerminal, component: lazy(() => import("../panels/TerminalPanel")) },
  logs: { title: "Logs", icon: ScrollText, component: lazy(() => import("../panels/LogsPanel")) },
  tests: { title: "Tests", icon: FlaskConical, component: lazy(() => import("../panels/TestsPanel")) },
};

export function panelAvailable(id: string, kind?: ProjectKind): boolean {
  const def = PANELS[id];
  if (!def) return false;
  if (def.robloxOnly && kind === "web-app") return false;
  return true;
}
