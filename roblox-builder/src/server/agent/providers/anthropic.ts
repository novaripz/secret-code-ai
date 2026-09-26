// Claude, through the official Anthropic SDK.
//
// Streaming manual tool loop: text and tool inputs stream as they are
// generated (eager_input_streaming), adaptive thinking is on with summarized
// display so the timeline can show what the agent is weighing, and server-side
// refusal fallbacks are enabled for the models that support them. Assistant
// content is kept verbatim (`raw`) and replayed unchanged, which is what
// thinking blocks require.

import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaContentBlock,
  BetaContentBlockParam,
  BetaMessageParam,
  BetaToolUnion,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { ProviderError, type AgentMessage, type Provider, type TurnRequest, type TurnResult } from "./types";

const FALLBACK_MODELS = new Set(["claude-opus-5", "claude-fable-5-1"]);

export class AnthropicProvider implements Provider {
  readonly id = "anthropic";
  readonly label = "Claude";
  readonly model: string;
  private readonly client: Anthropic;
  private readonly effort: "low" | "medium" | "high" | "xhigh" | "max";

  constructor() {
    this.model = process.env.ANTHROPIC_MODEL || "claude-opus-5";
    const effort = process.env.ANTHROPIC_EFFORT;
    this.effort = effort === "low" || effort === "medium" || effort === "xhigh" || effort === "max" ? effort : "high";
    this.client = new Anthropic({ maxRetries: 3, timeout: 10 * 60_000 });
  }

  private toParams(messages: AgentMessage[]): BetaMessageParam[] {
    const out: BetaMessageParam[] = [];
    const pushUser = (blocks: BetaContentBlockParam[]) => {
      const last = out[out.length - 1];
      if (last && last.role === "user" && Array.isArray(last.content)) {
        (last.content as BetaContentBlockParam[]).push(...blocks);
      } else {
        out.push({ role: "user", content: blocks });
      }
    };
    for (const m of messages) {
      if (m.role === "user") {
        pushUser([{ type: "text", text: m.content }]);
      } else if (m.role === "tool") {
        pushUser(
          m.results.map((r) => ({
            type: "tool_result" as const,
            tool_use_id: r.id,
            content: r.content || "(no output)",
            ...(r.isError ? { is_error: true } : {}),
          })),
        );
      } else if (m.provider === this.id && Array.isArray(m.raw)) {
        out.push({ role: "assistant", content: m.raw as BetaContentBlockParam[] });
      } else {
        const blocks: BetaContentBlockParam[] = [];
        if (m.text) blocks.push({ type: "text", text: m.text });
        for (const c of m.toolCalls) blocks.push({ type: "tool_use", id: c.id, name: c.name, input: c.input as Record<string, unknown> });
        out.push({ role: "assistant", content: blocks.length ? blocks : [{ type: "text", text: "(continuing)" }] });
      }
    }
    return out;
  }

  async turn(req: TurnRequest): Promise<TurnResult> {
    const tools: BetaToolUnion[] = req.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as { type: "object"; properties?: Record<string, unknown> },
      eager_input_streaming: true,
    }));
    const useFallbacks = FALLBACK_MODELS.has(this.model) && process.env.ANTHROPIC_FALLBACKS !== "off";

    let message;
    try {
      const stream = this.client.beta.messages.stream(
        {
          model: this.model,
          max_tokens: req.maxTokens ?? 64000,
          system: [{ type: "text", text: req.system }],
          messages: this.toParams(req.messages),
          tools,
          tool_choice: { type: "auto" },
          thinking: { type: "adaptive", display: "summarized" },
          output_config: { effort: this.effort },
          cache_control: { type: "ephemeral" },
          ...(useFallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
        },
        { signal: req.signal },
      );
      stream.on("text", (delta) => req.onText?.(delta));
      stream.on("thinking", (delta) => req.onReasoning?.(delta));
      stream.on("streamEvent", (event) => {
        if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
          req.onToolStart?.(event.content_block.name, event.content_block.id);
        }
      });
      message = await stream.finalMessage();
    } catch (err) {
      throw mapError(err);
    }

    const content = message.content as BetaContentBlock[];
    const text = content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
    const toolCalls = content
      .filter((b) => b.type === "tool_use")
      .map((b) => {
        const t = b as { id: string; name: string; input: unknown };
        return { id: t.id, name: t.name, input: t.input };
      });
    const stop = message.stop_reason;
    return {
      text,
      toolCalls,
      stopReason: stop === "end_turn" || stop === "tool_use" || stop === "max_tokens" || stop === "refusal" ? stop : "other",
      raw: content,
      model: message.model,
      usage: {
        inputTokens: message.usage.input_tokens + (message.usage.cache_creation_input_tokens ?? 0) + (message.usage.cache_read_input_tokens ?? 0),
        outputTokens: message.usage.output_tokens,
        cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
      },
    };
  }
}

function mapError(err: unknown): ProviderError {
  if (err instanceof ProviderError) return err;
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new ProviderError("The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.", "auth");
  }
  if (err instanceof Anthropic.RateLimitError) {
    const ra = Number(err.headers?.get?.("retry-after"));
    return new ProviderError("Claude is rate limited right now.", "rate-limit", Number.isFinite(ra) ? ra * 1000 : 20_000);
  }
  if (err instanceof Anthropic.BadRequestError || err instanceof Anthropic.NotFoundError) {
    return new ProviderError(`Claude rejected the request: ${err.message}`, "bad-request");
  }
  if (err instanceof Anthropic.InternalServerError) {
    return new ProviderError("Claude is overloaded or had a server error.", "overloaded", 10_000);
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new ProviderError(`Could not reach the Anthropic API: ${err.message}`, "network", 5_000);
  }
  if (err instanceof Anthropic.APIUserAbortError || (err instanceof Error && err.name === "AbortError")) {
    return new ProviderError("Cancelled", "other");
  }
  if (err instanceof Anthropic.APIError) {
    return new ProviderError(`Anthropic API error ${err.status}: ${err.message}`, "other");
  }
  // Not an API error: with eager input streaming this is a tool input the SDK could not parse.
  return new ProviderError(`Malformed model output: ${err instanceof Error ? err.message : String(err)}`, "other");
}
