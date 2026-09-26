// Semantic analysis of one Luau script in its Roblox context.
//
// Two outputs. Diagnostics that can be decided from this file alone (syntax,
// unknown globals, deprecated APIs, client/server boundary mistakes, unguarded
// DataStore calls, unvalidated remote arguments, busy loops), and `facts`: the
// instance references, requires and runtime-created instances the project
// validator needs to check this script against the rest of the DataModel.

import type { Diagnostic, TextEdit } from "../diagnostics";
import type { Block, Expr, FunctionBody, Loc, Stat, TypeNode } from "./ast";
import {
  CLIENT_ONLY_MEMBERS,
  CLIENT_ONLY_SERVICES,
  DATASTORE_METHODS,
  DEPRECATED_CLASSES,
  DEPRECATED_GLOBALS,
  DEPRECATED_METHODS,
  HTTP_SERVER_METHODS,
  LUAU_GLOBALS,
  ROBLOX_GLOBALS,
  SERVER_ONLY_MEMBERS,
  SERVER_ONLY_SERVICES,
  SERVICES,
  suggest,
} from "./globals";
import { parseLuau } from "./parser";

export type ScriptContext = "server" | "client" | "module" | "plugin";

/**
 * A statically-known path into the DataModel. `game` paths start with the
 * service name; `script` paths are relative, with ".." for `.Parent`.
 */
export interface InstanceRef {
  root: "game" | "script";
  segments: RefSegment[];
}

export interface RefSegment {
  name: string;
  /** `hard`: WaitForChild/FindFirstChild/GetService; `soft`: `.Name` or `["Name"]` indexing. */
  mode: "hard" | "soft" | "parent";
  via?: "WaitForChild" | "FindFirstChild" | "index" | "GetService";
}

export interface RefUse {
  ref: InstanceRef;
  loc: Loc;
  /** How the final segment was reached. */
  via: "require" | "WaitForChild" | "FindFirstChild" | "index";
}

export interface CreatedInstance {
  className: string;
  name?: string;
  parent?: InstanceRef;
  /** Created in a loop or with a computed name: any child name may exist under `parent`. */
  dynamicName: boolean;
  loc: Loc;
}

export interface ScriptFacts {
  services: string[];
  refs: RefUse[];
  requires: RefUse[];
  created: CreatedInstance[];
  /** Server-only APIs this script touches (for modules replicated to clients). */
  serverOnlyUses: string[];
  clientOnlyUses: string[];
  /** Remote objects this script fires or listens on, by final name. */
  remoteCalls: { name?: string; member: string; loc: Loc; ref?: InstanceRef }[];
  instanceNewClasses: { className: string; loc: Loc }[];
}

export interface AnalysisResult {
  ok: boolean;
  diagnostics: Diagnostic[];
  facts: ScriptFacts;
}

interface VarInfo {
  name: string;
  loc: Loc;
  used: boolean;
  isParam: boolean;
  ref?: InstanceRef;
  created?: CreatedInstance;
  /** A service bound with GetService, remembered by name. */
  service?: string;
}

class Scope {
  readonly vars = new Map<string, VarInfo>();
  constructor(readonly parent?: Scope) {}
  lookup(name: string): VarInfo | undefined {
    return this.vars.get(name) ?? this.parent?.lookup(name);
  }
}

const VALIDATOR_CALLS = new Set(["typeof", "type", "tonumber", "tostring", "assert", "math.clamp", "table.find"]);

export function analyzeLuau(source: string, context: ScriptContext, file?: string): AnalysisResult {
  const facts: ScriptFacts = {
    services: [],
    refs: [],
    requires: [],
    created: [],
    serverOnlyUses: [],
    clientOnlyUses: [],
    remoteCalls: [],
    instanceNewClasses: [],
  };
  const parsed = parseLuau(source);
  if (!parsed.chunk) {
    const e = parsed.error!;
    return {
      ok: false,
      diagnostics: [
        {
          rule: "luau/syntax",
          severity: "error",
          category: "syntax",
          message: `Syntax error: ${e.message}`,
          file,
          line: e.line,
          col: e.col,
          endLine: e.endLine,
          endCol: e.endCol,
        },
      ],
      facts,
    };
  }
  const walker = new Walker(context, file, facts);
  walker.run(parsed.chunk.block);
  return { ok: !walker.diagnostics.some((d) => d.severity === "error"), diagnostics: walker.diagnostics, facts };
}

class Walker {
  readonly diagnostics: Diagnostic[] = [];
  private scope = new Scope();
  private readonly globalsAssigned = new Set<string>();
  private pcallDepth = 0;
  private readonly allScopes: Scope[] = [];

  constructor(
    private readonly context: ScriptContext,
    private readonly file: string | undefined,
    private readonly facts: ScriptFacts,
  ) {}

