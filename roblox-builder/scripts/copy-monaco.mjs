// Serves Monaco from this app instead of a CDN, so the editor works offline,
// behind corporate proxies and on locked-down networks.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const src = path.join(process.cwd(), "node_modules", "monaco-editor", "min", "vs");
const dest = path.join(process.cwd(), "public", "monaco", "vs");
if (!existsSync(src)) {
  console.warn("[copy-monaco] monaco-editor is not installed; the editor will fall back to its CDN");
  process.exit(0);
}
mkdirSync(path.dirname(dest), { recursive: true });
cpSync(src, dest, { recursive: true });
console.log("[copy-monaco] copied Monaco to public/monaco/vs");
