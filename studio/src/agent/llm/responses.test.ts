import { describe, expect, it } from "vitest";
import { OpenAIResponsesProvider, toResponsesInput } from "./responses";

const sse = (events: object[]) => events.map((e) => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`).join("");

function withFetch(body: string, status = 200) {
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    requests.push({ url, body: JSON.parse(String(init.body)) as Record<string, unknown> });
    return new Response(body, { status });
  }) as typeof fetch;
  return { requests, restore: () => (globalThis.fetch = realFetch) };
}

const run = (provider = new OpenAIResponsesProvider({ endpoint: "http://fwd/llm/openai", maxTokens: 4000 }), callbacks = {}) =>
  provider.runTurn(
    {
      model: "gpt-x",
      system: "sys",
      messages: [{ role: "user", content: [{ type: "text", text: "waves" }] }],
      tools: [{ name: "scene_read", description: "d", input_schema: { type: "object", properties: {} } }],
      effort: "max",
      signal: new AbortController().signal,
    },
    callbacks,
  );

describe("toResponsesInput", () => {
  it("maps text, tool calls, tool results and images", () => {
    const input = toResponsesInput([
      { role: "user", content: [{ type: "text", text: "hi" }, { type: "image", source: { type: "base64", media_type: "image/png", data: "QQ" } }] },
      {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "", signature: "s" },
          { type: "text", text: "looking" },
          { type: "tool_use", id: "c1", name: "viewport_capture", input: { max_size: 256 } },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "c1",
            is_error: true,
            content: [
              { type: "image", source: { type: "base64", media_type: "image/png", data: "AA" } },
              { type: "text", text: "state=error" },
            ],
          },
        ],
      },
    ]);
    expect(input).toEqual([
      { role: "user", content: [{ type: "input_text", text: "hi" }, { type: "input_image", image_url: "data:image/png;base64,QQ" }] },
      { role: "assistant", content: "looking" },
      { type: "function_call", call_id: "c1", name: "viewport_capture", arguments: '{"max_size":256}' },
      { type: "function_call_output", call_id: "c1", output: "ERROR: state=error" },
      { role: "user", content: [{ type: "input_text", text: "Image(s) returned by the tool above:" }, { type: "input_image", image_url: "data:image/png;base64,AA" }] },
    ]);
  });
});

describe("OpenAIResponsesProvider", () => {
  it("sends a Responses request and collects text, tool calls and usage", async () => {
    const fetchMock = withFetch(
      sse([
        { type: "response.reasoning_summary_text.delta", delta: "planning" },
        { type: "response.output_text.delta", delta: "Hi" },
        { type: "response.output_item.done", output_index: 1, item: { type: "message", content: [{ type: "output_text", text: "Hi" }] } },
        { type: "response.output_item.done", output_index: 0, item: { type: "reasoning", summary: [] } },
        { type: "response.output_item.done", output_index: 2, item: { type: "function_call", call_id: "call_1", name: "scene_read", arguments: "{}" } },
        { type: "response.completed", response: { status: "completed", usage: { input_tokens: 10, output_tokens: 5, input_tokens_details: { cached_tokens: 4 } } } },
      ]),
    );
    const text: string[] = [];
    const thinking: string[] = [];
    try {
      const result = await run(undefined, { onText: (d: string) => text.push(d), onThinking: (d: string) => thinking.push(d) });
      expect(fetchMock.requests[0]!.url).toBe("http://fwd/llm/openai/responses");
      expect(fetchMock.requests[0]!.body).toMatchObject({
        model: "gpt-x",
        instructions: "sys",
        max_output_tokens: 4000,
        reasoning: { effort: "high" },
        store: false,
        stream: true,
        tools: [{ type: "function", name: "scene_read" }],
      });
      expect(result.content).toEqual([
        { type: "text", text: "Hi" },
        { type: "tool_use", id: "call_1", name: "scene_read", input: {} },
      ]);
      expect(result.stopReason).toBe("tool_use");
      expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5, cacheReadTokens: 4 });
      expect(text).toEqual(["Hi"]);
      expect(thinking).toEqual(["planning"]);
    } finally {
      fetchMock.restore();
    }
  });

  it("reports output limits and API errors", async () => {
    let fetchMock = withFetch(sse([{ type: "response.incomplete", response: { status: "incomplete", incomplete_details: { reason: "max_output_tokens" } } }]));
    try {
      expect((await run()).stopReason).toBe("max_tokens");
    } finally {
      fetchMock.restore();
    }
    fetchMock = withFetch('{"error":{"message":"bad model"}}', 404);
    try {
      await expect(run()).rejects.toThrow(/OpenAI returned 404: .*bad model/);
    } finally {
      fetchMock.restore();
    }
  });
});
