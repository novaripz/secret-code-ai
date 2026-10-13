// A small markdown parser built for streaming.
//
// Three things make it different from a normal one:
//
//  1. It accepts partial input. A code fence with no closing fence yet is a
//     code block that is still open, not a syntax error, and an unfinished
//     `**bold` renders as literal text until its closing marker arrives, so
//     nothing flickers as the model types through a marker.
//
//  2. Math plays by the same rule. `$x^2 +` is prose until the `$` that
//     closes it lands, which is the only way a half-typed expression can be
//     shown to a student without it flashing through a broken state first.
//
//  3. Everything carries the character offset it started at. Offsets are
//     stable while text only ever gets appended, which lets the renderer key
//     words by offset and animate only the ones that just showed up.

export type Inline =
  | { kind: "text"; text: string; offset: number }
  | { kind: "bold"; text: string; offset: number }
  | { kind: "italic"; text: string; offset: number }
  | { kind: "code"; text: string; offset: number }
  | { kind: "math"; tex: string; display: boolean; offset: number }
  | { kind: "link"; text: string; href: string; offset: number };

export interface ListItem {
  inlines: Inline[];
  offset: number;
}

export interface TableCell {
  inlines: Inline[];
  offset: number;
}

export type Block =
  | { type: "p"; inlines: Inline[]; offset: number }
  | { type: "h"; level: 1 | 2 | 3; inlines: Inline[]; offset: number }
  | { type: "ul"; items: ListItem[]; offset: number }
  // `start` is the number the list's first item was written with, so a list
  // the model split with blank lines or an explanation keeps counting 1, 2, 3
  // instead of showing "1." on every item.
  | { type: "ol"; items: ListItem[]; start: number; offset: number }
  | { type: "code"; code: string; language?: string; open: boolean; offset: number }
  | { type: "math"; tex: string; offset: number }
  | { type: "quote"; inlines: Inline[]; offset: number }
  | {
      type: "table";
      head: TableCell[];
      rows: TableCell[][];
      align: ("left" | "center" | "right" | undefined)[];
      offset: number;
    }
  | { type: "hr"; offset: number };

// Matches only *closed* spans, so a half-written marker stays literal text.
//
// The dollar rules are what keep prose out of math: a `$` opens an expression
// only when a non-space follows it, only a `$` with a non-space before it can
// close it, and that closing `$` may not be followed by a digit. Without those
// three, "it costs $5" and "$5 to $10" typeset as equations — and students
// write about money far more often than they write TeX.
//
// The emphasis rules keep arithmetic and identifiers out of italics. A single
// `*` or `_` only opens at a word boundary and only closes at one, and never
// hugs a space. Before, `2*3*4` lost its multiplication signs and printed a
// slanted 3, and `snake_case_name` came out as "snake" + italic "case" +
// "name" — which, in a chat that teaches coding, is a variable name the
// student then copies wrongly.
//
// Links are markdown `[text](https://…)` and nothing else: only http(s) and
// mailto survive, so a `javascript:` URL the model was tricked into writing is
// plain text, never an anchor. A bare URL is linked too, because that is how a
// model most often cites a page.
const INLINE = new RegExp(
  [
    /(`[^`\n]+`)/.source,
    /(\$\$[^\n]+?\$\$|\\\[[^\n]+?\\\])/.source,
    /(\$(?![\s$])(?:[^$\n]*?[^\s$])?\$(?!\d)|\\\([^\n]+?\\\))/.source,
    /(\*\*(?!\s)[^*\n]+?(?<!\s)\*\*)/.source,
    /((?<![\p{L}\p{N}*])\*(?![\s*])[^*\n]*?(?<![\s*])\*(?![\p{L}\p{N}*]))/u.source,
    /((?<![\p{L}\p{N}_])_(?![\s_])[^_\n]*?(?<![\s_])_(?![\p{L}\p{N}_]))/u.source,
    /(\[[^\]\n]+\]\((?:https?:\/\/|mailto:)[^\s)]+\))/.source,
    /(https?:\/\/[^\s<>()[\]"'`]+[^\s<>()[\]"'`.,;:!?])/.source,
  ].join("|"),
  "gu",
);