  run(block: Block): void {
    this.collectGlobals(block);
    this.allScopes.push(this.scope);
    this.walkBlock(block, false);
    this.reportUnused();
    for (const v of this.createdVars) {
      if (v.created) this.facts.created.push(v.created);
    }
  }

  private readonly createdVars: VarInfo[] = [];

  // ------------------------------------------------------------ reporting

  private report(
    rule: string,
    severity: Diagnostic["severity"],
    category: Diagnostic["category"],
    message: string,
    loc: Loc,
    fix?: { description: string; edits: TextEdit[] },
  ): void {
    this.diagnostics.push({
      rule,
      severity,
      category,
      message,
      file: this.file,
      line: loc.start.line,
      col: loc.start.col,
      endLine: loc.end.line,
      endCol: loc.end.col,
      fix: fix && this.file ? { kind: "text-edits", file: this.file, edits: fix.edits, description: fix.description } : undefined,
    });
  }

  private replaceFix(loc: Loc, text: string, description: string) {
    return {
      description,
      edits: [{ line: loc.start.line, col: loc.start.col, endLine: loc.end.line, endCol: loc.end.col, text }],
    };
  }

  // ------------------------------------------------------------ scopes

  private push(): void {
    this.scope = new Scope(this.scope);
    this.allScopes.push(this.scope);
  }

  private pop(): void {
    this.scope = this.scope.parent!;
  }

  private declare(name: string, loc: Loc, isParam = false): VarInfo {
    const v: VarInfo = { name, loc, used: false, isParam };
    this.scope.vars.set(name, v);
    return v;
  }

  private reportUnused(): void {
    for (const scope of this.allScopes) {
      for (const v of scope.vars.values()) {
        if (v.used || v.name.startsWith("_") || v.name === "self") continue;
        if (v.isParam) continue;
        this.report(
          "luau/unused-local",
          "info",
          "script",
          `Local '${v.name}' is never used`,
          v.loc,
        );
      }
    }
  }

  private collectGlobals(block: Block): void {
    const visit = (b: Block) => {
      for (const s of b.body) {
        if (s.kind === "Assign") {
          for (const t of s.targets) if (t.kind === "Name") this.globalsAssigned.add(t.name);
        }
        if (s.kind === "FunctionDecl" && s.path.kind === "Name" && !s.method) this.globalsAssigned.add(s.path.name);
        for (const child of childBlocks(s)) visit(child);
      }
    };
    visit(block);
  }

  // ------------------------------------------------------------ statements

  private walkBlock(block: Block, newScope = true): void {
    if (newScope) this.push();
    for (const s of block.body) this.walkStat(s);
    if (newScope) this.pop();
  }

  private walkStat(s: Stat): void {
    switch (s.kind) {
      case "Local": {
        for (const v of s.values) this.walkExpr(v);
        for (const b of s.names) if (b.type) this.walkType(b.type);
        s.names.forEach((b, i) => {
          const v = this.declare(b.name, b.loc);
          const value = s.values[i];
          if (value && s.names.length === 1) this.bindValue(v, value);
        });
        return;
      }
      case "LocalFunction": {
        const v = this.declare(s.name, s.nameLoc);
        v.used = v.used || false;
        this.walkFunction(s.fn);
        return;
      }
      case "FunctionDecl": {
        this.walkExpr(s.path, true);
        if (s.path.kind === "Name" && !s.method && this.context !== "module") {
          const v = this.scope.lookup(s.path.name);
          if (!v) {
            this.report(
              "luau/global-function",
              "info",
              "script",
              `'${s.path.name}' is declared as a global function; prefer 'local function ${s.path.name}'`,
              s.loc,
            );
          }
        }
        this.walkFunction(s.fn);
        return;
      }
      case "Assign": {
        for (const v of s.values) this.walkExpr(v);
        s.targets.forEach((t, i) => {
          this.walkAssignTarget(t);
          this.trackCreatedAssignment(t, s.values[i]);
          if (t.kind === "Member" && (t.name === "OnServerInvoke" || t.name === "OnClientInvoke")) {
            this.checkRemoteMember(t.name, t.object, t.loc);
            const fn = s.values[i];
            if (t.name === "OnServerInvoke" && fn?.kind === "Function") this.checkRemoteHandler(fn.fn, "OnServerInvoke");
          }
          if (t.kind === "Member" && t.name === "ProcessReceipt" && this.context === "client") {
            this.report("roblox/client-server", "error", "client-server", SERVER_ONLY_MEMBERS.ProcessReceipt, t.loc);
          }
        });
        return;
      }
      case "CompoundAssign":
        this.walkAssignTarget(s.target);
        this.walkExpr(s.value);
        return;
      case "CallStat":
        this.walkExpr(s.call);
        return;
      case "Do":
        this.walkBlock(s.body);
        return;
      case "While":
        this.walkExpr(s.cond);
        if (s.cond.kind === "Boolean" && s.cond.value && !blockYields(s.body)) {
          this.report(
            "luau/busy-loop",
            "warning",
            "performance",
            "'while true do' loop never yields; it will freeze the game until Roblox kills the script. Add task.wait() or wait on an event.",
            s.loc,
          );
        }
        this.walkBlock(s.body);
        return;
      case "Repeat":
        this.push();
        for (const st of s.body.body) this.walkStat(st);
        this.walkExpr(s.cond);
        this.pop();
        return;
      case "If":
        for (const c of s.clauses) {
          this.walkExpr(c.cond);
          this.walkBlock(c.body);
        }
        if (s.else) this.walkBlock(s.else);
        return;
      case "NumericFor":
        this.walkExpr(s.from);
        this.walkExpr(s.to);
        if (s.step) this.walkExpr(s.step);
        this.push();
        this.declare(s.var.name, s.var.loc).used = true;
        this.loopDepth++;
        this.walkBlock(s.body);
        this.loopDepth--;
        this.pop();
        return;
      case "GenericFor":
        for (const e of s.exprs) this.walkExpr(e);
        this.push();
        for (const v of s.vars) this.declare(v.name, v.loc, true);
        this.loopDepth++;
        this.walkBlock(s.body);
        this.loopDepth--;
        this.pop();
        return;
      case "Return":
        for (const v of s.values) this.walkExpr(v);
        return;
      case "TypeAlias":
        this.walkType(s.type);
        return;
      case "TypeFunction":
        return;
      case "Break":
      case "Continue":
        return;
    }
  }

