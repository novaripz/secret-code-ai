"use client";

import katex from "katex";
import "katex/dist/katex.min.css";

import { parseMarkdown, type Block, type Inline } from "@/lib/markdown";
import { stripRemembered } from "./remember";
import { CodeBlock } from "./CodeBlock";

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
    return <code className="inline-code">{run.text}</code>;
  }

  if (run.kind === "math") {
    return <MathRun tex={run.tex} display={run.display} animate={animate} />;
  }

  if (run.kind === "link") {
    // Every link leaves the app in a new tab, and `noopener` stops the page it
    // opens from reaching back into this one. Only http(s) and mailto ever get
    // this far — the parser leaves anything else as plain text.
    return (
      <a href={run.href} target="_blank" rel="noopener noreferrer" className="chat-link">
        {run.text}
      </a>
    );
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

  if (run.kind === "bold") return <strong className="font-semibold text-[var(--text)]">{body}</strong>;
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
      const size = block.level === 1 ? "text-[1.3em]" : block.level === 2 ? "text-[1.15em]" : "text-[1.05em]";
      return (
        <h3 className={`${size} pt-1 font-semibold tracking-tight text-[var(--text)]`}>
          <Inlines runs={block.inlines} animate={animate} />
        </h3>
      );
    }

    case "ul":
      return (
        <ul className="list-disc space-y-1.5 break-words ps-5 leading-[1.7] marker:text-[var(--text-faint)]">
          {block.items.map((item) => (
            <li key={item.offset} className="ps-0.5">
              <Inlines runs={item.inlines} animate={animate} />
            </li>
          ))}
        </ul>
      );

    case "ol":
      return (
        <ol start={block.start} className="list-decimal space-y-1.5 break-words ps-6 leading-[1.7] marker:font-medium marker:text-[var(--text-dim)]">
          {block.items.map((item) => (
            <li key={item.offset} className="ps-0.5">
              <Inlines runs={item.inlines} animate={animate} />
            </li>
          ))}
        </ol>
      );

    case "code":
      return <CodeBlock code={block.code} language={block.language} open={block.open} />;

    case "math":
      return <MathRun tex={block.tex} display animate={animate} />;

    case "quote":
      return (
        <blockquote className="whitespace-pre-wrap break-words border-s-2 border-[var(--line-strong)] ps-3.5 leading-[1.7] text-[var(--text-dim)]">
          <Inlines runs={block.inlines} animate={animate} />
        </blockquote>
      );

    case "table":
      return (
        // Its own scroller: a five-column table is wider than a phone, and the
        // page itself must never scroll sideways.
        <div className="scroll-x chat-table-wrap">
          <table className="chat-table">
            <thead>
              <tr>
                {block.head.map((cell, i) => (
                  <th key={cell.offset} style={{ textAlign: block.align[i] }}>
                    <Inlines runs={cell.inlines} animate={animate} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={row[0]?.offset ?? r}>
                  {row.map((cell, i) => (
                    <td key={cell.offset} style={{ textAlign: block.align[i] }}>
                      <Inlines runs={cell.inlines} animate={animate} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "hr":
      return <hr className="border-[var(--line)]" />;

    default:
      return (
        <p className="whitespace-pre-wrap break-words leading-[1.7]">
          <Inlines runs={block.inlines} animate={animate} />
        </p>
      );
  }
}

export function MessageText({ content, streaming }: { content: string; streaming?: boolean }) {
  // The remember markers are machinery, not writing. Stripping them here rather
  // than in the store means the raw reply stays intact on disk (so a fact can
  // be re-read if the parser ever changes) while the student never sees the
  // mechanism — including the half-typed marker during a stream.
  const blocks = parseMarkdown(stripRemembered(content, streaming === true));

  return (
    // `dir="auto"`: a reply follows its own language, not the interface's.
    // An English answer in the Arabic interface reads left to right with its
    // full stop at the end, and an Arabic answer in the English one the other
    // way round.
    <div dir="auto" className="chat-prose min-w-0 space-y-3">
      {blocks.map((block) => (
        <BlockView key={block.offset} block={block} animate={streaming === true} />
      ))}
    </div>
  );
}
