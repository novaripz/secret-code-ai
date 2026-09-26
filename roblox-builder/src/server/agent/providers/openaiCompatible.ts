// Non-Claude models through the OpenAI-compatible Chat Completions dialect:
// OpenAI itself, Google Gemini (its OpenAI-compatible endpoint), Groq and
// OpenRouter all accept the same request and stream the same tool-call deltas.

import { ProviderError, type AgentMessage, type Provider, type ToolCall, type TurnRequest, type TurnResult } from "./types";

export interface CompatConfig {
  id: string;
  label: string;
  endpoint: string;
  apiKey: string;
  model: string;
  extraBody?: Record<string, unknown>;
}

type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[] }
  | { role: "tool"; tool_call_id: string; content: string };

export class OpenAiCompatibleProvider implements Provider {
  readonly id: string;
  readonly label: string;
  readonly model: string;

  constructor(private readonly config: CompatConfig) {
    this.id = config.id;
    this.label = config.label;
    this.model = config.model;
  }

  private toMessages(system: string, messages: AgentMessage[]): ChatMessage[] {
    const out: ChatMessage[] = [{ role: "system", content: system }];
    for (const m of messages) {
      if (m.role === "user") out.push({ role: "user", content: m.content });
      else if (m.role === "tool") for (const r of m.results) out.push({ role: "tool", tool_call_id: r.id, content: (r.isError ? "ERROR: " : "") + r.content });
      else
        out.push({
          role: "assistant",
          content: m.text || null,
          ...(m.toolCalls.length
            ? { tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: "function" as const, function: { name: c.name, arguments: JSON.stringify(c.input ?? {}) } })) }
            : {}),
        });
    }
    return out;
  }

  async turn(req: TurnRequest): Promise<TurnResult> {
    let res: Response;
    try {
      res = await fetch(this.config.endpoint, {
        method: "POST",
        signal: req.signal,
        headers: { "content-type": "application/json", authorization: `Bearer ${this.config.apiKey}` },
        body: JSON.stringify({
          model: this.config.model,
          stream: true,
          stream_options: { include_usage: true },
          max_tokens: Math.min(req.maxTokens ?? 32000, 32000),
          messages: this.toMessages(req.system, req.messages),
          tools: req.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.inputSchema } })),
          tool_choice: "auto",
          ...this.config.extraBody,
        }),
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") throw new ProviderError("Cancelled", "other");
      throw new ProviderError(`Could not reach ${this.label}: ${err instanceof Error ? err.message : String(err)}`, "network", 5000);
    }
    if (!res.ok || !res.body) {
      const body = await res.text().catch(() => "");
      const msg = `${this.label} returned ${res.status}: ${body.slice(0, 300)}`;
      if (res.status === 401 || res.status === 403) throw new ProviderError(msg, "auth");
      if (res.status === 429) throw new ProviderError(msg, "rate-limit", Number(res.headers.get("retry-after")) * 1000 || 20_000);
      if (res.status >= 500) throw new ProviderError(msg, "overloaded", 10_000);
      throw new ProviderError(msg, "bad-request");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let text = "";
    let finish = "";
    let usage: TurnResult["usage"];
    const calls = new Map<number, { id: string; name: string; args: string }>();

    const handle = (payload: string) => {
      if (payload === "[DONE]") return;
      let chunk: {
        choices?: { delta?: { content?: string; reasoning?: string; reasoning_content?: string; tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[] }; finish_reason?: string }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      try {
        chunk = JSON.parse(payload);
      } catch {
        return;
      }
      if (chunk.usage) usage = { inputTokens: chunk.usage.prompt_tokens ?? 0, outputTokens: chunk.usage.completion_tokens ?? 0 };
      for (const choice of chunk.choices ?? []) {
        const d = choice.delta ?? {};
        if (d.content) {
          text += d.content;
          req.onText?.(d.content);
        }
        const reasoning = d.reasoning ?? d.reasoning_content;
        if (reasoning) req.onReasoning?.(reasoning);
        for (const tc of d.tool_calls ?? []) {
          let entry = calls.get(tc.index);
          if (!entry) {
            entry = { id: tc.id ?? `call_${tc.index}_${Date.now()}`, name: "", args: "" };
            calls.set(tc.index, entry);
          }
          if (tc.id) entry.id = tc.id;
          if (tc.function?.name) {
            entry.name += tc.function.name;
            req.onToolStart?.(entry.name, entry.id);
          }
          if (tc.function?.arguments) entry.args += tc.function.arguments;
        }
        if (choice.finish_reason) finish = choice.finish_reason;
      }
    };

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (line.startsWith("data:")) handle(line.slice(5).trim());
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") throw new ProviderError("Cancelled", "other");
      throw new ProviderError(`${this.label} stream failed: ${err instanceof Error ? err.message : String(err)}`, "network", 5000);
    }

    const toolCalls: ToolCall[] = [];
    const invalid: { id: string; name: string; raw: string }[] = [];
    for (const c of [...calls.values()]) {
      try {
        toolCalls.push({ id: c.id, name: c.name, input: c.args.trim() ? JSON.parse(c.args) : {} });
      } catch {
        invalid.push({ id: c.id, name: c.name, raw: c.args });
      }
    }
    return {
      text,
      toolCalls,
      invalidToolInputs: invalid.length ? invalid : undefined,
      stopReason: finish === "length" ? "max_tokens" : toolCalls.length || invalid.length ? "tool_use" : finish === "content_filter" ? "refusal" : "end_turn",
      model: this.config.model,
      usage,
    };
  }
}