  private loopDepth = 0;

  private walkFunction(fn: FunctionBody): void {
    this.push();
    for (const p of fn.params) {
      this.declare(p.name, p.loc, true);
      if (p.type) this.walkType(p.type);
    }
    const savedLoop = this.loopDepth;
    this.loopDepth = 0;
    this.walkBlock(fn.body, false);
    this.loopDepth = savedLoop;
    this.pop();
  }

  private walkType(t: TypeNode): void {
    switch (t.kind) {
      case "TypeTypeof":
        this.walkExpr(t.expr);
        return;
      case "TypeRef":
        t.params.forEach((p) => this.walkType(p));
        return;
      case "TypeFunction":
        t.params.forEach((p) => this.walkType(p));
        t.returns.forEach((p) => this.walkType(p));
        return;
      case "TypeTable":
        t.props.forEach((p) => this.walkType(p.type));
        if (t.indexer) {
          this.walkType(t.indexer.key);
          this.walkType(t.indexer.value);
        }
        return;
      case "TypeUnion":
      case "TypeIntersection":
      case "TypePack":
        t.types.forEach((x) => this.walkType(x));
        return;
      case "TypeOptional":
      case "TypeVariadic":
        this.walkType(t.type);
        return;
      default:
        return;
    }
  }

  private walkAssignTarget(t: Expr): void {
    if (t.kind === "Name") {
      const v = this.scope.lookup(t.name);
      if (v) {
        // Reassignment invalidates anything we inferred from the initializer.
        v.ref = undefined;
        v.service = undefined;
      }
      return;
    }
    this.walkExpr(t);
  }

  private bindValue(v: VarInfo, value: Expr): void {
    const ref = this.refOf(value);
    if (ref) v.ref = ref;
    const service = serviceOf(value, (n) => this.scope.lookup(n));
    if (service) v.service = service;
    const created = this.instanceNewOf(value);
    if (created) {
      v.created = created;
      if (this.loopDepth > 0) created.dynamicName = true;
      this.createdVars.push(v);
    }
  }

  private instanceNewOf(e: Expr): CreatedInstance | undefined {
    if (e.kind !== "Call") return undefined;
    if (!isMember(e.callee, "Instance", "new")) return undefined;
    const cls = e.args[0];
    if (cls?.kind !== "String") return undefined;
    const parent = e.args[1] ? this.refOf(e.args[1]) : undefined;
    return { className: cls.value, parent, dynamicName: false, loc: e.loc };
  }

  private trackCreatedAssignment(target: Expr, value: Expr | undefined): void {
    if (target.kind !== "Member" || target.object.kind !== "Name" || !value) return;
    const v = this.scope.lookup(target.object.name);
    if (!v?.created) return;
    if (target.name === "Name") {
      if (value.kind === "String") v.created.name = value.value;
      else v.created.dynamicName = true;
    } else if (target.name === "Parent") {
      v.created.parent = this.refOf(value);
    }
  }

  // ------------------------------------------------------------ expressions

