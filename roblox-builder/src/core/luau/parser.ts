// Recursive-descent Luau parser.
//
// Produces a real AST (see ast.ts) rather than pattern-matching source text,
// which is what makes the Roblox analyzer trustworthy: a `wait(` inside a
// string or comment is not a call, and `local Players = game:GetService(...)`
// is a binding the analyzer can follow. Grammar follows the Luau reference
// (luau.org/grammar), including type annotations, generics, if-expressions,
// compound assignment, `continue`, attributes and string interpolation.

import type { Block, Chunk, Expr, FunctionBody, LocalBinding, Loc, Stat, TableField, TypeNode } from "./ast";
import { LuauSyntaxError, tokenize, type Pos, type Token } from "./lexer";

const BINARY_PRIORITY: Record<string, [number, number]> = {
  "+": [10, 10],
  "-": [10, 10],
  "*": [11, 11],
  "/": [11, 11],
  "//": [11, 11],
  "%": [11, 11],
  "^": [14, 13],
  "..": [9, 8],
  "==": [3, 3],
  "~=": [3, 3],
  "<": [3, 3],
  "<=": [3, 3],
  ">": [3, 3],
  ">=": [3, 3],
  and: [2, 2],
  or: [1, 1],
};
const UNARY_PRIORITY = 12;

const COMPOUND_OPS = new Set(["+=", "-=", "*=", "/=", "//=", "%=", "^=", "..="]);

const BLOCK_END = new Set(["end", "else", "elseif", "until"]);

export class Parser {
  private p = 0;
  private readonly tokens: Token[];
  /** Depth of enclosing loops, for `break`/`continue` validation. */
  private loopDepth = 0;

  constructor(source: string, base?: Pos) {
    this.tokens = tokenize(source, base);
  }

  // ---------------------------------------------------------------- tokens

  private get tok(): Token {
    return this.tokens[this.p];
  }

  private peekTok(n = 1): Token {
    return this.tokens[Math.min(this.p + n, this.tokens.length - 1)];
  }

  private is(value: string): boolean {
    const t = this.tok;
    return (t.kind === "op" || t.kind === "keyword") && t.value === value;
  }

  private isName(value?: string): boolean {
    return this.tok.kind === "name" && (value === undefined || this.tok.value === value);
  }

  private next(): Token {
    const t = this.tok;
    if (t.kind !== "eof") this.p++;
    return t;
  }

  private accept(value: string): Token | undefined {
    if (this.is(value)) return this.next();
    return undefined;
  }

  private expect(value: string, context?: string): Token {
    if (this.is(value)) return this.next();
    const got = this.describe(this.tok);
    throw new LuauSyntaxError(
      `Expected '${value}'${context ? ` ${context}` : ""}, got ${got}`,
      this.tok.start,
      this.tok.end,
    );
  }

  /** `expect` for a block terminator, naming where the block opened. */
  private expectClose(value: string, opener: Token): Token {
    if (this.is(value)) return this.next();
    throw new LuauSyntaxError(
      `Expected '${value}' (to close '${opener.value}' at line ${opener.start.line}), got ${this.describe(this.tok)}`,
      this.tok.start,
      this.tok.end,
    );
  }

  private expectName(context: string): Token {
    if (this.tok.kind === "name") return this.next();
    throw new LuauSyntaxError(`Expected identifier ${context}, got ${this.describe(this.tok)}`, this.tok.start, this.tok.end);
  }

  private describe(t: Token): string {
    if (t.kind === "eof") return "<eof>";
    if (t.kind === "string") return "string";
    if (t.kind === "interp") return "interpolated string";
    return `'${t.value}'`;
  }

  private loc(start: Pos): Loc {
    const prev = this.tokens[Math.max(0, this.p - 1)];
    return { start, end: prev.end };
  }

  // ---------------------------------------------------------------- chunk

  parseChunk(): Chunk {
    const block = this.parseBlock();
    if (this.tok.kind !== "eof") {
      throw new LuauSyntaxError(`Expected <eof>, got ${this.describe(this.tok)}`, this.tok.start, this.tok.end);
    }
    return { block };
  }

