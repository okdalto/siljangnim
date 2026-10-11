// OpenAI-compatible chat completions (OpenAI, GLM, vLLM, Ollama, LM Studio…).
// Converts the Anthropic-format conversation at the edge.
import { ProviderError, type ContentBlockParam, type LLMProvider, type MessageParam, type StopReason, type TurnCallbacks, type TurnRequest, type TurnResult } from "./types";

interface OpenAIOptions {
  /** The app's forwarder, e.g. `app://siljangnim/api/llm/openai`. */
  endpoint: string;
  /** Upstream base URL, e.g. `http://localhost:8000/v1`. Empty means api.openai.com. */
  baseUrl: string;
  /** Browser mode only; the desktop main process adds the key itself. */
  apiKey?: string;
  maxTokens: number;
  /** Extra headers for the forwarder (the desktop's per-launch token). */
  headers?: Record<string, string>;
}

type ChatContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string | ChatContentPart[] }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export class OpenAICompatibleProvider implements LLMProvider {
  readonly id = "openai" as const;
  private readonly options: OpenAIOptions;

  constructor(options: OpenAIOptions) {
    this.options = options;
  }

  async runTurn(request: TurnRequest, callbacks: TurnCallbacks): Promise<TurnResult> {
    const headers: Record<string, string> = { "content-type": "application/json", ...this.options.headers };
    if (this.options.baseUrl) headers["x-llm-base-url"] = this.options.baseUrl;
    if (this.options.apiKey) headers.authorization = `Bearer ${this.options.apiKey}`;

    let response: Response;
    try {
      response = await fetch(`${this.options.endpoint}/chat/completions`, {
        method: "POST",
        headers,
        signal: request.signal,
        body: JSON.stringify({
          model: request.model,
          messages: toChatMessages(request.system, request.messages),
          tools: request.tools.map((t) => ({
            type: "function",
            function: { name: t.name, description: t.description, parameters: t.input_schema },
          })),
          tool_choice: "auto",
          max_tokens: this.options.maxTokens,
          stream: true,
        }),
      });
    } catch (err) {
      if (request.signal.aborted) throw err;
      throw new ProviderError(`Could not reach the model server: ${err instanceof Error ? err.message : err}`, undefined, true);
    }
    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => "");
      throw new ProviderError(`Model server returned ${response.status}: ${text.slice(0, 400)}`, response.status, response.status >= 500);
    }
    return readStream(response.body, callbacks);
  }
}

export function toChatMessages(system: string, messages: MessageParam[]): ChatMessage[] {
  const out: ChatMessage[] = [{ role: "system", content: system }];
  for (const message of messages) {
    const blocks: ContentBlockParam[] =
      typeof message.content === "string" ? [{ type: "text", text: message.content }] : message.content;
    if (message.role === "assistant") {
      const text = blocks.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
      const toolCalls: ToolCall[] = blocks.flatMap((b) =>
        b.type === "tool_use" ? [{ id: b.id, type: "function" as const, function: { name: b.name, arguments: JSON.stringify(b.input) } }] : [],
      );
      out.push({ role: "assistant", content: text || null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) });
      continue;
    }
    // User turn: tool results become `tool` messages; images they carry follow
    // as a user message because tool messages are text-only.
    const parts: ChatContentPart[] = [];
    const deferredImages: ChatContentPart[] = [];
    for (const block of blocks) {
      if (block.type === "text") parts.push({ type: "text", text: block.text });
      else if (block.type === "image" && block.source.type === "base64") {
        parts.push({ type: "image_url", image_url: { url: `data:${block.source.media_type};base64,${block.source.data}` } });
      } else if (block.type === "tool_result") {
        const content = typeof block.content === "string" ? [{ type: "text" as const, text: block.content }] : (block.content ?? []);
        const text = content.flatMap((c) => (c.type === "text" ? [c.text] : [])).join("\n");
        out.push({ role: "tool", tool_call_id: block.tool_use_id, content: (block.is_error ? "ERROR: " : "") + (text || "(no text output)") });
        for (const c of content) {
          if (c.type === "image" && c.source.type === "base64") {
            deferredImages.push({ type: "image_url", image_url: { url: `data:${c.source.media_type};base64,${c.source.data}` } });
          }
        }
      }
    }
    if (deferredImages.length) out.push({ role: "user", content: [{ type: "text", text: "Image(s) returned by the tool above:" }, ...deferredImages] });
    if (parts.length) out.push({ role: "user", content: parts });
  }
  return out;
}

interface StreamChunk {
  choices?: Array<{
    delta?: {
      content?: string | null;
      reasoning_content?: string | null;
      tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

async function readStream(body: ReadableStream<Uint8Array>, callbacks: TurnCallbacks): Promise<TurnResult> {
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let buffer = "";
  let text = "";
  let finish: string | null = null;
  let usage: StreamChunk["usage"];
  const calls = new Map<number, { id: string; name: string; args: string }>();

  const handle = (line: string) => {
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") return;
    let chunk: StreamChunk;
    try {
      chunk = JSON.parse(data) as StreamChunk;
    } catch {
      return;
    }
    if (chunk.usage) usage = chunk.usage;
    const choice = chunk.choices?.[0];
    if (!choice) return;
    if (choice.delta?.content) {
      text += choice.delta.content;
      callbacks.onText?.(choice.delta.content);
    }
    if (choice.delta?.reasoning_content) callbacks.onThinking?.(choice.delta.reasoning_content);
    for (const tc of choice.delta?.tool_calls ?? []) {
      const entry = calls.get(tc.index) ?? { id: "", name: "", args: "" };
      if (tc.id) entry.id = tc.id;
      if (tc.function?.name) entry.name += tc.function.name;
      if (tc.function?.arguments) entry.args += tc.function.arguments;
      calls.set(tc.index, entry);
    }
    if (choice.finish_reason) finish = choice.finish_reason;
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
  if (text) content.push({ type: "text", text });
  let n = 0;
  for (const call of [...calls.entries()].sort(([a], [b]) => a - b).map(([, c]) => c)) {
    let input: unknown;
    try {
      input = call.args ? JSON.parse(call.args) : {};
    } catch {
      // Kept as raw text; the tool's schema check reports it back to the model.
      input = { __invalid_json: call.args };
    }
    content.push({ type: "tool_use", id: call.id || `call_${Date.now()}_${n++}`, name: call.name, input });
  }

  const stopReason: StopReason =
    calls.size > 0 ? "tool_use" : finish === "length" ? "max_tokens" : finish === "content_filter" ? "refusal" : "end_turn";
  return {
    content,
    stopReason,
    usage: { inputTokens: usage?.prompt_tokens ?? 0, outputTokens: usage?.completion_tokens ?? 0, cacheReadTokens: 0 },
  };
}
