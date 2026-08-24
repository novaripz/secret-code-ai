"use client";

// Minimal renderer for assistant replies: fenced code blocks get their own
// styled block, everything else is plain text with line breaks preserved.
// Deliberately not a full markdown engine — no dependency, no surprises.

interface Segment {
  type: "text" | "code";
  content: string;
  language?: string;
}

function parse(content: string): Segment[] {
  const segments: Segment[] = [];
  const fence = /```([a-zA-Z0-9+#-]*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = fence.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", content: content.slice(lastIndex, match.index) });
    }
    segments.push({ type: "code", content: match[2].replace(/\n$/, ""), language: match[1] || undefined });
    lastIndex = fence.lastIndex;
  }
  if (lastIndex < content.length) segments.push({ type: "text", content: content.slice(lastIndex) });
  return segments;
}

export function MessageText({ content }: { content: string }) {
  const segments = parse(content);

  return (
    <div className="space-y-3">
      {segments.map((segment, i) =>
        segment.type === "code" ? (
          <pre
            key={i}
            className="overflow-x-auto rounded-xl border border-[var(--line)] bg-[var(--surface-0)] p-3 text-[13px] leading-relaxed"
          >
            {segment.language && (
              <div className="mb-2 text-[11px] uppercase tracking-wide text-[var(--text-faint)]">
                {segment.language}
              </div>
            )}
            <code className="font-mono text-[var(--text)]">{segment.content}</code>
          </pre>
        ) : segment.content.trim() ? (
          <p key={i} className="whitespace-pre-wrap leading-[1.7]">
            {segment.content.trim()}
          </p>
        ) : null,
      )}
    </div>
  );
}