  private parseBlock(): Block {
    const start = this.tok.start;
    const body: Stat[] = [];
    for (;;) {
      const t = this.tok;
      if (t.kind === "eof") break;
      if (t.kind === "keyword" && BLOCK_END.has(t.value)) break;
      if (this.is("return")) {
        body.push(this.parseReturn());
        this.accept(";");
        // Nothing may follow a return in its block.
        if (this.tok.kind !== "eof" && !(this.tok.kind === "keyword" && BLOCK_END.has(this.tok.value))) {
          throw new LuauSyntaxError(
            `Expected end of block after 'return', got ${this.describe(this.tok)}`,
            this.tok.start,
            this.tok.end,
          );
        }
        break;
      }
      const stat = this.parseStatement();
      if (stat) body.push(stat);
      this.accept(";");
      if (stat && (stat.kind === "Break" || stat.kind === "Continue")) {
        if (this.tok.kind !== "eof" && !(this.tok.kind === "keyword" && BLOCK_END.has(this.tok.value))) {
          throw new LuauSyntaxError(
            `Expected end of block after '${stat.kind === "Break" ? "break" : "continue"}'`,
            this.tok.start,
            this.tok.end,
          );
        }
      }
    }
    return { body, loc: this.loc(start) };
  }

  // ---------------------------------------------------------------- statements

  private parseStatement(): Stat | undefined {
    const t = this.tok;
    const start = t.start;

    if (t.kind === "attribute") {
      const attributes: string[] = [];
      while (this.tok.kind === "attribute") attributes.push(this.next().value);
      if (this.is("function")) return this.parseFunctionDecl(attributes);
      if (this.is("local") && this.peekTok().value === "function") {
        this.next();
        return this.parseLocalFunction(start, attributes);
      }
      throw new LuauSyntaxError("Attributes can only be applied to function declarations", this.tok.start);
    }

    if (t.kind === "keyword") {
      switch (t.value) {
        case "local": {
          this.next();
          if (this.is("function")) return this.parseLocalFunction(start, []);
          return this.parseLocal(start);
        }
        case "function":
          return this.parseFunctionDecl([]);
        case "if":
          return this.parseIf();
        case "while": {
          const opener = this.next();
          const cond = this.parseExpr();
          this.expect("do", "after 'while' condition");
          const body = this.parseLoopBody();
          this.expectClose("end", opener);
          return { kind: "While", cond, body, loc: this.loc(start) };
        }
        case "do": {
          const opener = this.next();
          const body = this.parseBlock();
          this.expectClose("end", opener);
          return { kind: "Do", body, loc: this.loc(start) };
        }
        case "for":
          return this.parseFor();
        case "repeat": {
          const opener = this.next();
          const body = this.parseLoopBody();
          this.expectClose("until", opener);
          const cond = this.parseExpr();
          return { kind: "Repeat", body, cond, loc: this.loc(start) };
        }
        case "break":
          this.next();
          if (this.loopDepth === 0) throw new LuauSyntaxError("'break' outside of a loop", start);
          return { kind: "Break", loc: this.loc(start) };
      }
    }

    if (t.kind === "name") {
      // Contextual keywords. Each is only a keyword when what follows could not
      // continue an expression statement, so `type(x)` and `continue = 1` keep
      // working as ordinary code.
      if (t.value === "continue" && this.continueIsStatement()) {
        this.next();
        if (this.loopDepth === 0) throw new LuauSyntaxError("'continue' outside of a loop", start);
        return { kind: "Continue", loc: this.loc(start) };
      }
      if (t.value === "type" && this.peekTok().kind === "name") {
        this.next();
        return this.parseTypeAlias(start, false);
      }
      if (t.value === "type" && this.peekTok().kind === "keyword" && this.peekTok().value === "function") {
        this.next();
        return this.parseTypeFunction(start, false);
      }
      if (t.value === "export" && this.peekTok().kind === "name" && this.peekTok().value === "type") {
        this.next();
        this.next();
        if (this.is("function")) return this.parseTypeFunction(start, true);
        return this.parseTypeAlias(start, true);
      }
    }

    return this.parseExprStatement();
  }

