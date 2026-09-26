// Luau tokenizer.
//
// Covers the full surface of modern Luau source as Roblox Studio accepts it:
// long strings and comments with any level of `=`, `\z` and `\u{}` escapes,
// hex/binary literals with `_` separators, backtick interpolated strings with
// nested braces, compound assignment operators, `::`, `->` and `@attributes`.
// Positions are 1-based line/column so diagnostics line up with Studio's.

export type TokenKind =
  | "name"
  | "keyword"
  | "number"
  | "string"
  | "interp" // an interpolated string, pre-split into parts
  | "op"
  | "attribute"
  | "eof";

export interface Pos {
  line: number;
  col: number;
  offset: number;
}

export interface InterpPart {
  /** Literal text between expressions. */
  text: string;
  /** Source of the expression that follows `text`, if any. */
  expr?: { source: string; start: Pos };
}

export interface Token {
  kind: TokenKind;
  value: string;
  start: Pos;
  end: Pos;
  /** For `interp` tokens. */
  parts?: InterpPart[];
}

export class LuauSyntaxError extends Error {
  constructor(
    message: string,
    public readonly pos: Pos,
    public readonly endPos?: Pos,
  ) {
    super(message);
    this.name = "LuauSyntaxError";
  }
}

export const KEYWORDS = new Set([
  "and",
  "break",
  "do",
  "else",
  "elseif",
  "end",
  "false",
  "for",
  "function",
  "if",
  "in",
  "local",
  "nil",
  "not",
  "or",
  "repeat",
  "return",
  "then",
  "true",
  "until",
  "while",
]);

// Longest first, so the scanner can match greedily.
const OPERATORS = [
  "//=",
  "...",
  "..=",
  "==",
  "~=",
  "<=",
  ">=",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  "^=",
  "//",
  "..",
  "::",
  "->",
  "+",
  "-",
  "*",
  "/",
  "%",
  "^",
  "#",
  "<",
  ">",
  "=",
  "(",
  ")",
  "{",
  "}",
  "[",
  "]",
  ";",
  ":",
  ",",
  ".",
  "?",
  "|",
  "&",
];

function isNameStart(c: string): boolean {
  return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";
}

function isNameChar(c: string): boolean {
  return isNameStart(c) || (c >= "0" && c <= "9");
}

function isDigit(c: string): boolean {
  return c >= "0" && c <= "9";
}

export class Lexer {
  private i = 0;
  private line = 1;
  private col = 1;

  constructor(
    private readonly src: string,
    private readonly base: Pos = { line: 1, col: 1, offset: 0 },
  ) {
    this.line = base.line;
    this.col = base.col;
  }

  private pos(): Pos {
    return { line: this.line, col: this.col, offset: this.base.offset + this.i };
  }

  private peek(n = 0): string {
    return this.src[this.i + n] ?? "";
  }

  private advance(n = 1): string {
    let out = "";
    for (let k = 0; k < n; k++) {
      const c = this.src[this.i++];
      if (c === undefined) break;
      out += c;
      if (c === "\n") {
        this.line++;
        this.col = 1;
      } else {
        this.col++;
      }
    }
    return out;
  }

  tokenize(): Token[] {
    const tokens: Token[] = [];
    for (;;) {
      this.skipTrivia();
      const start = this.pos();
      if (this.i >= this.src.length) {
        tokens.push({ kind: "eof", value: "", start, end: start });
        return tokens;
      }
      tokens.push(this.next(start));
    }
  }

  private skipTrivia(): void {
    for (;;) {
      const c = this.peek();
      if (c === " " || c === "\t" || c === "\r" || c === "\n" || c === "\f" || c === "\v") {
        this.advance();
        continue;
      }
      if (c === "-" && this.peek(1) === "-") {
        const start = this.pos();
        this.advance(2);
        const level = this.longBracketLevel();
        if (level >= 0) {
          this.readLongBracket(level, start, "comment");
        } else {
          while (this.i < this.src.length && this.peek() !== "\n") this.advance();
        }
        continue;
      }
      // A shebang is legal only on the first line.
      if (this.i === 0 && c === "#" && this.peek(1) === "!") {
        while (this.i < this.src.length && this.peek() !== "\n") this.advance();
        continue;
      }
      return;
    }
  }

