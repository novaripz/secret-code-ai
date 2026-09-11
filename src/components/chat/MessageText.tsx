"use client";

import katex from "katex";
import "katex/dist/katex.min.css";

import { parseMarkdown, type Block, type Inline } from "@/lib/markdown";

// Renders an assistant reply, including one that is still arriving.
//
// While streaming, text is split into words and each word is keyed by its
// character offset in the message. Offsets never shift, because text is only
// ever appended, so React keeps every word that is already on screen mounted.
// A CSS animation only fires when an element mounts, which means a word
// animates exactly once, on the frame it first appears, and is completely
// stable afterwards. Nothing re-animates and no future text is rendered.
//
// Once the stream ends the words collapse back to plain text nodes, so a long
// thread is not carrying a span per word forever.
//
// Math is typeset by KaTeX. The parser only hands over expressions whose
// closing delimiter has arrived, so an expression is typeset once, complete,
// and never flashes through a half-written state.

// KaTeX is asked for an HTML string rather than handed a node to render into,
// because a string is stable for a given expression: the markup is identical
// on every re-render, React leaves the node alone, and the expression fades in
// once like any other word. The cache is what makes that cheap during a
// token-by-token stream, where every finished expression would otherwise be
// typeset again on every token that lands after it.
const typeset = new Map<string, string>();

function toHtml(tex: string, display: boolean): string {
  const key = `${display ? "d" : "i"}:${tex}`;
  const cached = typeset.get(key);
  if (cached !== undefined) return cached;

  // throwOnError is the whole reason a bad expression is survivable: KaTeX
  // prints the source it could not parse instead of throwing, so one typo in
  // one step cannot blank out the reply a student is reading. errorColor is
  // a token rather than KaTeX's own red, which is unreadable on the dark
  // ground. The markup is safe to inject: KaTeX escapes the TeX it echoes
  // back, and trust defaults to off, so no \href or raw HTML survives it.
  const html = katex.renderToString(tex, {
    throwOnError: false,
    displayMode: display,
    errorColor: "var(--danger)",
  });

  // A thread can run long; this is a render cache, not a record of the chat.
  if (typeset.size > 500) typeset.clear();
  typeset.set(key, html);
  return html;
}

function words(text: string, offset: number) {
  // Split into word-plus-trailing-space so spacing rides along with the word
  // and the fade lands on natural groups rather than letters.
  const out: { text: string; key: number }[] = [];
  const re = /\s*\S+\s*|\s+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({ text: m[0], key: offset + m.index });
  }
  return out;
}

function MathRun({ tex, display, animate }: { tex: string; display: boolean; animate: boolean }) {
  return (
    <span
      className={`math${display ? " math-display" : ""}${animate ? " chunk-in" : ""}`}
      dangerouslySetInnerHTML={{ __html: toHtml(tex, display) }}
    />
  );
}

function InlineRun({ run, animate }: { run: Inline; animate: boolean }) {
  if (run.kind === "code") {
    return (
      <code className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[13px] text-[var(--text)]">
        {run.text}
      </code>
    );
  }

  if (run.kind === "math") {
    return <MathRun tex={run.tex} display={run.display} animate={animate} />;
  }

  const body = animate ? (
    <>
      {words(run.text, run.offset).map((w) => (
        <span key={w.key} className="chunk-in">
          {w.text}
        </span>
      ))}
    </>
  ) : (
    run.text
  );

  if (run.kind === "bold") return <strong className="font-semibold">{body}</strong>;
  if (run.kind === "italic") return <em className="italic">{body}</em>;
  return <>{body}</>;
}

function Inlines({ runs, animate }: { runs: Inline[]; animate: boolean }) {
  return (
    <>
      {runs.map((run) => (
        <InlineRun key={run.offset} run={run} animate={animate} />
      ))}
    </>
  );
}

function BlockView({ block, animate }: { block: Block; animate: boolean }) {
  switch (block.type) {
    case "h": {
      const size =
        block.level === 1 ? "text-xl" : block.level === 2 ? "text-lg" : "text-base";
      return (
        <h3 className={`${size} font-semibold tracking-tight text-[var(--text)]`}>
          <Inlines runs={block.inlines} animate={animate} />
        </h3>
      );
    }

    case "ul":
      return (
        <ul className="list-disc space-y-1.5 pl-5 leading-[1.7]">
          {block.items.map((item) => (
            <li key={item.offset}>
              <Inlines runs={item.inlines} animate={animate} />
            </li>
          ))}
        </ul>
      );

    case "ol":
      return (
        <ol className="list-decimal space-y-1.5 pl-5 leading-[1.7]">
          {block.items.map((item) => (
            <li key={item.offset}>
              <Inlines runs={item.inlines} animate={animate} />
            </li>
          ))}
        </ol>
      );

    case "code":
      return (
        <pre className="overflow-x-auto rounded-xl border border-[var(--line)] bg-[var(--surface-0)] p-3 text-[13px] leading-relaxed">
          {block.language && (
            <div className="mb-2 text-[11px] uppercase tracking-wide text-[var(--text-faint)]">
              {block.language}
            </div>
          )}
          <code className="font-mono text-[var(--text)]">{block.code}</code>
        </pre>
      );

    case "math":
      return <MathRun tex={block.tex} display animate={animate} />;

    case "hr":
      return <hr className="border-[var(--line)]" />;

    default:
      return (
        <p className="whitespace-pre-wrap leading-[1.7]">
          <Inlines runs={block.inlines} animate={animate} />
        </p>
      );
  }
}

export function MessageText({ content, streaming }: { content: string; streaming?: boolean }) {
  const blocks = parseMarkdown(content);

  return (
    <div className="space-y-3">
      {blocks.map((block) => (
        <BlockView key={block.offset} block={block} animate={streaming === true} />
      ))}
    </div>
  );
}