  private continueIsStatement(): boolean {
    const n = this.peekTok();
    if (n.kind === "eof") return true;
    if (n.kind === "keyword") return BLOCK_END.has(n.value) || n.value !== "and" && n.value !== "or";
    if (n.kind === "op") return n.value === ";";
    return n.kind === "name" || n.kind === "attribute";
  }

  private parseLoopBody(): Block {
    this.loopDepth++;
    try {
      return this.parseBlock();
    } finally {
      this.loopDepth--;
    }
  }

  private parseReturn(): Stat {
    const start = this.next().start;
    const values: Expr[] = [];
    const t = this.tok;
    const ends = t.kind === "eof" || (t.kind === "keyword" && BLOCK_END.has(t.value)) || this.is(";");
    if (!ends) values.push(...this.parseExprList());
    return { kind: "Return", values, loc: this.loc(start) };
  }

  private parseBinding(): LocalBinding {
    const name = this.expectName("in local declaration");
    const b: LocalBinding = { name: name.value, loc: { start: name.start, end: name.end } };
    if (this.accept("<")) {
      // Lua 5.4-style attributes are not Luau, but give a precise message.
      const attrib = this.expectName("as attribute");
      this.expect(">");
      throw new LuauSyntaxError(`Luau does not support local attributes like <${attrib.value}>`, name.start);
    }
    if (this.accept(":")) b.type = this.parseType();
    return b;
  }

  private parseLocal(start: Pos): Stat {
    const names: LocalBinding[] = [this.parseBinding()];
    while (this.accept(",")) names.push(this.parseBinding());
    const values: Expr[] = [];
    if (this.accept("=")) values.push(...this.parseExprList());
    return { kind: "Local", names, values, loc: this.loc(start) };
  }

  private parseLocalFunction(start: Pos, attributes: string[]): Stat {
    this.expect("function");
    const name = this.expectName("after 'local function'");
    const fn = this.parseFunctionBody(name.start);
    return {
      kind: "LocalFunction",
      name: name.value,
      nameLoc: { start: name.start, end: name.end },
      fn,
      attributes,
      loc: this.loc(start),
    };
  }

  private parseFunctionDecl(attributes: string[]): Stat {
    const start = this.expect("function").start;
    const first = this.expectName("after 'function'");
    let path: Expr = { kind: "Name", name: first.value, loc: { start: first.start, end: first.end } };
    while (this.is(".")) {
      this.next();
      const n = this.expectName("after '.'");
      path = { kind: "Member", object: path, name: n.value, loc: { start: first.start, end: n.end } };
    }
    let method: string | undefined;
    if (this.accept(":")) method = this.expectName("after ':'").value;
    const fn = this.parseFunctionBody(start, method !== undefined);
    return { kind: "FunctionDecl", path, method, fn, attributes, loc: this.loc(start) };
  }

  private parseGenericList(): string[] {
    const names: string[] = [];
    if (!this.accept("<")) return names;
    do {
      const n = this.expectName("in generic list");
      if (this.accept("...")) names.push(`${n.value}...`);
      else names.push(n.value);
      if (this.accept("=")) this.parseTypeOrPack();
    } while (this.accept(","));
    this.expect(">", "to close generic list");
    return names;
  }

  private parseFunctionBody(start: Pos, isMethod = false): FunctionBody {
    const generics = this.parseGenericList();
    const open = this.expect("(", "to start parameter list");
    const params: FunctionBody["params"] = [];
    if (isMethod) params.push({ name: "self", loc: { start: open.start, end: open.end } });
    let vararg = false;
    if (!this.is(")")) {
      do {
        if (this.accept("...")) {
          vararg = true;
          if (this.accept(":")) {
            if (this.tok.kind === "name" && this.peekTok().value === "...") {
              this.next();
              this.next();
            } else {
              this.parseType();
            }
          }
          break;
        }
        const n = this.expectName("in parameter list");
        const param: FunctionBody["params"][number] = { name: n.value, loc: { start: n.start, end: n.end } };
        if (this.accept(":")) param.type = this.parseType();
        params.push(param);
      } while (this.accept(","));
    }
    this.expect(")", "to close parameter list");
    let returnType: TypeNode | undefined;
    if (this.accept(":")) returnType = this.parseReturnType();
    const savedLoop = this.loopDepth;
    this.loopDepth = 0;
    let body: Block;
    try {
      body = this.parseBlock();
    } finally {
      this.loopDepth = savedLoop;
    }
    this.expect("end", `to close function starting at line ${start.line}`);
    return { params, vararg, generics, returnType, body, loc: this.loc(start) };
  }

