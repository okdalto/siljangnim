import { describe, expect, it } from "vitest";
import { OpenAICompatibleProvider, chatModelIds, toChatMessages } from "./openai";

describe("toChatMessages", () => {
  it("maps tool calls, tool results and images to the chat format", () => {
    const out = toChatMessages("sys", [
      { role: "user", content: [{ type: "text", text: "hi" }] },
      {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "", signature: "s" },
          { type: "text", text: "capturing" },
          { type: "tool_use", id: "c1", name: "viewport_capture", input: { max_size: 512 } },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "c1",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/png", data: "AAAA" } },
              { type: "text", text: "state=running" },
            ],
          },
        ],
      },
    ]);

    expect(out.map((m) => m.role)).toEqual(["system", "user", "assistant", "tool", "user"]);
    expect(out[2]).toEqual({
      role: "assistant",
      content: "capturing",
      tool_calls: [{ id: "c1", type: "function", function: { name: "viewport_capture", arguments: '{"max_size":512}' } }],
    });
    expect(out[3]).toEqual({ role: "tool", tool_call_id: "c1", content: "state=running" });
    const images = out[4]!.content as Array<{ type: string }>;
    expect(images.map((p) => p.type)).toEqual(["text", "image_url"]);
  });
});

describe("chatModelIds", () => {
  const response = {
    data: [
      { id: "text-embedding-3-large", created: 5 },
      { id: "gpt-old", created: 1 },
      { id: "gpt-new", created: 9 },
      { id: "o4-mini", created: 7 },
      { id: "gpt-image-1", created: 8 },
      { id: "gpt-realtime", created: 8 },
      { id: "whisper-1", created: 2 },
      { id: "gpt-new-2026-01-01", created: 9 },
      { id: "gpt-solo-2026-01-01", created: 3 },
      { id: "gpt-new-pro", created: 9 },
      { id: "gpt-new-codex", created: 9 },
      { id: "gpt-4", created: 1 },
      { id: "gpt-3.5-turbo", created: 1 },
    ],
  };

  it("keeps OpenAI chat models, newest first", () => {
    expect(chatModelIds(response, true)).toEqual(["gpt-new", "o4-mini", "gpt-solo-2026-01-01", "gpt-old"]);
  });

  it("keeps everything from other servers and tolerates bad input", () => {
    expect(chatModelIds({ data: [{ id: "qwen" }, { id: "llama" }, { nope: 1 }] }, false)).toEqual(["llama", "qwen"]);
    expect(chatModelIds(null, false)).toEqual([]);
  });
});

describe("OpenAICompatibleProvider", () => {
  it("streams text and sends max_tokens", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      return new Response('data: {"choices":[{"delta":{"content":"hi"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
    }) as typeof fetch;
    try {
      const result = await new OpenAICompatibleProvider({ endpoint: "http://x", baseUrl: "", maxTokens: 1000 }).runTurn(
        { model: "m", system: "s", messages: [], tools: [], effort: "high", signal: new AbortController().signal },
        {},
      );
      expect(result.content).toEqual([{ type: "text", text: "hi" }]);
      expect(bodies[0]).toMatchObject({ max_tokens: 1000 });
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
