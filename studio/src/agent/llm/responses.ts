// OpenAI Responses API (api.openai.com). Current OpenAI reasoning models only
// take function tools here, not on /chat/completions. Converts the
// Anthropic-format conversation at the edge, like openai.ts.
//
// Reasoning items are not sent back between turns (store: false, and the
// conversation format has no place for OpenAI's encrypted reasoning), so the
// model re-reasons from the visible history each turn.
import type { Effort } from "./types";
import { ProviderError, type ContentBlockParam, type LLMProvider, type MessageParam, type StopReason, type TurnCallbacks, type TurnRequest, type TurnResult } from "./types";

export interface ResponsesOptions {
  /** The app's forwarder, e.g. `app://siljangnim/api/llm/openai`. */
  endpoint: string;
  /** Browser mode only; the desktop main process adds the key itself. */
  apiKey?: string;
  maxTokens: number;
  headers?: Record<string, string>;
}

type InputContent = { type: "input_text"; text: string } | { type: "input_image"; image_url: string };

export type ResponsesInputItem =
  | { role: "user"; content: InputContent[] }
  | { role: "assistant"; content: string }
  | { type: "function_call"; call_id: string; name: string; arguments: string }
  | { type: "function_call_output"; call_id: string; output: string };

const EFFORT: Record<Effort, "low" | "medium" | "high"> = { low: "low", medium: "medium", high: "high", xhigh: "high", max: "high" };

export class OpenAIResponsesProvider implements LLMProvider {
  readonly id = "openai" as const;
  private readonly options: ResponsesOptions;

  constructor(options: ResponsesOptions) {
    this.options = options;
  }

  async runTurn(request: TurnRequest, callbacks: TurnCallbacks): Promise<TurnResult> {
    const headers: Record<string, string> = { "content-type": "application/json", ...this.options.headers };
    if (this.options.apiKey) headers.authorization = `Bearer ${this.options.apiKey}`;
    let response: Response;
    try {
      response = await fetch(`${this.options.endpoint}/responses`, {
        method: "POST",
        headers,
        signal: request.signal,
        body: JSON.stringify({
          model: request.model,
          instructions: request.system,
          input: toResponsesInput(request.messages),
          tools: request.tools.map((t) => ({ type: "function", name: t.name, description: t.description, parameters: t.input_schema, strict: false })),
          tool_choice: "auto",
          max_output_tokens: this.options.maxTokens,
          reasoning: { effort: EFFORT[request.effort], summary: "auto" },
          store: false,
          stream: true,
        }),
      });
    } catch (err) {
      if (request.signal.aborted) throw err;
      throw new ProviderError(`Could not reach OpenAI: ${err instanceof Error ? err.message : err}`, undefined, true);
    }
    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => "");
      throw new ProviderError(`OpenAI returned ${response.status}: ${text.slice(0, 400)}`, response.status, response.status >= 500 || response.status === 429);
    }
    return readResponsesStream(response.body, callbacks);
  }
}

export function toResponsesInput(messages: MessageParam[]): ResponsesInputItem[] {
  const out: ResponsesInputItem[] = [];
  for (const message of messages) {
    const blocks: ContentBlockParam[] = typeof message.content === "string" ? [{ type: "text", text: message.content }] : message.content;
    if (message.role === "assistant") {
      for (const block of blocks) {
        if (block.type === "text" && block.text) out.push({ role: "assistant", content: block.text });
        else if (block.type === "tool_use") {
          out.push({ type: "function_call", call_id: block.id, name: block.name, arguments: JSON.stringify(block.input) });
        }
      }
      continue;
    }
    const parts: InputContent[] = [];
    const toolImages: InputContent[] = [];
    for (const block of blocks) {
      if (block.type === "text") parts.push({ type: "input_text", text: block.text });
      else if (block.type === "image" && block.source.type === "base64") {
        parts.push({ type: "input_image", image_url: `data:${block.source.media_type};base64,${block.source.data}` });
      } else if (block.type === "tool_result") {
        const content = typeof block.content === "string" ? [{ type: "text" as const, text: block.content }] : (block.content ?? []);
        const text = content.flatMap((c) => (c.type === "text" ? [c.text] : [])).join("\n");
        out.push({ type: "function_call_output", call_id: block.tool_use_id, output: (block.is_error ? "ERROR: " : "") + (text || "(no text output)") });
        for (const c of content) {
          if (c.type === "image" && c.source.type === "base64") {
            toolImages.push({ type: "input_image", image_url: `data:${c.source.media_type};base64,${c.source.data}` });
          }
        }
      }
    }
    // Function outputs are text; images they carry follow as a user message.
    if (toolImages.length) out.push({ role: "user", content: [{ type: "input_text", text: "Image(s) returned by the tool above:" }, ...toolImages] });
    if (parts.length) out.push({ role: "user", content: parts });
  }
  return out;
}