  private parseIf(): Stat {
    const opener = this.next();
    const start = opener.start;
    const clauses: { cond: Expr; body: Block }[] = [];
    const cond = this.parseExpr();
    this.expect("then", "after 'if' condition");
    clauses.push({ cond, body: this.parseBlock() });
    let elseBlock: Block | undefined;
    for (;;) {
      if (this.accept("elseif")) {
        const c = this.parseExpr();
        this.expect("then", "after 'elseif' condition");
        clauses.push({ cond: c, body: this.parseBlock() });
        continue;
      }
      if (this.accept("else")) {
        elseBlock = this.parseBlock();
      }
      break;
    }
    this.expectClose("end", opener);
    return { kind: "If", clauses, else: elseBlock, loc: this.loc(start) };
  }

  private parseFor(): Stat {
    const opener = this.next();
    const start = opener.start;
    const first = this.parseBinding();
    if (this.accept("=")) {
      const from = this.parseExpr();
      this.expect(",", "in numeric for");
      const to = this.parseExpr();
      let step: Expr | undefined;
      if (this.accept(",")) step = this.parseExpr();
      this.expect("do", "in numeric for");
      const body = this.parseLoopBody();
      this.expectClose("end", opener);
      return { kind: "NumericFor", var: first, from, to, step, body, loc: this.loc(start) };
    }
    const vars = [first];
    while (this.accept(",")) vars.push(this.parseBinding());
    this.expect("in", "in generic for");
    const exprs = this.parseExprList();
    this.expect("do", "in generic for");
    const body = this.parseLoopBody();
    this.expectClose("end", opener);
    return { kind: "GenericFor", vars, exprs, body, loc: this.loc(start) };
  }

  private parseTypeAlias(start: Pos, exported: boolean): Stat {
    const name = this.expectName("in type alias");
    const generics = this.parseGenericList();
    this.expect("=", "in type alias");
    const type = this.parseType();
    return { kind: "TypeAlias", name: name.value, exported, generics, type, loc: this.loc(start) };
  }

  private parseTypeFunction(start: Pos, exported: boolean): Stat {
    this.expect("function");
    const name = this.expectName("in type function");
    const fn = this.parseFunctionBody(start);
    return { kind: "TypeFunction", name: name.value, exported, fn, loc: this.loc(start) };
  }

  private parseExprStatement(): Stat {
    const start = this.tok.start;
    const first = this.parseSuffixedExpr();

    if (this.is("=") || this.is(",")) {
      const targets = [first];
      while (this.accept(",")) targets.push(this.parseSuffixedExpr());
      for (const target of targets) this.assertAssignable(target);
      this.expect("=", "in assignment");
      const values = this.parseExprList();
      return { kind: "Assign", targets, values, loc: this.loc(start) };
    }

    if (this.tok.kind === "op" && COMPOUND_OPS.has(this.tok.value)) {
      const op = this.next().value;
      this.assertAssignable(first);
      const value = this.parseExpr();
      return { kind: "CompoundAssign", op, target: first, value, loc: this.loc(start) };
    }

    if (first.kind !== "Call" && first.kind !== "MethodCall") {
      const got = this.tok.kind === "eof" ? "<eof>" : this.describe(this.tok);
      throw new LuauSyntaxError(
        `Incomplete statement: expected assignment or a function call, got ${got}`,
        first.loc.start,
        this.tok.end,
      );
    }
    return { kind: "CallStat", call: first, loc: this.loc(start) };
  }

  private assertAssignable(e: Expr): void {
    if (e.kind !== "Name" && e.kind !== "Member" && e.kind !== "Index") {
      throw new LuauSyntaxError("Assigned expression must be a variable or a field", e.loc.start, e.loc.end);
    }
  }

