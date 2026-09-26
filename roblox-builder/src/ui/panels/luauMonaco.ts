// Luau language support for Monaco: tokenizer, configuration, and themes.

import type * as Monaco from "monaco-editor";

let registered = false;

export function registerLuau(monaco: typeof Monaco): void {
  if (registered) return;
  registered = true;
  monaco.languages.register({ id: "luau", extensions: [".luau", ".lua"], aliases: ["Luau"] });
  monaco.languages.setLanguageConfiguration("luau", {
    comments: { lineComment: "--", blockComment: ["--[[", "]]"] },
    brackets: [
      ["{", "}"],
      ["[", "]"],
      ["(", ")"],
    ],
    autoClosingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: '"', close: '"', notIn: ["string"] },
      { open: "'", close: "'", notIn: ["string"] },
      { open: "`", close: "`", notIn: ["string"] },
    ],
    indentationRules: {
      increaseIndentPattern: /^\s*((local\s+)?function\b.*|.*\b(then|do|repeat)\b\s*(--.*)?$|.*\{\s*$|.*\(\s*$)/,
      decreaseIndentPattern: /^\s*(end|else|elseif|until|\}|\))/,
    },
  });
  monaco.languages.setMonarchTokensProvider("luau", {
    defaultToken: "",
    keywords: ["and", "break", "do", "else", "elseif", "end", "false", "for", "function", "if", "in", "local", "nil", "not", "or", "repeat", "return", "then", "true", "until", "while", "continue", "export", "type", "typeof"],
    builtins: ["game", "workspace", "script", "task", "Instance", "Vector3", "Vector2", "CFrame", "Color3", "UDim", "UDim2", "Enum", "TweenInfo", "require", "print", "warn", "error", "pairs", "ipairs", "math", "string", "table", "coroutine", "tostring", "tonumber", "typeof", "pcall", "xpcall", "assert", "setmetatable", "getmetatable", "self", "BrickColor", "Ray", "RaycastParams", "NumberSequence", "ColorSequence", "NumberRange", "buffer", "utf8", "os", "debug", "select", "next", "rawget", "rawset", "Random", "DateTime"],
    tokenizer: {
      root: [
        [/--\[(=*)\[/, { token: "comment", next: "@longComment.$1" }],
        [/--!.*$/, "keyword.directive"],
        [/--.*$/, "comment"],
        [/\[(=*)\[/, { token: "string", next: "@longString.$1" }],
        [/`/, { token: "string.interp", next: "@interp" }],
        [/"([^"\\]|\\.)*$/, "string.invalid"],
        [/'([^'\\]|\\.)*$/, "string.invalid"],
        [/"/, "string", "@dq"],
        [/'/, "string", "@sq"],
        [/0[xX][0-9a-fA-F_]+/, "number.hex"],
        [/0[bB][01_]+/, "number"],
        [/\d[\d_]*(\.\d[\d_]*)?([eE][+-]?\d+)?/, "number"],
        [/@[a-zA-Z_]\w*/, "annotation"],
        [/(:)(\s*)([A-Z][\w.]*)/, ["delimiter", "", "type.identifier"]],
        [/[a-zA-Z_]\w*(?=\s*\()/, { cases: { "@keywords": "keyword", "@builtins": "predefined", "@default": "function" } }],
        [/[a-zA-Z_]\w*/, { cases: { "@keywords": "keyword", "@builtins": "predefined", "@default": "identifier" } }],
        [/[{}()[\]]/, "@brackets"],
        [/(\.\.\.|\.\.=?|[+\-*/%^#]=?|\/\/=?|==|~=|<=|>=|<|>|=|::|->)/, "operator"],
        [/[;,.:]/, "delimiter"],
      ],
      longComment: [
        [/\](=*)\]/, { cases: { "$1==$S2": { token: "comment", next: "@pop" }, "@default": "comment" } }],
        [/./, "comment"],
      ],
      longString: [
        [/\](=*)\]/, { cases: { "$1==$S2": { token: "string", next: "@pop" }, "@default": "string" } }],
        [/./, "string"],
      ],
      dq: [
        [/[^\\"]+/, "string"],
        [/\\./, "string.escape"],
        [/"/, "string", "@pop"],
      ],
      sq: [
        [/[^\\']+/, "string"],
        [/\\./, "string.escape"],
        [/'/, "string", "@pop"],
      ],
      interp: [
        [/\{/, { token: "delimiter.bracket", next: "@interpExpr" }],
        [/[^`{\\]+/, "string.interp"],
        [/\\./, "string.escape"],
        [/`/, { token: "string.interp", next: "@pop" }],
      ],
      interpExpr: [
        [/\}/, { token: "delimiter.bracket", next: "@pop" }],
        { include: "root" },
      ],
    },
  } as Monaco.languages.IMonarchLanguage);

  const base = {
    "keyword": "c792ea",
    "keyword.directive": "7e8aa9",
    "predefined": "82aaff",
    "function": "82e3ff",
    "type.identifier": "ffcb6b",
    "string": "c3e88d",
    "string.interp": "c3e88d",
    "string.escape": "89ddff",
    "number": "f78c6c",
    "comment": "5f6b86",
    "operator": "89ddff",
    "annotation": "ffcb6b",
  };
  monaco.editor.defineTheme("rb-dark", {
    base: "vs-dark",
    inherit: true,
    rules: Object.entries(base).map(([token, foreground]) => ({ token, foreground, fontStyle: token === "comment" ? "italic" : undefined })),
    colors: {
      "editor.background": "#0f1118",
      "editor.lineHighlightBackground": "#161a24",
      "editorLineNumber.foreground": "#3a4154",
      "editorLineNumber.activeForeground": "#a6adbf",
      "editorGutter.background": "#0f1118",
      "editor.selectionBackground": "#8b7bff40",
      "editorCursor.foreground": "#8b7bff",
      "editorIndentGuide.background1": "#1d2130",
      "editorWidget.background": "#131621",
      "editorSuggestWidget.background": "#131621",
      "scrollbarSlider.background": "#ffffff14",
    },
  });
  monaco.editor.defineTheme("rb-light", {
    base: "vs",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "7c3aed" },
      { token: "predefined", foreground: "2563eb" },
      { token: "function", foreground: "0e7490" },
      { token: "type.identifier", foreground: "b45309" },
      { token: "string", foreground: "15803d" },
      { token: "string.interp", foreground: "15803d" },
      { token: "number", foreground: "c2410c" },
      { token: "comment", foreground: "94a3b8", fontStyle: "italic" },
    ],
    colors: { "editor.background": "#ffffff", "editor.lineHighlightBackground": "#f5f6fa" },
  });
}

export function languageFor(path: string): string {
  if (/\.(luau|lua)$/.test(path)) return "luau";
  if (/\.json$/.test(path)) return "json";
  if (/\.(ts|tsx)$/.test(path)) return "typescript";
  if (/\.(js|mjs|jsx)$/.test(path)) return "javascript";
  if (/\.css$/.test(path)) return "css";
  if (/\.html?$/.test(path)) return "html";
  if (/\.md$/.test(path)) return "markdown";
  if (/\.toml$/.test(path)) return "ini";
  if (/\.(ya?ml)$/.test(path)) return "yaml";
  return "plaintext";
}