  private walkExpr(e: Expr, declaringPath = false): void {
    switch (e.kind) {
      case "Name": {
        const v = this.scope.lookup(e.name);
        if (v) {
          v.used = true;
          return;
        }
        if (declaringPath) return;
        this.checkGlobal(e.name, e.loc);
        return;
      }
      case "Member":
        this.walkExpr(e.object, declaringPath);
        this.checkMemberAccess(e);
        return;
      case "Index":
        this.walkExpr(e.object);
        this.walkExpr(e.key);
        if (e.key.kind === "String") {
          const ref = this.refOf(e);
          if (ref) this.facts.refs.push({ ref, loc: e.loc, via: "index" });
        }
        return;
      case "Call":
        this.walkCall(e);
        return;
      case "MethodCall":
        this.walkMethodCall(e);
        return;
      case "Function":
        this.walkFunction(e.fn);
        return;
      case "Table":
        for (const f of e.fields) {
          if (f.kind === "Keyed") this.walkExpr(f.key);
          this.walkExpr(f.value);
        }
        return;
      case "Binary":
        this.walkExpr(e.left);
        this.walkExpr(e.right);
        return;
      case "Unary":
        this.walkExpr(e.arg);
        return;
      case "Paren":
        this.walkExpr(e.expr);
        return;
      case "IfElse":
        this.walkExpr(e.cond);
        this.walkExpr(e.then);
        for (const b of e.elseifs) {
          this.walkExpr(b.cond);
          this.walkExpr(b.then);
        }
        this.walkExpr(e.else);
        return;
      case "TypeAssertion":
        this.walkExpr(e.expr);
        this.walkType(e.type);
        return;
      case "Interp":
        for (const x of e.exprs) this.walkExpr(x);
        return;
      default:
        return;
    }
  }

  private checkGlobal(name: string, loc: Loc): void {
    if (LUAU_GLOBALS.has(name) || ROBLOX_GLOBALS.has(name) || this.globalsAssigned.has(name)) {
      const dep = DEPRECATED_GLOBALS[name];
      if (dep) {
        this.report(
          "luau/deprecated-global",
          "warning",
          "deprecated",
          `'${name}' is deprecated; use ${dep.replacement}`,
          loc,
          dep.fix ? this.replaceFix(loc, dep.fix, `Replace '${name}' with '${dep.fix}'`) : undefined,
        );
      }
      if (name === "loadstring") {
        this.report(
          "luau/loadstring",
          "warning",
          "security",
          "loadstring is disabled by default (ServerScriptService.LoadStringEnabled) and is a common exploit vector",
          loc,
        );
      }
      return;
    }
    const all = [...LUAU_GLOBALS, ...ROBLOX_GLOBALS, ...this.visibleLocals()];
    const guess = suggest(name, all);
    this.report(
      "luau/unknown-global",
      guess ? "error" : "warning",
      "script",
      guess ? `Unknown global '${name}'; did you mean '${guess}'?` : `Unknown global '${name}' (it will be nil at runtime)`,
      loc,
      guess ? this.replaceFix(loc, guess, `Replace '${name}' with '${guess}'`) : undefined,
    );
  }

  private visibleLocals(): string[] {
    const out: string[] = [];
    for (let s: Scope | undefined = this.scope; s; s = s.parent) out.push(...s.vars.keys());
    return out;
  }

  private checkMemberAccess(e: Extract<Expr, { kind: "Member" }>): void {
    const ref = this.refOf(e);
    if (ref) this.facts.refs.push({ ref, loc: e.loc, via: "index" });

    const clientMsg = CLIENT_ONLY_MEMBERS[e.name];
    if (clientMsg && isEventOrProp(e.name)) {
      this.facts.clientOnlyUses.push(e.name);
      if (this.context === "server") {
        this.report("roblox/client-server", "error", "client-server", clientMsg, e.loc);
      }
      if (e.name === "OnClientEvent" || e.name === "OnClientInvoke") this.checkRemoteMember(e.name, e.object, e.loc);
    }
    const serverMsg = SERVER_ONLY_MEMBERS[e.name];
    if (serverMsg && isEventOrProp(e.name)) {
      this.facts.serverOnlyUses.push(e.name);
      if (this.context === "client") {
        this.report("roblox/client-server", "error", "client-server", serverMsg, e.loc);
      }
      if (e.name === "OnServerEvent" || e.name === "OnServerInvoke") this.checkRemoteMember(e.name, e.object, e.loc);
    }
  }

  private checkRemoteMember(member: string, object: Expr, loc: Loc): void {
    const ref = this.refOf(object);
    let name = ref?.segments[ref.segments.length - 1]?.name;
    // Wrapper modules (`Net.event("Buy")`, `Remotes:Get("Buy")`) name the
    // remote with their first string argument.
    if (!name && (object.kind === "Call" || object.kind === "MethodCall") && object.args[0]?.kind === "String") {
      name = object.args[0].value;
    }
    this.facts.remoteCalls.push({ name, member, loc, ref });
  }