  // ---------------------------------------------------------------- expressions

  parseExprList(): Expr[] {
    const list = [this.parseExpr()];
    while (this.accept(",")) list.push(this.parseExpr());
    return list;
  }

  parseExpr(limit = 0): Expr {
    const start = this.tok.start;
    let left: Expr;
    const t = this.tok;
    if ((t.kind === "keyword" && t.value === "not") || (t.kind === "op" && (t.value === "-" || t.value === "#"))) {
      const op = this.next().value;
      const arg = this.parseExpr(UNARY_PRIORITY);
      left = { kind: "Unary", op, arg, loc: this.loc(start) };
    } else {
      left = this.parseAssertionExpr();
    }

    for (;;) {
      const opTok = this.tok;
      if (opTok.kind !== "op" && opTok.kind !== "keyword") break;
      const prio = BINARY_PRIORITY[opTok.value];
      if (!prio || prio[0] <= limit) break;
      this.next();
      const right = this.parseExpr(prio[1]);
      left = { kind: "Binary", op: opTok.value, left, right, loc: this.loc(start) };
    }
    return left;
  }

  private parseAssertionExpr(): Expr {
    const start = this.tok.start;
    let e = this.parseSimpleExpr();
    while (this.accept("::")) {
      const type = this.parseType();
      e = { kind: "TypeAssertion", expr: e, type, loc: this.loc(start) };
    }
    return e;
  }

  private parseSimpleExpr(): Expr {
    const t = this.tok;
    const start = t.start;
    if (t.kind === "number") {
      this.next();
      return { kind: "Number", raw: t.value, value: parseLuauNumber(t.value), loc: this.loc(start) };
    }
    if (t.kind === "string") {
      this.next();
      return { kind: "String", value: t.value, loc: this.loc(start) };
    }
    if (t.kind === "interp") {
      this.next();
      return this.buildInterp(t);
    }
    if (t.kind === "keyword") {
      switch (t.value) {
        case "nil":
          this.next();
          return { kind: "Nil", loc: this.loc(start) };
        case "true":
        case "false":
          this.next();
          return { kind: "Boolean", value: t.value === "true", loc: this.loc(start) };
        case "function": {
          this.next();
          const fn = this.parseFunctionBody(start);
          return { kind: "Function", fn, loc: this.loc(start) };
        }
        case "if":
          return this.parseIfElseExpr();
      }
    }
    if (t.kind === "attribute") {
      while (this.tok.kind === "attribute") this.next();
      const fnStart = this.expect("function").start;
      const fn = this.parseFunctionBody(fnStart);
      return { kind: "Function", fn, loc: this.loc(start) };
    }
    if (this.is("...")) {
      this.next();
      return { kind: "Vararg", loc: this.loc(start) };
    }
    if (this.is("{")) return this.parseTable();
    return this.parseSuffixedExpr();
  }

  private buildInterp(t: Token): Expr {
    const strings: string[] = [];
    const exprs: Expr[] = [];
    for (const part of t.parts ?? []) {
      strings.push(part.text);
      if (part.expr) {
        const sub = new Parser(part.expr.source, part.expr.start);
        const e = sub.parseExpr();
        if (sub.tok.kind !== "eof") {
          throw new LuauSyntaxError("Malformed expression in interpolated string", part.expr.start);
        }
        exprs.push(e);
      }
    }
    return { kind: "Interp", strings, exprs, loc: { start: t.start, end: t.end } };
  }

  private parseIfElseExpr(): Expr {
    const start = this.expect("if").start;
    const cond = this.parseExpr();
    this.expect("then", "in if-expression");
    const then = this.parseExpr();
    const elseifs: { cond: Expr; then: Expr }[] = [];
    while (this.accept("elseif")) {
      const c = this.parseExpr();
      this.expect("then", "in if-expression");
      elseifs.push({ cond: c, then: this.parseExpr() });
    }
    this.expect("else", "in if-expression (an if-expression must have an else branch)");
    const elseExpr = this.parseExpr();
    return { kind: "IfElse", cond, then, elseifs, else: elseExpr, loc: this.loc(start) };
  }