interface OutputItem {
  type: string;
  call_id?: string;
  name?: string;
  arguments?: string;
  content?: Array<{ type: string; text?: string; refusal?: string }>;
}

interface StreamEvent {
  type: string;
  delta?: string;
  item?: OutputItem;
  output_index?: number;
  message?: string;
  response?: {
    status?: string;
    incomplete_details?: { reason?: string } | null;
    error?: { message?: string } | null;
    usage?: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } };
  };
}

export async function readResponsesStream(body: ReadableStream<Uint8Array>, callbacks: TurnCallbacks): Promise<TurnResult> {
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let buffer = "";
  const items = new Map<number, OutputItem>();
  let final: StreamEvent["response"];

  const handle = (line: string) => {
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") return;
    let event: StreamEvent;
    try {
      event = JSON.parse(data) as StreamEvent;
    } catch {
      return;
    }
    switch (event.type) {
      case "response.output_text.delta":
        if (event.delta) callbacks.onText?.(event.delta);
        break;
      case "response.reasoning_summary_text.delta":
        if (event.delta) callbacks.onThinking?.(event.delta);
        break;
      case "response.output_item.done":
        if (event.item) items.set(event.output_index ?? items.size, event.item);
        break;
      case "response.completed":
      case "response.incomplete":
        final = event.response;
        break;
      case "response.failed":
        throw new ProviderError(`OpenAI failed: ${event.response?.error?.message ?? "unknown error"}`, undefined, true);
      case "error":
        throw new ProviderError(`OpenAI error: ${event.message ?? data.slice(0, 300)}`);
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) handle(line.trim());
  }
  if (buffer.trim()) handle(buffer.trim());

  const content: ContentBlockParam[] = [];
  let refused: string | undefined;
  let calls = 0;
  for (const item of [...items.entries()].sort(([a], [b]) => a - b).map(([, i]) => i)) {
    if (item.type === "message") {
      const text = (item.content ?? []).flatMap((c) => (c.type === "output_text" && c.text ? [c.text] : [])).join("");
      if (text) content.push({ type: "text", text });
      refused ??= item.content?.find((c) => c.type === "refusal")?.refusal;
    } else if (item.type === "function_call" && item.name) {
      let input: unknown;
      try {
        input = item.arguments ? JSON.parse(item.arguments) : {};
      } catch {
        input = { __invalid_json: item.arguments };
      }
      content.push({ type: "tool_use", id: item.call_id || `call_${Date.now()}_${calls}`, name: item.name, input });
      calls++;
    }
  }

  const reason = final?.incomplete_details?.reason;
  const stopReason: StopReason = refused || reason === "content_filter" ? "refusal" : calls ? "tool_use" : reason === "max_output_tokens" ? "max_tokens" : "end_turn";
  return {
    content,
    stopReason,
    detail: refused,
    usage: {
      inputTokens: final?.usage?.input_tokens ?? 0,
      outputTokens: final?.usage?.output_tokens ?? 0,
      cacheReadTokens: final?.usage?.input_tokens_details?.cached_tokens ?? 0,
    },
  };
}
