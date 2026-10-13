"use client";

import { memo, useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { CheckIcon, CopyIcon } from "@/components/icons";

// A fenced code block in a reply: the language on the left, Copy on the
// right, and a light tint on the code itself.
//
// Copy is per block because the thing a student wants out of a coding answer
// is nearly always one block, not the whole reply with its explanation around
// it — and selecting a long block by hand on a phone is close to impossible.
//
// The tint is deliberately small: comments, strings, numbers and keywords,
// recognised by shape. It is not a parser and does not pretend to be one; a
// wrong colour on a rare construct costs nothing, while a highlighting library
// would cost a dependency and a bundle the size of the rest of the chat.

const KEYWORDS = new Set(
  (
    "abstract and as async await boolean break case catch char class const continue def default del delete do double elif else enum " +
    "except export extends false final finally float fn for from func function go if impl implements import in instanceof int interface " +
    "is lambda let long match mut new nil none None not null or package pass print private protected pub public raise return self " +
    "static string struct super switch this throw throws true True False try type typeof undefined use var void while with yield"
  ).split(" "),
);

/** Languages whose comments start with `#`. Anywhere else `#` is a selector, a colour or a directive. */
const HASH_COMMENTS = new Set(["py", "python", "rb", "ruby", "sh", "bash", "shell", "zsh", "yaml", "yml", "r", "toml", "perl", "pl", "ps1", "powershell"]);

const LABELS: Record<string, string> = {
  js: "JavaScript",
  javascript: "JavaScript",
  jsx: "JSX",
  ts: "TypeScript",
  typescript: "TypeScript",
  tsx: "TSX",
  py: "Python",
  python: "Python",
  html: "HTML",
  css: "CSS",
  json: "JSON",
  java: "Java",
  c: "C",
  cpp: "C++",
  "c++": "C++",
  cs: "C#",
  csharp: "C#",
  sh: "Shell",
  bash: "Bash",
  sql: "SQL",
  rb: "Ruby",
  ruby: "Ruby",
  go: "Go",
  rs: "Rust",
  rust: "Rust",
  md: "Markdown",
  markdown: "Markdown",
  yaml: "YAML",
  yml: "YAML",
  swift: "Swift",
  kotlin: "Kotlin",
  php: "PHP",
  lua: "Lua",
  scratch: "Scratch",
};

type Token = { kind: "k" | "s" | "c" | "n" | "p"; text: string };

function tokenize(code: string, language: string): Token[] {
  const hash = HASH_COMMENTS.has(language);
  const html = language === "html" || language === "xml" || language === "svg";
  const parts = [
    html ? /<!--[\s\S]*?(?:-->|$)/.source : /\/\*[\s\S]*?(?:\*\/|$)/.source,
    hash ? /#[^\n]*/.source : /\/\/[^\n]*/.source,
    /"(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?|`(?:[^`\\]|\\.)*`?/.source,
    /\b\d+(?:\.\d+)?\b/.source,
    /[A-Za-z_$][\w$]*/.source,
  ];
  const re = new RegExp(parts.map((p) => `(${p})`).join("|"), "g");
  const out: Token[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    if (m.index > last) out.push({ kind: "p", text: code.slice(last, m.index) });
    const text = m[0];
    const kind: Token["kind"] =
      m[1] !== undefined || m[2] !== undefined
        ? "c"
        : m[3] !== undefined
          ? // In HTML an apostrophe in body text is not a string opener.
            html && text.startsWith("'")
            ? "p"
            : "s"
          : m[4] !== undefined
            ? "n"
            : KEYWORDS.has(text)
              ? "k"
              : "p";
    out.push({ kind, text });
    last = m.index + text.length;
    if (text.length === 0) re.lastIndex++;
  }
  if (last < code.length) out.push({ kind: "p", text: code.slice(last) });
  return out;
}

const Highlighted = memo(function Highlighted({ code, language }: { code: string; language: string }) {
  // A long block arriving token by token re-tints on every frame; past this
  // size the plain text is kinder to a Chromebook than the colours are.
  if (code.length > 20_000) return <>{code}</>;
  return (
    <>
      {tokenize(code, language).map((tok, i) =>
        tok.kind === "p" ? (
          tok.text
        ) : (
          <span key={i} className={`tok-${tok.kind}`}>
            {tok.text}
          </span>
        ),
      )}
    </>
  );
});

export function CodeBlock({ code, language, open }: { code: string; language?: string; open?: boolean }) {
  const { t } = useI18n();
  const lang = (language ?? "").toLowerCase();
  const label = LABELS[lang] ?? (lang ? lang : t("chat.codeLabel"));
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function copy() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("no clipboard");
      await navigator.clipboard.writeText(code);
      setState("copied");
    } catch {
      setState("failed");
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 1800);
  }

  const copyLabel = state === "copied" ? t("chat.copied") : state === "failed" ? t("chat.copyFailed") : t("chat.copyCode");

  return (
    <div className="code-block">
      <div className="code-block-head">
        <span className="truncate">{label}</span>
        {/* Not offered while the block is still arriving: half a function
            copied silently is worse than waiting a second for the rest. */}
        {!open && (
          <button type="button" onClick={() => void copy()} className="code-copy tap" aria-live="polite" data-state={state}>
            {state === "copied" ? <CheckIcon /> : <CopyIcon />}
            <span>{copyLabel}</span>
          </button>
        )}
      </div>
      <pre className="scroll-x">
        <code>
          <Highlighted code={code} language={lang} />
        </code>
      </pre>
    </div>
  );
}