  private parsePrimaryExpr(): Expr {
    const t = this.tok;
    const start = t.start;
    if (t.kind === "name") {
      this.next();
      return { kind: "Name", name: t.value, loc: this.loc(start) };
    }
    if (this.is("(")) {
      const open = this.next();
      const expr = this.parseExpr();
      this.expectClose(")", open);
      return { kind: "Paren", expr, loc: this.loc(start) };
    }
    throw new LuauSyntaxError(`Expected identifier when parsing expression, got ${this.describe(t)}`, t.start, t.end);
  }

  private parseSuffixedExpr(): Expr {
    const start = this.tok.start;
    let e = this.parsePrimaryExpr();
    for (;;) {
      const t = this.tok;
      if (this.is(".")) {
        this.next();
        const n = this.expectName("after '.'");
        e = { kind: "Member", object: e, name: n.value, loc: this.loc(start) };
        continue;
      }
      if (this.is("[")) {
        this.next();
        const key = this.parseExpr();
        this.expect("]", "to close index");
        e = { kind: "Index", object: e, key, loc: this.loc(start) };
        continue;
      }
      if (this.is(":")) {
        // `a:b(...)`; in statement position a stray ':' is almost always a
        // type annotation on a global, which Luau does not allow.
        this.next();
        const n = this.expectName("after ':' in method call");
        const args = this.parseCallArgs(true);
        e = {
          kind: "MethodCall",
          object: e,
          method: n.value,
          methodLoc: { start: n.start, end: n.end },
          args,
          loc: this.loc(start),
        };
        continue;
      }
      if (this.is("(") || this.is("{") || t.kind === "string" || t.kind === "interp") {
        // Lua's ambiguity rule: a call's '(' must be on the same line.
        if (this.is("(") && t.start.line !== this.tokens[this.p - 1].end.line) {
          throw new LuauSyntaxError(
            "Ambiguous syntax: this looks like a function call but the '(' is on a new line. Add a ';' or join the lines.",
            t.start,
          );
        }
        const args = this.parseCallArgs(false);
        e = { kind: "Call", callee: e, args, loc: this.loc(start) };
        continue;
      }
      return e;
    }
  }

  private parseCallArgs(method: boolean): Expr[] {
    const t = this.tok;
    if (t.kind === "string") {
      this.next();
      return [{ kind: "String", value: t.value, loc: { start: t.start, end: t.end } }];
    }
    if (t.kind === "interp") {
      throw new LuauSyntaxError("Interpolated strings cannot be used as a call argument without parentheses", t.start);
    }
    if (this.is("{")) return [this.parseTable()];
    if (!this.is("(")) {
      throw new LuauSyntaxError(
        method ? `Expected '(' for method call arguments, got ${this.describe(t)}` : `Expected function arguments, got ${this.describe(t)}`,
        t.start,
        t.end,
      );
    }
    const open = this.next();
    if (this.accept(")")) return [];
    const args = this.parseExprList();
    this.expectClose(")", open);
    return args;
  }

  private parseTable(): Expr {
    const open = this.expect("{");
    const start = open.start;
    const fields: TableField[] = [];
    while (!this.is("}")) {
      if (this.is("[")) {
        this.next();
        const key = this.parseExpr();
        this.expect("]", "in table key");
        this.expect("=", "after table key");
        fields.push({ kind: "Keyed", key, value: this.parseExpr() });
      } else if (this.tok.kind === "name" && this.peekTok().kind === "op" && this.peekTok().value === "=") {
        const name = this.next().value;
        this.next();
        fields.push({ kind: "Named", name, value: this.parseExpr() });
      } else {
        fields.push({ kind: "Positional", value: this.parseExpr() });
      }
      if (!this.accept(",") && !this.accept(";")) break;
    }
    this.expectClose("}", open);
    return { kind: "Table", fields, loc: this.loc(start) };
  }

  // ---------------------------------------------------------------- types

  private parseReturnType(): TypeNode {
    return this.parseTypeOrPack();
  }