export function parseInline(text: string, offset: number): Inline[] {
  const out: Inline[] = [];
  // Scanned with lastIndex over the whole string rather than by slicing it, so
  // the look-behinds above can see the character before a marker.
  const re = new RegExp(INLINE.source, INLINE.flags);
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    const token = m[0];
    const at = m.index;
    if (at > last) out.push({ kind: "text", text: text.slice(last, at), offset: offset + last });
    const pos = offset + at;

    if (m[1] !== undefined) {
      out.push({ kind: "code", text: token.slice(1, -1), offset: pos });
    } else if (m[2] !== undefined) {
      out.push({ kind: "math", tex: token.slice(2, -2), display: true, offset: pos });
    } else if (m[3] !== undefined) {
      // `$…$` wraps in one character each side, `\(…\)` in two.
      const delim = token.startsWith("$") ? 1 : 2;
      out.push({ kind: "math", tex: token.slice(delim, -delim), display: false, offset: pos });
    } else if (m[4] !== undefined) {
      out.push({ kind: "bold", text: token.slice(2, -2), offset: pos });
    } else if (m[5] !== undefined || m[6] !== undefined) {
      out.push({ kind: "italic", text: token.slice(1, -1), offset: pos });
    } else if (m[7] !== undefined) {
      const close = token.indexOf("](");
      out.push({ kind: "link", text: token.slice(1, close), href: token.slice(close + 2, -1), offset: pos });
    } else {
      out.push({ kind: "link", text: token, href: token, offset: pos });
    }
    last = at + token.length;
  }

  if (last < text.length) out.push({ kind: "text", text: text.slice(last), offset: offset + last });
  return out;
}