  private walkCall(e: Extract<Expr, { kind: "Call" }>): void {
    const calleeName = dottedName(e.callee);
    // pcall/xpcall, and the usual retry/safe-call helpers that wrap one.
    const isPcall = calleeName !== undefined && /(^|\.)(x?pcall|retry|withRetries|retryAsync|safeCall|protect(ed)?Call|try[A-Z]\w*)$/i.test(calleeName);

    this.walkExpr(e.callee);
    if (isPcall) this.pcallDepth++;
    for (const a of e.args) this.walkExpr(a);
    if (isPcall) this.pcallDepth--;

    if (calleeName === "require") {
      const target = e.args[0];
      const ref = target ? this.refOf(target) : undefined;
      if (ref) this.facts.requires.push({ ref, loc: e.loc, via: "require" });
      else if (target?.kind === "Number") {
        this.report(
          "roblox/require-asset",
          "warning",
          "dependency",
          "require(assetId) loads a published module at runtime; the project cannot verify it and it only works for modules you own or that are public",
          e.loc,
        );
      }
    }

    if (calleeName === "Instance.new") {
      const cls = e.args[0];
      if (cls?.kind === "String") {
        this.facts.instanceNewClasses.push({ className: cls.value, loc: cls.loc });
        const dep = DEPRECATED_CLASSES[cls.value];
        if (dep) {
          this.report("roblox/deprecated-class", "warning", "deprecated", `${cls.value} is deprecated; use ${dep}`, e.loc);
        }
      }
      if (e.args.length >= 2) {
        this.report(
          "roblox/instance-new-parent",
          "info",
          "performance",
          "Instance.new with a parent argument replicates before properties are set; set Parent last instead",
          e.loc,
        );
      }
    }

    // Deprecated globals used as calls (wait/spawn/delay) are reported by checkGlobal.
  }

  private walkMethodCall(e: Extract<Expr, { kind: "MethodCall" }>): void {
    this.walkExpr(e.object);
    for (const a of e.args) this.walkExpr(a);

    const dep = DEPRECATED_METHODS[e.method];
    if (dep) {
      // Only the name token is replaced; its location is right after the ':'.
      const nameLoc = methodNameLoc(e);
      this.report(
        "luau/deprecated-method",
        "warning",
        "deprecated",
        `:${e.method}() is deprecated; use ${dep.replacement}`,
        nameLoc ?? e.loc,
        dep.fix && nameLoc ? this.replaceFix(nameLoc, dep.fix, `Rename :${e.method} to :${dep.fix}`) : undefined,
      );
    }

    if (e.method === "GetService") {
      const arg = e.args[0];
      if (arg?.kind === "String") {
        this.facts.services.push(arg.value);
        if (!SERVICES.has(arg.value)) {
          const guess = suggest(arg.value, SERVICES);
          this.report(
            "roblox/unknown-service",
            guess ? "error" : "warning",
            "script",
            guess
              ? `"${arg.value}" is not a service; did you mean "${guess}"?`
              : `"${arg.value}" is not a known Roblox service`,
            arg.loc,
            guess ? this.replaceFix(arg.loc, JSON.stringify(guess), `Use "${guess}"`) : undefined,
          );
        }
        if (SERVER_ONLY_SERVICES.has(arg.value)) {
          this.facts.serverOnlyUses.push(arg.value);
          if (this.context === "client") {
            this.report(
              "roblox/client-server",
              "error",
              "client-server",
              `${arg.value} cannot be used from a LocalScript; it only exists on the server. Move this logic to a server Script and communicate through a RemoteEvent.`,
              e.loc,
            );
          }
        }
        if (CLIENT_ONLY_SERVICES.has(arg.value)) {
          this.facts.clientOnlyUses.push(arg.value);
          if (this.context === "server") {
            this.report(
              "roblox/client-server",
              "warning",
              "client-server",
              `${arg.value} only reports input and UI state on the client; on the server it never fires.`,
              e.loc,
            );
          }
        }
      }
    }

    if (e.method === "WaitForChild" || e.method === "FindFirstChild") {
      const recursive = e.method === "FindFirstChild" && e.args[1] !== undefined && !(e.args[1].kind === "Boolean" && !e.args[1].value);
      const ref = recursive ? undefined : this.refOf(e);
      if (ref) this.facts.refs.push({ ref, loc: e.loc, via: e.method });
    }

    const serverMsg = SERVER_ONLY_MEMBERS[e.method];
    if (serverMsg) {
      this.facts.serverOnlyUses.push(e.method);
      if (this.context === "client") this.report("roblox/client-server", "error", "client-server", serverMsg, e.loc);
      if (e.method === "FireClient" || e.method === "FireAllClients" || e.method === "InvokeClient") {
        this.checkRemoteMember(e.method, e.object, e.loc);
      }
      if (e.method === "InvokeClient") {
        this.report(
          "roblox/invoke-client",
          "warning",
          "security",
          "RemoteFunction:InvokeClient yields until the client answers; a malicious or disconnected client can hang this thread forever. Prefer a RemoteEvent.",
          e.loc,
        );
      }
    }
    const clientMsg = CLIENT_ONLY_MEMBERS[e.method];
    if (clientMsg) {
      this.facts.clientOnlyUses.push(e.method);
      if (this.context === "server") this.report("roblox/client-server", "error", "client-server", clientMsg, e.loc);
      if (e.method === "FireServer" || e.method === "InvokeServer") this.checkRemoteMember(e.method, e.object, e.loc);
    }

    if (e.method === "Connect" || e.method === "Once") {
      const signal = e.object;
      if (signal.kind === "Member" && signal.name === "OnServerEvent") {
        const handler = e.args[0];
        if (handler?.kind === "Function") this.checkRemoteHandler(handler.fn, "OnServerEvent");
      }
    }

    if (DATASTORE_METHODS.has(e.method) && this.pcallDepth === 0 && !isHttpObject(e.object, (n) => this.scope.lookup(n))) {
      this.report(
        "roblox/datastore-pcall",
        "warning",
        "script",
        `DataStore:${e.method} can fail (throttling, outages); wrap it in pcall and handle the failure so player data is never lost`,
        e.loc,
      );
    }

    if (HTTP_SERVER_METHODS.has(e.method) && isHttpObject(e.object, (n) => this.scope.lookup(n))) {
      this.facts.serverOnlyUses.push(`HttpService:${e.method}`);
      if (this.context === "client") {
        this.report("roblox/client-server", "error", "client-server", `HttpService:${e.method} only works on the server`, e.loc);
      }
    }

    if (e.method === "LoadAnimation" && e.object.kind !== "MethodCall") {
      const name = dottedName(e.object) ?? "";
      if (/humanoid/i.test(name)) {
        this.report(
          "roblox/deprecated-loadanimation",
          "warning",
          "deprecated",
          "Humanoid:LoadAnimation is deprecated; load animations through the Animator inside the Humanoid",
          e.loc,
        );
      }
    }
  }