  /** A type, or a parenthesised type pack like `(number, string)` / `()`. */
  private parseTypeOrPack(): TypeNode {
    if (this.is("(")) {
      const start = this.tok.start;
      const saved = this.p;
      const pack = this.tryParseParenTypeList();
      if (pack && !this.is("->")) {
        if (pack.types.length === 1 && !pack.variadic && !pack.named) {
          this.p = saved;
          return this.parseType();
        }
        return { kind: "TypePack", types: pack.types, variadic: pack.variadic, loc: this.loc(start) };
      }
      this.p = saved;
    }
    if (this.is("...")) {
      const start = this.next().start;
      return { kind: "TypeVariadic", type: this.parseType(), loc: this.loc(start) };
    }
    if (this.tok.kind === "name" && this.peekTok().value === "...") {
      const start = this.tok.start;
      const name = this.next().value;
      this.next();
      return { kind: "TypeGenericPack", name, loc: this.loc(start) };
    }
    return this.parseType();
  }

  private tryParseParenTypeList(): { types: TypeNode[]; variadic?: TypeNode; named: boolean } | undefined {
    this.expect("(");
    const types: TypeNode[] = [];
    let variadic: TypeNode | undefined;
    let named = false;
    if (!this.is(")")) {
      do {
        if (this.is("...")) {
          this.next();
          variadic = this.parseType();
          break;
        }
        if (this.tok.kind === "name" && this.peekTok().value === "...") {
          const start = this.tok.start;
          const name = this.next().value;
          this.next();
          variadic = { kind: "TypeGenericPack", name, loc: this.loc(start) };
          break;
        }
        // Named function-type parameter: `(x: number) -> ()`.
        if (this.tok.kind === "name" && this.peekTok().value === ":" ) {
          this.next();
          this.next();
          named = true;
        }
        types.push(this.parseType());
      } while (this.accept(","));
    }
    this.expect(")", "to close type list");
    return { types, variadic, named };
  }

  parseType(): TypeNode {
    const start = this.tok.start;
    // Leading `|` / `&` are permitted in multi-line unions.
    const leading = this.is("|") ? "|" : this.is("&") ? "&" : undefined;
    if (leading) this.next();
    const first = this.parseSimpleTypeWithSuffix();
    const op = leading ?? (this.is("|") ? "|" : this.is("&") ? "&" : undefined);
    if (!op || (!this.is(op) && !leading)) return first;
    const types = [first];
    while (this.accept(op)) types.push(this.parseSimpleTypeWithSuffix());
    if (this.is(op === "|" ? "&" : "|")) {
      throw new LuauSyntaxError("Mixing union and intersection types is not allowed; add parentheses", this.tok.start);
    }
    if (types.length === 1) return first;
    return op === "|"
      ? { kind: "TypeUnion", types, loc: this.loc(start) }
      : { kind: "TypeIntersection", types, loc: this.loc(start) };
  }

  private parseSimpleTypeWithSuffix(): TypeNode {
    const start = this.tok.start;
    let t = this.parseSimpleType();
    while (this.is("?")) {
      this.next();
      t = { kind: "TypeOptional", type: t, loc: this.loc(start) };
    }
    return t;
  }

  private parseSimpleType(): TypeNode {
    const t = this.tok;
    const start = t.start;
    if (t.kind === "keyword" && t.value === "nil") {
      this.next();
      return { kind: "TypeRef", name: "nil", params: [], loc: this.loc(start) };
    }
    if (t.kind === "keyword" && (t.value === "true" || t.value === "false")) {
      this.next();
      return { kind: "TypeSingleton", value: t.value === "true", loc: this.loc(start) };
    }
    if (t.kind === "string") {
      this.next();
      return { kind: "TypeSingleton", value: t.value, loc: this.loc(start) };
    }
    if (t.kind === "name") {
      if (t.value === "typeof" && this.peekTok().value === "(") {
        this.next();
        const open = this.next();
        const expr = this.parseExpr();
        this.expectClose(")", open);
        return { kind: "TypeTypeof", expr, loc: this.loc(start) };
      }
      this.next();
      let name = t.value;
      let prefix: string | undefined;
      if (this.is(".")) {
        this.next();
        prefix = name;
        name = this.expectName("in qualified type name").value;
      }
      const params: TypeNode[] = [];
      if (this.accept("<")) {
        if (!this.is(">")) {
          do params.push(this.parseTypeOrPack());
          while (this.accept(","));
        }
        this.expect(">", "to close type parameters");
      }
      return { kind: "TypeRef", name, prefix, params, loc: this.loc(start) };
    }
    if (this.is("{")) return this.parseTableType();
    if (this.is("(") || this.is("<")) return this.parseFunctionType();
    throw new LuauSyntaxError(`Expected type, got ${this.describe(t)}`, t.start, t.end);
  }

