import { FileBraces, FileCode, FileImage, FileMusic, FileText, FileType, FileVideoCamera, File as FilePlain, Hash } from "lucide-react";
import type { LucideProps } from "lucide-react";
import type { ComponentType } from "react";
import { extensionOf } from "@/lib/assets";

// One icon per KIND of file, everywhere a file is listed: the tree, the tabs,
// the palette, the search results, the changes list.
//
// Every file used to wear the same blank page, so a folder of index.html,
// style.css and game.js read as three identical rows that had to be read
// letter by letter. A shape and a colour per kind lets a student find "the
// CSS one" from across the room, which is how people actually scan a tree.
//
// The colours are decorative — the name is always beside the icon — so they
// use the stock palette rather than theme tokens, at a weight that holds up on
// both a dark and a light ground. These glyphs are not in components/icons, so
// they are imported here directly with the same defaults that file applies.

type Kind = { Icon: ComponentType<LucideProps>; tone: string; label: string };

const CODE: Kind = { Icon: FileCode, tone: "text-amber-500", label: "JavaScript" };

const KINDS: Record<string, Kind> = {
  html: { Icon: FileCode, tone: "text-orange-500", label: "Web page" },
  htm: { Icon: FileCode, tone: "text-orange-500", label: "Web page" },
  css: { Icon: Hash, tone: "text-sky-500", label: "Stylesheet" },
  scss: { Icon: Hash, tone: "text-pink-500", label: "Stylesheet" },
  less: { Icon: Hash, tone: "text-indigo-400", label: "Stylesheet" },
  js: CODE,
  mjs: CODE,
  cjs: CODE,
  jsx: CODE,
  ts: { Icon: FileCode, tone: "text-blue-500", label: "TypeScript" },
  tsx: { Icon: FileCode, tone: "text-blue-500", label: "TypeScript" },
  py: { Icon: FileCode, tone: "text-blue-400", label: "Python" },
  json: { Icon: FileBraces, tone: "text-lime-500", label: "Data" },
  md: { Icon: FileText, tone: "text-[var(--text-dim)]", label: "Notes" },
  txt: { Icon: FileText, tone: "text-[var(--text-dim)]", label: "Text" },
  csv: { Icon: FileText, tone: "text-emerald-500", label: "Table" },
  svg: { Icon: FileImage, tone: "text-fuchsia-500", label: "Picture" },
  png: { Icon: FileImage, tone: "text-fuchsia-500", label: "Picture" },
  jpg: { Icon: FileImage, tone: "text-fuchsia-500", label: "Picture" },
  jpeg: { Icon: FileImage, tone: "text-fuchsia-500", label: "Picture" },
  gif: { Icon: FileImage, tone: "text-fuchsia-500", label: "Picture" },
  webp: { Icon: FileImage, tone: "text-fuchsia-500", label: "Picture" },
  avif: { Icon: FileImage, tone: "text-fuchsia-500", label: "Picture" },
  bmp: { Icon: FileImage, tone: "text-fuchsia-500", label: "Picture" },
  ico: { Icon: FileImage, tone: "text-fuchsia-500", label: "Picture" },
  mp3: { Icon: FileMusic, tone: "text-emerald-500", label: "Sound" },
  wav: { Icon: FileMusic, tone: "text-emerald-500", label: "Sound" },
  ogg: { Icon: FileMusic, tone: "text-emerald-500", label: "Sound" },
  m4a: { Icon: FileMusic, tone: "text-emerald-500", label: "Sound" },
  aac: { Icon: FileMusic, tone: "text-emerald-500", label: "Sound" },
  mp4: { Icon: FileVideoCamera, tone: "text-rose-500", label: "Video" },
  webm: { Icon: FileVideoCamera, tone: "text-rose-500", label: "Video" },
  woff: { Icon: FileType, tone: "text-violet-500", label: "Font" },
  woff2: { Icon: FileType, tone: "text-violet-500", label: "Font" },
  ttf: { Icon: FileType, tone: "text-violet-500", label: "Font" },
  otf: { Icon: FileType, tone: "text-violet-500", label: "Font" },
};

const OTHER: Kind = { Icon: FilePlain, tone: "text-[var(--text-faint)]", label: "File" };

export function fileKind(path: string): Kind {
  return KINDS[extensionOf(path)] ?? OTHER;
}

export function FileTypeIcon({ path, className = "h-4 w-4" }: { path: string; className?: string }) {
  const { Icon, tone } = fileKind(path);
  return <Icon aria-hidden="true" strokeWidth={1.85} className={`shrink-0 ${tone} ${className}`} />;
}