  /**
   * A server handler receives whatever the client sends. Every argument after
   * `player` is attacker-controlled and must be type-checked before use.
   */
  private checkRemoteHandler(fn: FunctionBody, signal: string): void {
    const clientArgs = fn.params.slice(1);
    if (fn.params.length === 0) return;
    for (const p of clientArgs) {
      const uses = countNameUses(fn.body, p.name);
      if (uses === 0) continue;
      if (!isValidated(fn.body, p.name)) {
        this.report(
          "roblox/remote-validation",
          "warning",
          "security",
          `${signal} argument '${p.name}' is used without validation. Exploiters can send any value; check it with typeof()/type() and bounds before trusting it.`,
          p.loc,
        );
      }
    }
  }

  // ------------------------------------------------------------ instance refs

  /** Resolves an expression to a static DataModel path, when it is one. */
  refOf(e: Expr): InstanceRef | undefined {
    switch (e.kind) {
      case "Name": {
        const v = this.scope.lookup(e.name);
        if (v) return v.ref ? cloneRef(v.ref) : undefined;
        if (e.name === "game" || e.name === "Game") return { root: "game", segments: [] };
        if (e.name === "workspace" || e.name === "Workspace") {
          return { root: "game", segments: [{ name: "Workspace", mode: "hard", via: "GetService" }] };
        }
        if (e.name === "script") return { root: "script", segments: [] };
        return undefined;
      }
      case "Paren":
        return this.refOf(e.expr);
      case "TypeAssertion":
        return this.refOf(e.expr);
      case "MethodCall": {
        const base = this.refOf(e.object);
        if (!base) return undefined;
        const arg = e.args[0];
        if (e.method === "GetService" && base.root === "game" && base.segments.length === 0 && arg?.kind === "String") {
          return { root: "game", segments: [{ name: arg.value, mode: "hard", via: "GetService" }] };
        }
        if ((e.method === "WaitForChild" || e.method === "FindFirstChild") && arg?.kind === "String") {
          if (e.method === "FindFirstChild" && e.args[1] && !(e.args[1].kind === "Boolean" && !e.args[1].value)) return undefined;
          base.segments.push({ name: arg.value, mode: "hard", via: e.method });
          return base;
        }
        return undefined;
      }
      case "Member": {
        const base = this.refOf(e.object);
        if (!base) return undefined;
        if (e.name === "Parent") {
          base.segments.push({ name: "..", mode: "parent" });
          return base;
        }
        if (base.root === "game" && base.segments.length === 0) {
          if (!SERVICES.has(e.name)) return undefined;
          return { root: "game", segments: [{ name: e.name, mode: "hard", via: "GetService" }] };
        }
        if (NON_CHILD_MEMBERS.has(e.name)) return undefined;
        base.segments.push({ name: e.name, mode: "soft", via: "index" });
        return base;
      }
      case "Index": {
        if (e.key.kind !== "String") return undefined;
        const base = this.refOf(e.object);
        if (!base) return undefined;
        base.segments.push({ name: e.key.value, mode: "soft", via: "index" });
        return base;
      }
      default:
        return undefined;
    }
  }
}

