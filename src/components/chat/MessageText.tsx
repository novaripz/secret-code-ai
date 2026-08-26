"use client";

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

function InlineRun({ run, animate }: { run: Inline; animate: boolean }) {
  if (run.kind === "code") {
    return (
      <code className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[13px] text-[var(--text)]">
        {run.text}
      </code>
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
