// A small markdown parser built for streaming.
//
// Two things make it different from a normal one:
//
//  1. It accepts partial input. A code fence with no closing fence yet is a
//     code block that is still open, not a syntax error, and an unfinished
//     `**bold` renders as literal text until its closing marker arrives, so
//     nothing flickers as the model types through a marker.
//
//  2. Everything carries the character offset it started at. Offsets are
//     stable while text only ever gets appended, which lets the renderer key
//     words by offset and animate only the ones that just showed up.

export type Inline =
  | { kind: "text"; text: string; offset: number }
  | { kind: "bold"; text: string; offset: number }
  | { kind: "italic"; text: string; offset: number }
  | { kind: "code"; text: string; offset: number };

export interface ListItem {
  inlines: Inline[];
  offset: number;
}

export type Block =
  | { type: "p"; inlines: Inline[]; offset: number }
  | { type: "h"; level: 1 | 2 | 3; inlines: Inline[]; offset: number }
  | { type: "ul"; items: ListItem[]; offset: number }
  | { type: "ol"; items: ListItem[]; offset: number }
  | { type: "code"; code: string; language?: string; open: boolean; offset: number }
  | { type: "hr"; offset: number };

/** Matches only *closed* spans, so a half-written marker stays literal text. */
const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(_[^_\n]+_)/;

export function parseInline(text: string, offset: number): Inline[] {
  const out: Inline[] = [];
  let rest = text;
  let pos = offset;

  while (rest.length > 0) {
    const m = INLINE.exec(rest);
    if (!m || m.index === undefined) break;

    if (m.index > 0) {
      out.push({ kind: "text", text: rest.slice(0, m.index), offset: pos });
      pos += m.index;
    }

    const token = m[0];
    if (token.startsWith("`")) {
      out.push({ kind: "code", text: token.slice(1, -1), offset: pos });
    } else if (token.startsWith("**")) {
      out.push({ kind: "bold", text: token.slice(2, -2), offset: pos });
    } else {
      out.push({ kind: "italic", text: token.slice(1, -1), offset: pos });
    }

    pos += token.length;
    rest = rest.slice(m.index + token.length);
  }

  if (rest.length > 0) out.push({ kind: "text", text: rest, offset: pos });
  return out;
}

const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^(#{1,3})\s+(.*)$/;
const HR = /^\s*(?:---+|\*\*\*+|___+)\s*$/;
const FENCE = /^\s*```\s*([a-zA-Z0-9+#-]*)\s*$/;

export function parseMarkdown(content: string): Block[] {
  const blocks: Block[] = [];
  const lines = content.split("\n");

  // Offset of the first character of each line, so blocks can report where
  // they began in the original string.
  const lineOffsets: number[] = [];
  let running = 0;
  for (const line of lines) {
    lineOffsets.push(running);
    running += line.length + 1;
  }

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const offset = lineOffsets[i];

    if (line.trim() === "") {
      i++;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const language = fence[1] || undefined;
      const body: string[] = [];
      let closed = false;
      i++;
      while (i < lines.length) {
        if (FENCE.test(lines[i])) {
          closed = true;
          i++;
          break;
        }
        body.push(lines[i]);
        i++;
      }
      blocks.push({ type: "code", code: body.join("\n"), language, open: !closed, offset });
      continue;
    }

    if (HR.test(line)) {
      blocks.push({ type: "hr", offset });
      i++;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      const level = heading[1].length as 1 | 2 | 3;
      const textOffset = offset + line.length - heading[2].length;
      blocks.push({ type: "h", level, inlines: parseInline(heading[2], textOffset), offset });
      i++;
      continue;
    }

    if (BULLET.test(line) || NUMBERED.test(line)) {
      const ordered = !BULLET.test(line);
      const items: ListItem[] = [];
      while (i < lines.length) {
        const m = ordered ? NUMBERED.exec(lines[i]) : BULLET.exec(lines[i]);
        if (!m) break;
        const itemOffset = lineOffsets[i];
        const textOffset = itemOffset + lines[i].length - m[1].length;
        items.push({ inlines: parseInline(m[1], textOffset), offset: itemOffset });
        i++;
      }
      blocks.push({ type: ordered ? "ol" : "ul", items, offset });
      continue;
    }

    // Everything else is a paragraph: consecutive non-blank lines that do not
    // start some other block.
    const paraLines: string[] = [];
    const paraOffset = offset;
    while (i < lines.length) {
      const l = lines[i];
      if (
        l.trim() === "" ||
        FENCE.test(l) ||
        HR.test(l) ||
        HEADING.test(l) ||
        BULLET.test(l) ||
        NUMBERED.test(l)
      ) {
        break;
      }
      paraLines.push(l);
      i++;
    }
    blocks.push({ type: "p", inlines: parseInline(paraLines.join("\n"), paraOffset), offset: paraOffset });
  }

  return blocks;
}