/** Members that are properties/methods, never children, on the common base classes. */
const NON_CHILD_MEMBERS = new Set([
  "Name",
  "ClassName",
  "Value",
  "Parent",
  "LocalPlayer",
  "Character",
  "PlayerGui",
  "Backpack",
  "CurrentCamera",
  "Terrain",
  "Source",
  "Enabled",
  "Disabled",
  "Changed",
  "ChildAdded",
  "ChildRemoved",
  "DescendantAdded",
  "DescendantRemoving",
  "AncestryChanged",
  "Destroying",
  "AttributeChanged",
  "OnServerEvent",
  "OnClientEvent",
  "OnServerInvoke",
  "OnClientInvoke",
  "Event",
  "OnInvoke",
  "Touched",
  "TouchEnded",
  "Activated",
  "MouseButton1Click",
  "MouseButton1Down",
  "MouseButton1Up",
  "MouseEnter",
  "MouseLeave",
  "Triggered",
  "PromptShown",
  "Position",
  "Size",
  "CFrame",
  "Orientation",
  "Rotation",
  "Anchored",
  "CanCollide",
  "Transparency",
  "Color",
  "BrickColor",
  "Material",
  "Text",
  "Visible",
  "PrimaryPart",
  "Heartbeat",
  "Stepped",
  "RenderStepped",
  "PlayerAdded",
  "PlayerRemoving",
  "Humanoid",
]);

function cloneRef(r: InstanceRef): InstanceRef {
  return { root: r.root, segments: r.segments.map((s) => ({ ...s })) };
}

function isMember(e: Expr, object: string, name: string): boolean {
  return e.kind === "Member" && e.name === name && e.object.kind === "Name" && e.object.name === object;
}

function dottedName(e: Expr): string | undefined {
  if (e.kind === "Name") return e.name;
  if (e.kind === "Member") {
    const base = dottedName(e.object);
    return base ? `${base}.${e.name}` : undefined;
  }
  return undefined;
}

function serviceOf(e: Expr, lookup: (n: string) => VarInfo | undefined): string | undefined {
  if (e.kind === "MethodCall" && e.method === "GetService" && e.args[0]?.kind === "String") return e.args[0].value;
  if (e.kind === "Name") return lookup(e.name)?.service;
  return undefined;
}

function isHttpObject(e: Expr, lookup: (n: string) => VarInfo | undefined): boolean {
  if (serviceOf(e, lookup) === "HttpService") return true;
  if (e.kind === "Name" && /^http(service)?$/i.test(e.name)) return true;
  if (e.kind === "Member" && e.name === "HttpService") return true;
  return false;
}

function isEventOrProp(name: string): boolean {
  // Methods are handled on MethodCall; these are the properties/events.
  return !["FireServer", "InvokeServer", "FireClient", "FireAllClients", "InvokeClient", "GetMouse", "SetCore", "BindToRenderStep", "GetDataStore", "GetOrderedDataStore", "AwardBadge", "SetNetworkOwner"].includes(name);
}

function methodNameLoc(e: Extract<Expr, { kind: "MethodCall" }>): Loc {
  return e.methodLoc;
}

function childBlocks(s: Stat): Block[] {
  switch (s.kind) {
    case "Do":
    case "While":
    case "Repeat":
    case "NumericFor":
    case "GenericFor":
      return [s.body];
    case "If":
      return [...s.clauses.map((c) => c.body), ...(s.else ? [s.else] : [])];
    case "LocalFunction":
    case "FunctionDecl":
      return [s.fn.body];
    default:
      return [];
  }
}

