// The agent loop: one function, reused for sub-agents later (same tools
// subset / turn limit / abort signal arguments).
//
// The conversation is append-only. Assistant turns go back to the API
// unchanged (thinking blocks included), which preserved thinking requires.
import { ProviderError, type ContentBlockParam, type Effort, type LLMProvider, type MessageParam } from "./llm/types";
import { runTool, toolSpec, type ToolDefinition, type ToolEnv, type ToolOutput } from "./tools";
import type Anthropic from "@anthropic-ai/sdk";

export type AgentEvent =
  | { type: "text"; delta: string }
  | { type: "thinking"; delta: string }
  | { type: "tool_start"; id: string; name: string; input: unknown }
  | { type: "tool_end"; id: string; name: string; isError: boolean; output: ToolOutput }
  | { type: "messages"; messages: MessageParam[] }
  | { type: "turn_end"; usage?: { inputTokens: number; outputTokens: number; cacheReadTokens: number } };

export type FinishReason = "done" | "max_turns" | "aborted" | "refusal" | "max_tokens" | "error";

export interface AgentRunOptions {
  provider: LLMProvider;
  model: string;
  effort: Effort;
  system: string;
  tools: ToolDefinition[];
  env: Omit<ToolEnv, "signal">;
  messages: MessageParam[];
  signal: AbortSignal;
  maxTurns?: number;
  onEvent?(event: AgentEvent): void;
}

export interface AgentRunResult {
  messages: MessageParam[];
  reason: FinishReason;
  detail?: string;
}

const REPEAT_LIMIT = 3;
const MALFORMED_RETRIES = 2;

export async function runAgent(options: AgentRunOptions): Promise<AgentRunResult> {
  const { provider, tools, signal, onEvent } = options;
  const messages = [...options.messages];
  const byName = new Map(tools.map((t) => [t.name, t]));
  const specs = tools.map(toolSpec);
  const env: ToolEnv = { ...options.env, signal };
  const maxTurns = options.maxTurns ?? 30;
  const recentCalls: string[] = [];
  let malformed = 0;

  const publish = () => onEvent?.({ type: "messages", messages: [...messages] });

  for (let turn = 0; turn < maxTurns; turn++) {
    if (signal.aborted) return { messages, reason: "aborted" };

    let result;
    try {
      result = await provider.runTurn(
        { model: options.model, system: options.system, messages, tools: specs, effort: options.effort, signal },
        { onText: (delta) => onEvent?.({ type: "text", delta }), onThinking: (delta) => onEvent?.({ type: "thinking", delta }) },
      );
    } catch (err) {
      if (signal.aborted) return { messages, reason: "aborted" };
      // Anything that is not an API error here is tool input the SDK could not
      // parse; the turn was never appended, so re-issuing it is safe.
      if (!(err instanceof ProviderError) && malformed++ < MALFORMED_RETRIES) continue;
      return { messages, reason: "error", detail: err instanceof Error ? err.message : String(err) };
    }
    malformed = 0;
    onEvent?.({ type: "turn_end", usage: result.usage });

    const toolUses = result.content.filter((b): b is Anthropic.Beta.BetaToolUseBlockParam => b.type === "tool_use");

    if (result.stopReason === "refusal") {
      // A refusal can cut a tool call off mid-input, so the turn is dropped
      // whole (never trimmed: editing a turn would invalidate its thinking).
      return { messages, reason: "refusal", detail: result.detail };
    }
    if (result.stopReason === "max_tokens" && toolUses.length) {
      return { messages, reason: "max_tokens", detail: "The model ran out of output tokens while writing a tool call." };
    }

    messages.push({ role: "assistant", content: result.content });
    publish();

    if (result.stopReason === "pause_turn") continue;
    if (!toolUses.length) return { messages, reason: result.stopReason === "max_tokens" ? "max_tokens" : "done" };

    const outputs = await executeTools(toolUses, byName, env, onEvent);
    const results: ContentBlockParam[] = toolUses.map((use) => {
      const output = outputs.get(use.id) ?? { isError: true, content: "Interrupted before this tool ran." };
      let content = output.content;
      const signature = `${use.name}:${JSON.stringify(use.input)}`;
      recentCalls.push(signature);
      if (recentCalls.length > REPEAT_LIMIT) recentCalls.shift();
      if (recentCalls.length === REPEAT_LIMIT && recentCalls.every((c) => c === signature)) {
        const note = `Note: this is the ${REPEAT_LIMIT}rd identical ${use.name} call in a row. Try a different approach.`;
        content = typeof content === "string" ? `${content}\n\n${note}` : [...(content ?? []), { type: "text", text: note }];
      }
      return { type: "tool_result", tool_use_id: use.id, content, ...(output.isError ? { is_error: true } : {}) };
    });
    // All results of one assistant turn go back in a single user message.
    messages.push({ role: "user", content: results });
    publish();
  }
  return { messages, reason: "max_turns" };
}

async function executeTools(
  uses: Anthropic.Beta.BetaToolUseBlockParam[],
  byName: Map<string, ToolDefinition>,
  env: ToolEnv,
  onEvent: AgentRunOptions["onEvent"],
): Promise<Map<string, ToolOutput>> {
  const outputs = new Map<string, ToolOutput>();
  const runOne = async (use: Anthropic.Beta.BetaToolUseBlockParam) => {
    if (env.signal.aborted) {
      outputs.set(use.id, { isError: true, content: "Stopped by the user before this tool ran." });
      return;
    }
    const tool = byName.get(use.name);
    onEvent?.({ type: "tool_start", id: use.id, name: use.name, input: use.input });
    const output: ToolOutput = tool
      ? await runTool(tool, use.input, env)
      : { isError: true, content: `Unknown tool "${use.name}". Available: ${[...byName.keys()].join(", ")}` };
    outputs.set(use.id, output);
    onEvent?.({ type: "tool_end", id: use.id, name: use.name, isError: Boolean(output.isError), output });
  };

  // Consecutive read-only calls run together; anything that changes state runs alone, in order.
  let batch: Anthropic.Beta.BetaToolUseBlockParam[] = [];
  const flush = async () => {
    await Promise.all(batch.map(runOne));
    batch = [];
  };
  for (const use of uses) {
    if (byName.get(use.name)?.readOnly) {
      batch.push(use);
      continue;
    }
    await flush();
    await runOne(use);
  }
  await flush();
  return outputs;
}

/**
 * Make a stored conversation valid to send: a trailing assistant turn whose
 * tool calls never got results (the app closed mid-run) gets error results.
 */
export function repairConversation(messages: MessageParam[]): MessageParam[] {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant" || typeof last.content === "string") return messages;
  const pending = last.content.filter((b): b is Anthropic.Beta.BetaToolUseBlockParam => b.type === "tool_use");
  if (!pending.length) return messages;
  return [
    ...messages,
    {
      role: "user",
      content: pending.map((use) => ({ type: "tool_result" as const, tool_use_id: use.id, content: "Interrupted: the app closed before this tool ran.", is_error: true })),
    },
  ];
}
