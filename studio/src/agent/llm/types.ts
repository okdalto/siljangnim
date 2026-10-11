// Provider-neutral contract for one model turn. The conversation format is
// the Anthropic Messages format; other providers convert at their edge.
import type Anthropic from "@anthropic-ai/sdk";

export type MessageParam = Anthropic.Beta.BetaMessageParam;
export type ContentBlockParam = Anthropic.Beta.BetaContentBlockParam;
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface ToolSpec {
  name: string;
  description: string;
  input_schema: { type: "object"; [key: string]: unknown };
}

export interface TurnRequest {
  model: string;
  system: string;
  messages: MessageParam[];
  tools: ToolSpec[];
  effort: Effort;
  signal: AbortSignal;
}

export interface TurnCallbacks {
  onText?(delta: string): void;
  onThinking?(delta: string): void;
}

export type StopReason = "end_turn" | "tool_use" | "max_tokens" | "refusal" | "pause_turn" | "other";

export interface TurnResult {
  /** Assistant content to append to the conversation unchanged. */
  content: ContentBlockParam[];
  stopReason: StopReason;
  /** Human-readable detail for refusals and other stops. */
  detail?: string;
  usage?: { inputTokens: number; outputTokens: number; cacheReadTokens: number };
}

export interface LLMProvider {
  readonly id: "anthropic" | "openai";
  runTurn(request: TurnRequest, callbacks: TurnCallbacks): Promise<TurnResult>;
}

/** User-facing error with a message worth showing as is. */
export class ProviderError extends Error {
  readonly status: number | undefined;
  readonly retryable: boolean;
  constructor(message: string, status?: number, retryable = false) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
    this.retryable = retryable;
  }
}
