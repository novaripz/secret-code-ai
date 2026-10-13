"use client";

import type { Monaco } from "@monaco-editor/react";
import type { editor as MonacoEditor, Position as MonacoPosition } from "monaco-editor";
import { useSyncExternalStore } from "react";
import { isDarkTheme, type ThemeName } from "@/store/useProfileStore";

// Everything the workspace teaches Monaco once, away from the component.

// ---------------------------------------------------------------------------
// THEMES: one Monaco theme per app theme
// ---------------------------------------------------------------------------
//
// Monaco ships its own themes, and left alone it stays on whichever one it
// booted with — which is how you end up with a white editor sitting in a dark
// app. The old fix flipped between a dark and a light theme, which left Ocean
// and Forest wearing a grey editor in a blue or green room. So each app theme
// now gets its own Monaco theme, built from the live CSS tokens the moment the
// theme is applied. Reading the tokens rather than repeating them means the
// editor can never drift from the rest of the workspace.

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** The theme on <html> right now, as a name ("dark", "ocean", …). */
function currentThemeName(): string {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme || "dark";
}

function subscribeTheme(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

/**
 * The app theme as a value React re-renders on. Watching the attribute rather
 * than the profile store catches every route by which the theme changes —
 * Settings, the top bar's toggle, a "system" theme following the OS at dusk.
 */
export function useAppThemeName(): string {
  return useSyncExternalStore(subscribeTheme, currentThemeName, () => "dark");
}

/** Six-digit hex, so an alpha suffix can be appended. */
function full(hex: string): string {
  if (hex.length === 4) return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  return hex.slice(0, 7);
}

/**
 * The one Monaco theme name the workspace uses. It is redefined in place when
 * the app theme changes; Monaco re-applies a theme that is redefined while in
 * use, so the editor never passes through a theme that does not exist yet.
 */
export const MONACO_THEME = "panda";

/** Defines (or redefines) the Monaco theme from the app theme now on screen, and returns its name. */
export function defineAppTheme(monaco: Monaco): string {
  const themeName = currentThemeName();
  const dark = isDarkTheme(themeName as ThemeName);
  const name = MONACO_THEME;
  const styles = getComputedStyle(document.documentElement);
  const token = (variable: string, fallback: string) => {
    const value = styles.getPropertyValue(variable).trim();
    // Monaco only accepts plain hex; anything else would throw and leave the
    // editor themeless.
    return HEX.test(value) ? full(value) : fallback;
  };
  const bg = token("--surface-1", dark ? "#16181f" : "#ffffff");
  const text = token("--text", dark ? "#eceef4" : "#0f1117");
  const dim = token("--text-dim", dark ? "#b3b8c7" : "#4a5163");
  const faint = token("--text-faint", dark ? "#878d9f" : "#666e81");
  const accent = token("--accent", "#6c5ce7");
  const accentText = token("--accent-text", dark ? "#a5a0ff" : "#4b3fe0");
  const accentSoft = token("--accent-soft", dark ? "#221f3d" : "#eeedfe");
  const line = token("--line", dark ? "#22252f" : "#e4e7ef");
  const lineStrong = token("--line-strong", dark ? "#323745" : "#cfd4e0");
  const s0 = token("--surface-0", bg);
  const s2 = token("--surface-2", bg);
  const s3 = token("--surface-3", bg);
  const success = token("--success", dark ? "#34d399" : "#0f7a52");
  const warn = token("--warn", dark ? "#fbbf24" : "#9a6400");
  const danger = token("--danger", dark ? "#f87171" : "#c0262d");
  const info = token("--info", dark ? "#60a5fa" : "#1d5fd1");
  const focus = token("--focus", accent);
  const fg = (hex: string) => hex.replace("#", "");

  try {
    monaco.editor.defineTheme(name, {
      base: dark ? "vs-dark" : "vs",
      inherit: true,
      // A handful of syntax colours from the theme's own status palette, so
      // the code in an Ocean editor looks like it belongs to Ocean. Everything
      // not named here keeps Monaco's own colouring.
      rules: [
        { token: "comment", foreground: fg(faint), fontStyle: "italic" },
        { token: "keyword", foreground: fg(accentText) },
        { token: "string", foreground: fg(success) },
        { token: "number", foreground: fg(warn) },
        { token: "tag", foreground: fg(info) },
        { token: "metatag", foreground: fg(info) },
        { token: "attribute.name", foreground: fg(accentText) },
        { token: "attribute.value", foreground: fg(success) },
        { token: "delimiter.html", foreground: fg(faint) },
        { token: "delimiter.xml", foreground: fg(faint) },
      ],
      colors: {
        focusBorder: focus,
        "editor.background": bg,
        "editor.foreground": text,
        "editorGutter.background": bg,
        "editorLineNumber.foreground": faint,
        "editorLineNumber.activeForeground": text,
        "editor.lineHighlightBackground": `${s2}99`,
        "editor.lineHighlightBorder": "#00000000",
        "editor.selectionBackground": `${accent}55`,
        "editor.inactiveSelectionBackground": `${accent}30`,
        "editor.selectionHighlightBackground": `${accent}22`,
        "editor.wordHighlightBackground": `${accent}1f`,
        "editor.findMatchBackground": `${warn}55`,
        "editor.findMatchHighlightBackground": `${warn}2a`,
        "editorCursor.foreground": accentText,
        "editorIndentGuide.background1": line,
        "editorIndentGuide.activeBackground1": lineStrong,
        "editorWhitespace.foreground": lineStrong,
        "editorBracketMatch.background": `${accent}26`,
        "editorBracketMatch.border": `${accent}88`,
        "editorError.foreground": danger,
        "editorWarning.foreground": warn,
        "editorInfo.foreground": info,
        "editorOverviewRuler.border": "#00000000",
        "minimap.background": bg,
        "scrollbarSlider.background": `${s3}aa`,
        "scrollbarSlider.hoverBackground": s3,
        "scrollbarSlider.activeBackground": lineStrong,
        "editorWidget.background": s0,
        "editorWidget.border": lineStrong,
        "editorSuggestWidget.background": s0,
        "editorSuggestWidget.border": lineStrong,
        "editorSuggestWidget.selectedBackground": accentSoft,
        "editorSuggestWidget.highlightForeground": accentText,
        "editorHoverWidget.background": s0,
        "editorHoverWidget.border": lineStrong,
        // Monaco's right-click menu is drawn by Monaco, from its OWN palette:
        // leave these out and the menu comes up white on a dark workspace.
        "menu.background": s0,
        "menu.foreground": dim,
        "menu.selectionBackground": accentSoft,
        "menu.selectionForeground": text,
        "menu.separatorBackground": line,
        "menu.border": lineStrong,
        // The find widget and the quick-input box (go to line) likewise.
        "input.background": s2,
        "input.foreground": text,
        "input.border": line,
        "inputOption.activeBorder": accent,
        "quickInput.background": s0,
        "quickInput.foreground": text,
        "list.hoverBackground": s2,
        "list.activeSelectionBackground": accentSoft,
        "list.activeSelectionForeground": text,
        "list.highlightForeground": accentText,
      },
    });
  } catch {
    // A malformed token shouldn't cost the student their editor.
  }
  return name;
}

// ---------------------------------------------------------------------------
// SNIPPETS, and `!`
// ---------------------------------------------------------------------------
//
// Typing `!` and pressing Enter to get a whole page skeleton is the first trick
// every web course teaches, and students arrive expecting it. Monaco has no
// Emmet, and pulling in a dependency for one keystroke is not worth it, so this
// is a completion provider with a short list of the things a beginner writes
// over and over. Each says what it is in the suggestion list, so the list
// teaches as well as saves typing.

const BOILERPLATE = [
  "<!DOCTYPE html>",
  '<html lang="en">',
  "<head>",
  '  <meta charset="UTF-8">',
  '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
  "  <title>${1:My page}</title>",
  '  <link rel="stylesheet" href="${2:style.css}">',
  "</head>",
  "<body>",
  "  $0",
  '  <script src="${3:script.js}"></script>',
  "</body>",
  "</html>",
].join("\n");

interface Snippet {
  label: string;
  detail: string;
  body: string;
}

const HTML_SNIPPETS: Snippet[] = [
  { label: "html:5", detail: "A whole web page to start from", body: BOILERPLATE },
  { label: "link:css", detail: "Use a stylesheet", body: '<link rel="stylesheet" href="${1:style.css}">' },
  { label: "script:src", detail: "Run a JavaScript file", body: '<script src="${1:script.js}"></script>' },
  { label: "canvas:game", detail: "A canvas to draw a game on", body: '<canvas id="${1:game}" width="${2:480}" height="${3:320}"></canvas>' },
  { label: "button:click", detail: "A button with an id to click", body: '<button id="${1:go}">${2:Click me}</button>' },
  { label: "img:alt", detail: "A picture, with words for screen readers", body: '<img src="${1:picture.png}" alt="${2:What the picture shows}">' },
];

const JS_SNIPPETS: Snippet[] = [
  { label: "log", detail: "console.log — print to the console", body: "console.log(${1:value});" },
  { label: "qs", detail: "Find an element on the page", body: 'const ${1:el} = document.querySelector("${2:#id}");' },
  { label: "click", detail: "Do something when it is clicked", body: '${1:button}.addEventListener("click", () => {\n  $0\n});' },
  { label: "keydown", detail: "Do something when a key is pressed", body: 'document.addEventListener("keydown", (event) => {\n  if (event.key === "${1:ArrowLeft}") {\n    $0\n  }\n});' },
  { label: "loop", detail: "A game loop that runs every frame", body: "function ${1:frame}() {\n  $0\n  requestAnimationFrame(${1:frame});\n}\nrequestAnimationFrame(${1:frame});" },
  { label: "random", detail: "A whole number from 0 up to (not including) max", body: "Math.floor(Math.random() * ${1:max})" },
  { label: "timeout", detail: "Wait, then do something once", body: "setTimeout(() => {\n  $0\n}, ${1:1000});" },
  { label: "arrow", detail: "A short function", body: "const ${1:name} = (${2:value}) => {\n  $0\n};" },
];

const CSS_SNIPPETS: Snippet[] = [
  { label: "center", detail: "Put things in the middle, both ways", body: "display: flex;\nalign-items: center;\njustify-content: center;" },
  { label: "grid:cards", detail: "Cards that wrap to fit any screen", body: "display: grid;\ngrid-template-columns: repeat(auto-fit, minmax(${1:200px}, 1fr));\ngap: ${2:16px};" },
  { label: "media:phone", detail: "Styles only for phone-sized screens", body: "@media (max-width: ${1:600px}) {\n  $0\n}" },
  { label: "transition", detail: "Animate changes smoothly", body: "transition: ${1:all} ${2:0.2s} ease;" },
];

const registered = new WeakSet<object>();

/** Registers the completion providers once per Monaco instance. */
export function registerPandaLanguageFeatures(monaco: Monaco): void {
  if (registered.has(monaco)) return;
  registered.add(monaco);

  const { CompletionItemKind, CompletionItemInsertTextRule } = monaco.languages;

  const provide = (language: string, snippets: Snippet[], bang = false) =>
    monaco.languages.registerCompletionItemProvider(language, {
      triggerCharacters: bang ? ["!"] : [],
      provideCompletionItems(model: MonacoEditor.ITextModel, position: MonacoPosition) {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };
        const suggestions = snippets.map((s) => ({
          label: s.label,
          kind: CompletionItemKind.Snippet,
          detail: s.detail,
          documentation: s.body.replace(/\$\{\d+:([^}]*)\}/g, "$1").replace(/\$\d/g, ""),
          insertText: s.body,
          insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
          range,
        }));
        if (bang) {
          // `!` on its own, at the start of a line or after a space. Not after
          // a `<`, where it is the start of a comment or a doctype someone is
          // typing by hand.
          const before = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
          if (/(^|\s)!$/.test(before)) {
            suggestions.unshift({
              label: "!",
              kind: CompletionItemKind.Snippet,
              detail: "A whole web page to start from",
              documentation: "Press Enter for a complete HTML page with a title, a stylesheet and a script.",
              insertText: BOILERPLATE,
              insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
              range: {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: position.column - 1,
                endColumn: position.column,
              },
            });
          }
        }
        return { suggestions };
      },
    });

  provide("html", HTML_SNIPPETS, true);
  provide("javascript", JS_SNIPPETS);
  provide("css", CSS_SNIPPETS);

  // An empty rule ({}) is what a student has for the second between typing
  // the braces and the first property, and a yellow squiggle for it on every
  // new rule teaches them to ignore yellow squiggles. The CSS defaults moved
  // namespaces between Monaco releases, so both homes are tried.
  const cssHome =
    (monaco as unknown as { css?: { cssDefaults?: CssDefaults } }).css?.cssDefaults ??
    (monaco.languages as unknown as { css?: { cssDefaults?: CssDefaults } }).css?.cssDefaults;
  try {
    cssHome?.setOptions?.({ validate: true, lint: { emptyRules: "ignore" } });
  } catch {
    // Older Monaco: the default lint stays, which is only noisier.
  }
}

interface CssDefaults {
  setOptions?: (options: { validate?: boolean; lint?: Record<string, "ignore" | "warning" | "error"> }) => void;
}