  /** At `[`, returns the `=` count of a long bracket opener, or -1 if this is not one. */
  private longBracketLevel(): number {
    if (this.peek() !== "[") return -1;
    let n = 1;
    let level = 0;
    while (this.peek(n) === "=") {
      level++;
      n++;
    }
    return this.peek(n) === "[" ? level : -1;
  }

  private readLongBracket(level: number, start: Pos, what: "string" | "comment"): string {
    this.advance(level + 2);
    // A newline immediately after the opener is not part of the content.
    if (this.peek() === "\r") this.advance();
    if (this.peek() === "\n") this.advance();
    const close = "]" + "=".repeat(level) + "]";
    const from = this.i;
    const idx = this.src.indexOf(close, this.i);
    if (idx < 0) {
      throw new LuauSyntaxError(`Unfinished long ${what}`, start);
    }
    const body = this.src.slice(from, idx);
    this.advance(idx - this.i + close.length);
    return body;
  }

  private next(start: Pos): Token {
    const c = this.peek();

    if (isNameStart(c)) {
      let name = "";
      while (isNameChar(this.peek())) name += this.advance();
      return {
        kind: KEYWORDS.has(name) ? "keyword" : "name",
        value: name,
        start,
        end: this.pos(),
      };
    }

    if (isDigit(c) || (c === "." && isDigit(this.peek(1)))) {
      return this.readNumber(start);
    }

    if (c === '"' || c === "'") {
      const value = this.readQuoted(c, start);
      return { kind: "string", value, start, end: this.pos() };
    }

    if (c === "`") {
      const parts = this.readInterpolated(start);
      return { kind: "interp", value: "`", parts, start, end: this.pos() };
    }

    if (c === "[") {
      const level = this.longBracketLevel();
      if (level >= 0) {
        const value = this.readLongBracket(level, start, "string");
        return { kind: "string", value, start, end: this.pos() };
      }
    }

    if (c === "@") {
      this.advance();
      let name = "";
      while (isNameChar(this.peek())) name += this.advance();
      if (!name) throw new LuauSyntaxError("Expected attribute name after '@'", start);
      return { kind: "attribute", value: name, start, end: this.pos() };
    }

    for (const op of OPERATORS) {
      if (this.src.startsWith(op, this.i)) {
        this.advance(op.length);
        return { kind: "op", value: op, start, end: this.pos() };
      }
    }

    // `!=` is the single most common mistake coming from other languages.
    if (c === "!" && this.peek(1) === "=") {
      throw new LuauSyntaxError("Unexpected '!='; Luau uses '~=' for not-equal", start);
    }
    throw new LuauSyntaxError(`Unexpected character '${c}'`, start);
  }

  private readNumber(start: Pos): Token {
    let text = "";
    if (this.peek() === "0" && (this.peek(1) === "x" || this.peek(1) === "X")) {
      text += this.advance(2);
      while (/[0-9a-fA-F_]/.test(this.peek())) text += this.advance();
    } else if (this.peek() === "0" && (this.peek(1) === "b" || this.peek(1) === "B")) {
      text += this.advance(2);
      while (/[01_]/.test(this.peek())) text += this.advance();
    } else {
      while (isDigit(this.peek()) || this.peek() === "_") text += this.advance();
      if (this.peek() === "." && this.peek(1) !== ".") {
        text += this.advance();
        while (isDigit(this.peek()) || this.peek() === "_") text += this.advance();
      }
      if (this.peek() === "e" || this.peek() === "E") {
        text += this.advance();
        if (this.peek() === "+" || this.peek() === "-") text += this.advance();
        if (!isDigit(this.peek())) throw new LuauSyntaxError("Malformed number", start);
        while (isDigit(this.peek())) text += this.advance();
      }
    }
    if (isNameStart(this.peek())) {
      throw new LuauSyntaxError(`Malformed number near '${text}${this.peek()}'`, start);
    }
    return { kind: "number", value: text, start, end: this.pos() };
  }