const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*(\d{1,9})[.)]\s+(.*)$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const HR = /^\s*(?:---+|\*\*\*+|___+)\s*$/;
const FENCE = /^\s*```\s*([a-zA-Z0-9+#._-]*)\s*$/;
const DISPLAY = /^\s*(\$\$|\\\[)/;
const QUOTE = /^\s*>\s?(.*)$/;
/** An indented line under a list item: more of that item, not a new paragraph. */
const CONTINUATION = /^(?: {2,}|\t)\S/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_RULE_SHAPE = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;
/** The |---|:-:| line under a table's header. A pipe is required, or a plain
    `---` under a line of pipes would turn it into a table. */
const isTableRule = (line: string) => line.includes("|") && TABLE_RULE_SHAPE.test(line);

/** The cells of one `| a | b |` line, each with the offset its text starts at. */
function splitRow(line: string, lineOffset: number): TableCell[] {
  const cells: TableCell[] = [];
  const start = line.indexOf("|");
  const end = line.lastIndexOf("|");
  let cellStart = start + 1;
  for (let i = start + 1; i <= end; i++) {
    // An escaped pipe (\|) is part of the cell, not a column break.
    if (line[i] === "|" && line[i - 1] !== "\\") {
      const raw = line.slice(cellStart, i);
      const lead = raw.length - raw.trimStart().length;
      const text = raw.trim();
      cells.push({ inlines: parseInline(text, lineOffset + cellStart + lead), offset: lineOffset + cellStart });
      cellStart = i + 1;
    }
  }
  return cells;
}

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

  /** The next line at or after `from` that has something on it, or -1. */
  const nextFilled = (from: number) => {
    for (let j = from; j < lines.length; j++) if (lines[j].trim() !== "") return j;
    return -1;
  };

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
        if (FENCE.test(lines[i]) && /^\s*```\s*$/.test(lines[i])) {
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

    // Display math that starts a line, which is how a worked step arrives.
    // A fence has already eaten its own lines above, so code wins over math.
    // Nothing becomes a math block before its closing delimiter has arrived:
    // until then these lines fall through and stay the literal text the
    // student is watching appear.
    const display = DISPLAY.exec(line);
    if (display) {
      const opener = display[1];
      const closer = opener === "$$" ? "$$" : "\\]";
      const texStart = offset + line.indexOf(opener) + opener.length;
      const texEnd = content.indexOf(closer, texStart);
      const tex = texEnd === -1 ? "" : content.slice(texStart, texEnd);
      if (tex.trim() !== "") {
        // The closer has to end its line. If prose follows it on the same
        // line this is a sentence with math in it, and the inline pass reads
        // that better than a block would.
        let last = i;
        while (last + 1 < lines.length && lineOffsets[last + 1] <= texEnd) last++;
        if (lines[last].slice(texEnd + closer.length - lineOffsets[last]).trim() === "") {
          blocks.push({ type: "math", tex, offset });
          i = last + 1;
          continue;
        }
      }
    }

    if (HR.test(line)) {
      blocks.push({ type: "hr", offset });
      i++;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      // h4–h6 are drawn as h3: a chat reply does not have six levels of
      // structure, and a ##### that printed its hashes looked broken.
      const level = Math.min(heading[1].length, 3) as 1 | 2 | 3;
      const textOffset = offset + line.length - heading[2].length;
      blocks.push({ type: "h", level, inlines: parseInline(heading[2], textOffset), offset });
      i++;
      continue;
    }

    // A table needs its header row AND the |---| rule under it before it is a
    // table; until the rule arrives the header streams as ordinary text.
    if (TABLE_ROW.test(line) && i + 1 < lines.length && isTableRule(lines[i + 1])) {
      const head = splitRow(line, offset);
      const align = lines[i + 1]
        .trim()
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((c) => {
          const s = c.trim();
          if (s.startsWith(":") && s.endsWith(":")) return "center" as const;
          if (s.endsWith(":")) return "right" as const;
          if (s.startsWith(":")) return "left" as const;
          return undefined;
        });
      const rows: TableCell[][] = [];
      i += 2;
      while (i < lines.length && TABLE_ROW.test(lines[i])) {
        rows.push(splitRow(lines[i], lineOffsets[i]));
        i++;
      }
      blocks.push({ type: "table", head, rows, align, offset });
      continue;
    }

    if (QUOTE.test(line)) {
      const start = i;
      while (i < lines.length && QUOTE.test(lines[i])) i++;
      // The markers come off each line before the inline pass, so offsets
      // after the first line drift by a character or two. That only matters
      // for animation keys, and they still only ever grow as text arrives.
      const first = QUOTE.exec(lines[start])!;
      const textOffset = offset + lines[start].length - first[1].length;
      const body = lines
        .slice(start, i)
        .map((l) => QUOTE.exec(l)![1])
        .join("\n");
      blocks.push({ type: "quote", inlines: parseInline(body, textOffset), offset });
      continue;
    }

    if (BULLET.test(line) || NUMBERED.test(line)) {
      const ordered = !BULLET.test(line);
      const items: ListItem[] = [];
      const start = ordered ? Number(NUMBERED.exec(line)![1]) : 1;
      while (i < lines.length) {
        const m = ordered ? NUMBERED.exec(lines[i]) : BULLET.exec(lines[i]);
        if (!m) {
          // Models put a blank line between items, or between "1." and "2."
          // with nothing else in the way. That is still one list: it used to
          // restart a new <ol> for every item, so every step read "1.".
          if (lines[i].trim() === "") {
            const next = nextFilled(i);
            if (next !== -1 && (ordered ? NUMBERED : BULLET).test(lines[next])) {
              i = next;
              continue;
            }
          }
          break;
        }
        const body = ordered ? m[2] : m[1];
        const itemOffset = lineOffsets[i];
        const textOffset = itemOffset + lines[i].length - body.length;
        // An indented line straight after an item is more of that item. The
        // text is taken as one contiguous slice of the source, newline and
        // indent included, so its offsets stay exact; HTML folds the
        // whitespace to a single space on its own.
        let end = i + 1;
        while (end < lines.length && CONTINUATION.test(lines[end]) && !BULLET.test(lines[end]) && !NUMBERED.test(lines[end])) {
          end++;
        }
        const text = content.slice(textOffset, lineOffsets[end - 1] + lines[end - 1].length);
        items.push({ inlines: parseInline(text, textOffset), offset: itemOffset });
        i = end;
      }
      blocks.push(ordered ? { type: "ol", items, start, offset } : { type: "ul", items, offset });
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
        NUMBERED.test(l) ||
        (paraLines.length > 0 && QUOTE.test(l)) ||
        (paraLines.length > 0 && TABLE_ROW.test(l) && i + 1 < lines.length && isTableRule(lines[i + 1])) ||
        // A display delimiter ends the paragraph so the math can own its own
        // block. Guarded on paraLines because an opener whose closer has not
        // arrived yet fell through to here on purpose: without the guard this
        // paragraph would be empty and the outer loop would never advance.
        (paraLines.length > 0 && DISPLAY.test(l))
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
