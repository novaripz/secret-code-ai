import type { Pos } from "./lexer";

export interface Loc {
  start: Pos;
  end: Pos;
}

export interface FunctionBody {
  params: { name: string; loc: Loc; type?: TypeNode }[];
  vararg: boolean;
  generics: string[];
  returnType?: TypeNode;
  body: Block;
  loc: Loc;
}

export type Expr =
  | { kind: "Nil"; loc: Loc }
  | { kind: "Boolean"; value: boolean; loc: Loc }
  | { kind: "Number"; raw: string; value: number; loc: Loc }
  | { kind: "String"; value: string; loc: Loc }
  | { kind: "Interp"; strings: string[]; exprs: Expr[]; loc: Loc }
  | { kind: "Vararg"; loc: Loc }
  | { kind: "Function"; fn: FunctionBody; loc: Loc }
  | { kind: "Table"; fields: TableField[]; loc: Loc }
  | { kind: "Binary"; op: string; left: Expr; right: Expr; loc: Loc }
  | { kind: "Unary"; op: string; arg: Expr; loc: Loc }
  | { kind: "Name"; name: string; loc: Loc }
  | { kind: "Member"; object: Expr; name: string; loc: Loc }
  | { kind: "Index"; object: Expr; key: Expr; loc: Loc }
  | { kind: "Call"; callee: Expr; args: Expr[]; loc: Loc }
  | { kind: "MethodCall"; object: Expr; method: string; methodLoc: Loc; args: Expr[]; loc: Loc }
  | { kind: "Paren"; expr: Expr; loc: Loc }
  | { kind: "IfElse"; cond: Expr; then: Expr; elseifs: { cond: Expr; then: Expr }[]; else: Expr; loc: Loc }
  | { kind: "TypeAssertion"; expr: Expr; type: TypeNode; loc: Loc };

export type TableField =
  | { kind: "Positional"; value: Expr }
  | { kind: "Named"; name: string; value: Expr }
  | { kind: "Keyed"; key: Expr; value: Expr };

export interface LocalBinding {
  name: string;
  loc: Loc;
  type?: TypeNode;
  attrib?: string;
}

export type Stat =
  | { kind: "Local"; names: LocalBinding[]; values: Expr[]; loc: Loc }
  | { kind: "LocalFunction"; name: string; nameLoc: Loc; fn: FunctionBody; attributes: string[]; loc: Loc }
  | { kind: "FunctionDecl"; path: Expr; method?: string; fn: FunctionBody; attributes: string[]; loc: Loc }
  | { kind: "Assign"; targets: Expr[]; values: Expr[]; loc: Loc }
  | { kind: "CompoundAssign"; op: string; target: Expr; value: Expr; loc: Loc }
  | { kind: "CallStat"; call: Expr; loc: Loc }
  | { kind: "Do"; body: Block; loc: Loc }
  | { kind: "While"; cond: Expr; body: Block; loc: Loc }
  | { kind: "Repeat"; body: Block; cond: Expr; loc: Loc }
  | { kind: "If"; clauses: { cond: Expr; body: Block }[]; else?: Block; loc: Loc }
  | { kind: "NumericFor"; var: LocalBinding; from: Expr; to: Expr; step?: Expr; body: Block; loc: Loc }
  | { kind: "GenericFor"; vars: LocalBinding[]; exprs: Expr[]; body: Block; loc: Loc }
  | { kind: "Return"; values: Expr[]; loc: Loc }
  | { kind: "Break"; loc: Loc }
  | { kind: "Continue"; loc: Loc }
  | { kind: "TypeAlias"; name: string; exported: boolean; generics: string[]; type: TypeNode; loc: Loc }
  | { kind: "TypeFunction"; name: string; exported: boolean; fn: FunctionBody; loc: Loc };

export interface Block {
  body: Stat[];
  loc: Loc;
}

/**
 * Types are parsed completely (so malformed annotations are reported) but kept
 * shallow: the analyzer needs names and `typeof(...)` expressions, not a full
 * type algebra.
 */
export type TypeNode =
  | { kind: "TypeRef"; name: string; prefix?: string; params: TypeNode[]; loc: Loc }
  | { kind: "TypeTypeof"; expr: Expr; loc: Loc }
  | { kind: "TypeFunction"; params: TypeNode[]; returns: TypeNode[]; loc: Loc }
  | { kind: "TypeTable"; props: { name: string; type: TypeNode }[]; indexer?: { key: TypeNode; value: TypeNode }; loc: Loc }
  | { kind: "TypeUnion"; types: TypeNode[]; loc: Loc }
  | { kind: "TypeIntersection"; types: TypeNode[]; loc: Loc }
  | { kind: "TypeOptional"; type: TypeNode; loc: Loc }
  | { kind: "TypeSingleton"; value: string | boolean; loc: Loc }
  | { kind: "TypePack"; types: TypeNode[]; variadic?: TypeNode; loc: Loc }
  | { kind: "TypeVariadic"; type: TypeNode; loc: Loc }
  | { kind: "TypeGenericPack"; name: string; loc: Loc };

export interface Chunk {
  block: Block;
  /** `--!strict` / `--!nonstrict` / `--!nocheck` directive, if present. */
  mode?: string;
}