/** Visits every expression in a block, including nested functions. */
function forEachExpr(block: Block, visit: (e: Expr) => void): void {
  const expr = (e: Expr | undefined): void => {
    if (!e) return;
    visit(e);
    switch (e.kind) {
      case "Member":
        expr(e.object);
        break;
      case "Index":
        expr(e.object);
        expr(e.key);
        break;
      case "Call":
        expr(e.callee);
        e.args.forEach(expr);
        break;
      case "MethodCall":
        expr(e.object);
        e.args.forEach(expr);
        break;
      case "Function":
        stats(e.fn.body);
        break;
      case "Table":
        e.fields.forEach((f) => {
          if (f.kind === "Keyed") expr(f.key);
          expr(f.value);
        });
        break;
      case "Binary":
        expr(e.left);
        expr(e.right);
        break;
      case "Unary":
        expr(e.arg);
        break;
      case "Paren":
        expr(e.expr);
        break;
      case "IfElse":
        expr(e.cond);
        expr(e.then);
        e.elseifs.forEach((b) => {
          expr(b.cond);
          expr(b.then);
        });
        expr(e.else);
        break;
      case "TypeAssertion":
        expr(e.expr);
        break;
      case "Interp":
        e.exprs.forEach(expr);
        break;
    }
  };
  const stats = (b: Block): void => {
    for (const s of b.body) {
      switch (s.kind) {
        case "Local":
          s.values.forEach(expr);
          break;
        case "LocalFunction":
        case "FunctionDecl":
          if (s.kind === "FunctionDecl") expr(s.path);
          stats(s.fn.body);
          break;
        case "Assign":
          s.targets.forEach(expr);
          s.values.forEach(expr);
          break;
        case "CompoundAssign":
          expr(s.target);
          expr(s.value);
          break;
        case "CallStat":
          expr(s.call);
          break;
        case "Do":
          stats(s.body);
          break;
        case "While":
          expr(s.cond);
          stats(s.body);
          break;
        case "Repeat":
          stats(s.body);
          expr(s.cond);
          break;
        case "If":
          s.clauses.forEach((c) => {
            expr(c.cond);
            stats(c.body);
          });
          if (s.else) stats(s.else);
          break;
        case "NumericFor":
          expr(s.from);
          expr(s.to);
          expr(s.step);
          stats(s.body);
          break;
        case "GenericFor":
          s.exprs.forEach(expr);
          stats(s.body);
          break;
        case "Return":
          s.values.forEach(expr);
          break;
      }
    }
  };
  stats(block);
}

function blockYields(block: Block): boolean {
  let yields = false;
  forEachExpr(block, (e) => {
    if (yields) return;
    if (e.kind === "Call") {
      const n = dottedName(e.callee);
      if (n && /^(wait|task\.wait|coroutine\.yield|task\.defer|delay|spawn)$/.test(n)) yields = true;
      // Calls to local helpers may yield; we cannot see into them cheaply, so
      // a loop that calls anything named like a yield is given the benefit.
      if (n && /wait|yield|sleep/i.test(n)) yields = true;
    }
    if (e.kind === "MethodCall" && /^(Wait|WaitForChild|InvokeServer|InvokeClient|GetAsync|SetAsync|UpdateAsync|MoveToFinished|PlayAsync|Yield)$/i.test(e.method)) {
      yields = true;
    }
    if (e.kind === "MethodCall" && /Async$/.test(e.method)) yields = true;
  });
  return yields;
}

function countNameUses(block: Block, name: string): number {
  let n = 0;
  forEachExpr(block, (e) => {
    if (e.kind === "Name" && e.name === name) n++;
  });
  return n;
}

function isValidated(block: Block, name: string): boolean {
  let ok = false;
  forEachExpr(block, (e) => {
    if (ok) return;
    if (e.kind === "Call") {
      const callee = dottedName(e.callee) ?? "";
      const passesName = e.args.some((a) => containsName(a, name));
      if (!passesName) return;
      if (VALIDATOR_CALLS.has(callee)) ok = true;
      if (/valid|check|sanit|assert|guard|verify|is[A-Z]/.test(callee)) ok = true;
      if (/^t\./.test(callee)) ok = true; // the popular `t` runtime typechecker
    }
    if (e.kind === "MethodCall" && e.args.some((a) => containsName(a, name))) {
      if (/valid|check|sanit|assert|guard|verify/i.test(e.method)) ok = true;
    }
  });
  return ok;
}

function containsName(e: Expr, name: string): boolean {
  let found = false;
  const probe: Block = { body: [{ kind: "Return", values: [e], loc: e.loc }], loc: e.loc };
  forEachExpr(probe, (x) => {
    if (x.kind === "Name" && x.name === name) found = true;
  });
  return found;
}

/** Formats a ref for humans: `ReplicatedStorage.Remotes.BuyItem`, `script.Parent.Config`. */
export function formatRef(ref: InstanceRef): string {
  const parts: string[] = [ref.root === "game" ? "game" : "script"];
  for (const s of ref.segments) parts.push(s.mode === "parent" ? "Parent" : s.name);
  if (ref.root === "game" && parts.length > 1) parts.shift();
  return parts.join(".");
}
