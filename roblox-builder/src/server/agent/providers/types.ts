// A provider-neutral view of one model turn, so the agent loop does not care
// which API answers it.

export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResult {
  id: string;
  name: string;
  content: string;
  isError?: boolean;
}

export type AgentMessage =
  | { role: "user"; content: string }
  | {
      role: "assistant";
      text: string;
      toolCalls: ToolCall[];
      /** Provider-native content, replayed verbatim (Anthropic thinking blocks must be passed back unchanged). */
      raw?: unknown;
      provider?: string;
    }
  | { role: "tool"; results: ToolResult[] };

export interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema for the input object. */
  inputSchema: Record<string, unknown>;
}

export interface TurnRequest {
  system: string;
  messages: AgentMessage[];
  tools: ToolSpec[];
  signal: AbortSignal;
  maxTokens?: number;
  onText?: (delta: string) => void;
  onReasoning?: (delta: string) => void;
  /** Called as a tool call starts streaming, so the UI can show "writing file…" before it finishes. */
  onToolStart?: (name: string, id: string) => void;
}

export interface TurnResult {
  text: string;
  toolCalls: ToolCall[];
  stopReason: "end_turn" | "tool_use" | "max_tokens" | "refusal" | "other";
  raw?: unknown;
  usage?: { inputTokens: number; outputTokens: number; cacheReadTokens?: number };
  model: string;
  /** Present when the provider could not parse a tool call's JSON input. */
  invalidToolInputs?: { id: string; name: string; raw: string }[];
}

export interface Provider {
  id: string;
  label: string;
  model: string;
  turn(req: TurnRequest): Promise<TurnResult>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly kind: "setup" | "auth" | "rate-limit" | "overloaded" | "bad-request" | "network" | "refusal" | "other",
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
