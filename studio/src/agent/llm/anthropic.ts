import Anthropic from "@anthropic-ai/sdk";
import { ProviderError, type LLMProvider, type StopReason, type TurnCallbacks, type TurnRequest, type TurnResult } from "./types";

export const ANTHROPIC_MODELS = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5" },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5" },
  { id: "claude-fable-5-1", label: "Claude Fable 5.1" },
] as const;

export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5-5";

// Models that accept server-side refusal fallbacks in the "default" form.
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-sonnet-5-5", "claude-fable-5-1"]);

const MAX_TOKENS = 64_000;

export class AnthropicProvider implements LLMProvider {
  readonly id = "anthropic" as const;
  private readonly client: Anthropic;

  /**
   * @param baseURL  the app's LLM forwarder, e.g. `app://siljangnim/api/llm/anthropic`
   * @param apiKey   the key in browser mode; in the desktop app the main process
   *                 adds it, so any placeholder works here
   * @param headers  extra headers for the forwarder (the desktop's per-launch token)
   */
  constructor(baseURL: string, apiKey: string, headers: Record<string, string> = {}) {
    this.client = new Anthropic({ baseURL, apiKey, defaultHeaders: headers, dangerouslyAllowBrowser: true, maxRetries: 2 });
  }

  async runTurn(request: TurnRequest, callbacks: TurnCallbacks): Promise<TurnResult> {
    const fallback = FALLBACK_MODELS.has(request.model);
    const stream = this.client.beta.messages.stream(
      {
        model: request.model,
        max_tokens: MAX_TOKENS,
        // The system prompt and tool list never change mid-conversation, so
        // they cache; the top-level breakpoint caches the growing history.
        system: [{ type: "text", text: request.system, cache_control: { type: "ephemeral" } }],
        cache_control: { type: "ephemeral" },
        messages: request.messages,
        tools: request.tools.map((tool) => ({ ...tool, eager_input_streaming: true })),
        thinking: { type: "adaptive", display: "summarized" },
        output_config: { effort: request.effort },
        ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      },
      { signal: request.signal },
    );
    stream.on("text", (delta) => callbacks.onText?.(delta));
    stream.on("thinking", (delta) => callbacks.onThinking?.(delta));

    let message: Anthropic.Beta.BetaMessage;
    try {
      message = await stream.finalMessage();
    } catch (err) {
      throw toProviderError(err);
    }

    const stopReason = mapStopReason(message.stop_reason);
    const detail =
      message.stop_reason === "refusal" && message.stop_details
        ? `declined (${message.stop_details.category ?? "policy"})${message.stop_details.explanation ? `: ${message.stop_details.explanation}` : ""}`
        : undefined;
    return {
      content: message.content as Anthropic.Beta.BetaContentBlockParam[],
      stopReason,
      detail,
      usage: {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
      },
    };
  }
}

function mapStopReason(reason: string | null): StopReason {
  switch (reason) {
    case "end_turn":
    case "stop_sequence":
      return "end_turn";
    case "tool_use":
    case "max_tokens":
    case "refusal":
    case "pause_turn":
      return reason;
    default:
      return "other";
  }
}

function toProviderError(err: unknown): Error {
  if (err instanceof Anthropic.APIUserAbortError) return err;
  if (err instanceof Anthropic.AuthenticationError) return new ProviderError("The Anthropic API key was rejected. Check it in Settings.", 401);
  if (err instanceof Anthropic.PermissionDeniedError) return new ProviderError(`Access denied: ${err.message}`, 403);
  if (err instanceof Anthropic.NotFoundError) return new ProviderError(`Not found (is the model name right?): ${err.message}`, 404);
  if (err instanceof Anthropic.RateLimitError) return new ProviderError("Rate limited by Anthropic. Try again in a moment.", 429, true);
  if (err instanceof Anthropic.BadRequestError) return new ProviderError(`Request rejected: ${err.message}`, 400);
  if (err instanceof Anthropic.InternalServerError) return new ProviderError("Anthropic had a server error. Try again.", err.status, true);
  if (err instanceof Anthropic.APIConnectionError) return new ProviderError(`Could not reach Anthropic: ${err.message}`, undefined, true);
  if (err instanceof Anthropic.APIError) return new ProviderError(`Anthropic API error ${err.status ?? ""}: ${err.message}`, err.status);
  // Tool input JSON that could not be parsed at all (eager input streaming).
  return err instanceof Error ? err : new Error(String(err));
}