  private parseFunctionType(): TypeNode {
    const start = this.tok.start;
    if (this.is("<")) this.parseGenericList();
    const saved = this.p;
    const list = this.tryParseParenTypeList();
    if (!list) {
      this.p = saved;
      throw new LuauSyntaxError("Malformed function type", start);
    }
    if (this.accept("->")) {
      const ret = this.parseTypeOrPack();
      return { kind: "TypeFunction", params: list.types, returns: [ret], loc: this.loc(start) };
    }
    if (list.types.length === 1 && !list.variadic && !list.named) {
      return list.types[0];
    }
    throw new LuauSyntaxError("Expected '->' after type list in function type", this.tok.start);
  }

  private parseTableType(): TypeNode {
    const open = this.expect("{");
    const start = open.start;
    const props: { name: string; type: TypeNode }[] = [];
    let indexer: { key: TypeNode; value: TypeNode } | undefined;

    // Array shorthand: `{T}`.
    if (!this.is("}") && !this.isPropStart()) {
      const element = this.parseType();
      this.expectClose("}", open);
      return {
        kind: "TypeTable",
        props,
        indexer: { key: { kind: "TypeRef", name: "number", params: [], loc: element.loc }, value: element },
        loc: this.loc(start),
      };
    }

    while (!this.is("}")) {
      if (this.isName("read") || this.isName("write")) {
        const n = this.peekTok();
        if (n.kind === "name" || (n.kind === "op" && n.value === "[")) this.next();
      }
      if (this.is("[")) {
        this.next();
        const key = this.parseType();
        this.expect("]", "in table type indexer");
        this.expect(":", "in table type indexer");
        const value = this.parseType();
        if (key.kind === "TypeSingleton" && typeof key.value === "string") {
          props.push({ name: key.value, type: value });
        } else {
          indexer = { key, value };
        }
      } else {
        const name = this.expectName("in table type");
        this.expect(":", `after table type property '${name.value}'`);
        props.push({ name: name.value, type: this.parseType() });
      }
      if (!this.accept(",") && !this.accept(";")) break;
    }
    this.expectClose("}", open);
    return { kind: "TypeTable", props, indexer, loc: this.loc(start) };
  }

  private isPropStart(): boolean {
    if (this.is("[")) return true;
    if (this.tok.kind !== "name") return false;
    const n = this.peekTok();
    if (n.kind === "op" && n.value === ":") return true;
    if ((this.tok.value === "read" || this.tok.value === "write") && (n.kind === "name" || n.value === "[")) {
      return true;
    }
    return false;
  }
}

export function parseLuauNumber(raw: string): number {
  const clean = raw.replace(/_/g, "");
  if (/^0[xX]/.test(clean)) return parseInt(clean.slice(2), 16);
  if (/^0[bB]/.test(clean)) return parseInt(clean.slice(2), 2);
  return Number(clean);
}

export interface ParseResult {
  chunk?: Chunk;
  error?: { message: string; line: number; col: number; endLine?: number; endCol?: number };
}

/** Parses Luau source. Never throws: a syntax error is returned, positioned. */
export function parseLuau(source: string): ParseResult {
  try {
    const chunk = new Parser(source).parseChunk();
    const mode = /^\s*--!(strict|nonstrict|nocheck|native|optimize\s*\d)/m.exec(source)?.[1];
    chunk.mode = mode;
    return { chunk };
  } catch (err) {
    if (err instanceof LuauSyntaxError) {
      return {
        error: {
          message: err.message,
          line: err.pos.line,
          col: err.pos.col,
          endLine: err.endPos?.line,
          endCol: err.endPos?.col,
        },
      };
    }
    throw err;
  }
}