  private readEscape(start: Pos): string {
    // Positioned on the character after the backslash.
    const c = this.advance();
    switch (c) {
      case "n":
        return "\n";
      case "t":
        return "\t";
      case "r":
        return "\r";
      case "a":
        return "\x07";
      case "b":
        return "\b";
      case "f":
        return "\f";
      case "v":
        return "\v";
      case "\\":
        return "\\";
      case '"':
        return '"';
      case "'":
        return "'";
      case "`":
        return "`";
      case "{":
        return "{";
      case "\n":
        return "\n";
      case "\r":
        if (this.peek() === "\n") this.advance();
        return "\n";
      case "z":
        while (/\s/.test(this.peek()) && this.peek() !== "") this.advance();
        return "";
      case "x": {
        const hex = this.advance(2);
        if (!/^[0-9a-fA-F]{2}$/.test(hex)) throw new LuauSyntaxError("Invalid \\x escape", start);
        return String.fromCharCode(parseInt(hex, 16));
      }
      case "u": {
        if (this.advance() !== "{") throw new LuauSyntaxError("Invalid \\u escape, expected '{'", start);
        let hex = "";
        while (/[0-9a-fA-F]/.test(this.peek())) hex += this.advance();
        if (this.advance() !== "}" || !hex) throw new LuauSyntaxError("Invalid \\u escape", start);
        const cp = parseInt(hex, 16);
        if (cp > 0x10ffff) throw new LuauSyntaxError("\\u escape out of range", start);
        return String.fromCodePoint(cp);
      }
      default:
        if (isDigit(c)) {
          let digits = c;
          while (digits.length < 3 && isDigit(this.peek())) digits += this.advance();
          const n = parseInt(digits, 10);
          if (n > 255) throw new LuauSyntaxError("Decimal escape too large", start);
          return String.fromCharCode(n);
        }
        throw new LuauSyntaxError(`Invalid escape sequence '\\${c}'`, start);
    }
  }

  private readQuoted(quote: string, start: Pos): string {
    this.advance();
    let out = "";
    for (;;) {
      const c = this.peek();
      if (c === "") throw new LuauSyntaxError("Unfinished string", start);
      if (c === "\n") throw new LuauSyntaxError("Unfinished string (strings cannot span lines)", start);
      if (c === quote) {
        this.advance();
        return out;
      }
      if (c === "\\") {
        this.advance();
        out += this.readEscape(start);
        continue;
      }
      out += this.advance();
    }
  }

  private readInterpolated(start: Pos): InterpPart[] {
    this.advance(); // opening backtick
    const parts: InterpPart[] = [];
    let text = "";
    for (;;) {
      const c = this.peek();
      if (c === "") throw new LuauSyntaxError("Unfinished interpolated string", start);
      if (c === "`") {
        this.advance();
        parts.push({ text });
        return parts;
      }
      if (c === "\\") {
        this.advance();
        text += this.readEscape(start);
        continue;
      }
      if (c === "{") {
        if (this.peek(1) === "{") {
          throw new LuauSyntaxError(
            "Double braces are not permitted in interpolated strings; escape the brace as '\\{'",
            this.pos(),
          );
        }
        this.advance();
        const exprStart = this.pos();
        const source = this.readBalancedExpression(start);
        if (!source.trim()) throw new LuauSyntaxError("Empty expression in interpolated string", exprStart);
        parts.push({ text, expr: { source, start: exprStart } });
        text = "";
        continue;
      }
      text += this.advance();
    }
  }

  /** Reads up to the `}` that closes an interpolation, honouring nested braces and strings. */
  private readBalancedExpression(start: Pos): string {
    let depth = 0;
    let out = "";
    for (;;) {
      const c = this.peek();
      if (c === "") throw new LuauSyntaxError("Unfinished interpolated string expression", start);
      if (c === '"' || c === "'") {
        const q = c;
        out += this.advance();
        while (this.peek() !== q) {
          if (this.peek() === "" || this.peek() === "\n") {
            throw new LuauSyntaxError("Unfinished string inside interpolation", start);
          }
          if (this.peek() === "\\") out += this.advance();
          out += this.advance();
        }
        out += this.advance();
        continue;
      }
      if (c === "`") {
        // Nested interpolated string: copy verbatim, balanced by backticks.
        out += this.advance();
        while (this.peek() !== "`") {
          if (this.peek() === "") throw new LuauSyntaxError("Unfinished nested interpolated string", start);
          if (this.peek() === "\\") out += this.advance();
          out += this.advance();
        }
        out += this.advance();
        continue;
      }
      if (c === "{") depth++;
      if (c === "}") {
        if (depth === 0) {
          this.advance();
          return out;
        }
        depth--;
      }
      out += this.advance();
    }
  }
}

export function tokenize(src: string, base?: Pos): Token[] {
  return new Lexer(src, base).tokenize();
}
