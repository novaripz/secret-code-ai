"use client";

import { AudioLines, Box, Boxes, Camera, Cog, Cuboid, Database, FileCode2, Folder, Frame, Image as ImageGlyph, Lamp, Layers, LayoutGrid, Link2, MousePointerClick, Radio, Server, Sparkles, SquareDashed, Sun, Type, User, Wrench, Zap } from "lucide-react";
import { getClass, isA } from "@/core/roblox/classes";
import { cx } from "./ui";

export function ClassIcon({ className, cls }: { className: string; cls?: string }) {
  const c = cx("size-3.5 shrink-0", cls);
  const cat = getClass(className)?.category;
  if (className === "DataModel") return <Boxes className={cx(c, "text-accent")} />;
  if (className === "Script") return <FileCode2 className={cx(c, "text-sky-400")} />;
  if (className === "LocalScript") return <FileCode2 className={cx(c, "text-emerald-400")} />;
  if (className === "ModuleScript") return <FileCode2 className={cx(c, "text-violet-400")} />;
  if (className === "Folder" || className === "Configuration") return <Folder className={cx(c, "text-amber-300/80")} />;
  if (className === "Workspace") return <Cuboid className={cx(c, "text-sky-300")} />;
  if (className === "Lighting") return <Sun className={cx(c, "text-yellow-300")} />;
  if (/^(ServerScriptService|ServerStorage)$/.test(className)) return <Server className={cx(c, "text-sky-300")} />;
  if (/^(ReplicatedStorage|ReplicatedFirst)$/.test(className)) return <Database className={cx(c, "text-teal-300")} />;
  if (/^(StarterGui)$/.test(className)) return <LayoutGrid className={cx(c, "text-fuchsia-300")} />;
  if (/^(StarterPlayer|StarterPlayerScripts|StarterCharacterScripts|Players)$/.test(className)) return <User className={cx(c, "text-emerald-300")} />;
  if (cat === "remote") return <Radio className={cx(c, "text-orange-400")} />;
  if (cat === "gui-root") return <LayoutGrid className={cx(c, "text-fuchsia-400")} />;
  if (className === "TextLabel" || className === "TextBox") return <Type className={cx(c, "text-fuchsia-300")} />;
  if (className === "TextButton" || className === "ImageButton") return <MousePointerClick className={cx(c, "text-fuchsia-300")} />;
  if (className === "ImageLabel") return <ImageGlyph className={cx(c, "text-fuchsia-300")} />;
  if (isA(className, "GuiObject")) return <Frame className={cx(c, "text-fuchsia-300")} />;
  if (cat === "gui-component") return <SquareDashed className={cx(c, "text-fg-3")} />;
  if (className === "Model") return <Layers className={cx(c, "text-cyan-300")} />;
  if (cat === "part") return <Box className={cx(c, "text-cyan-400")} />;
  if (cat === "constraint" || cat === "attachment") return <Link2 className={cx(c, "text-lime-300")} />;
  if (cat === "light") return <Lamp className={cx(c, "text-yellow-300")} />;
  if (cat === "effect") return <Sparkles className={cx(c, "text-pink-300")} />;
  if (cat === "sound") return <AudioLines className={cx(c, "text-indigo-300")} />;
  if (cat === "value") return <Zap className={cx(c, "text-yellow-400/80")} />;
  if (cat === "interaction") return <Wrench className={cx(c, "text-orange-300")} />;
  if (className === "Camera") return <Camera className={c} />;
  return <Cog className={cx(c, "text-fg-3")} />;
}
