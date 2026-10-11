import { describe, expect, it } from "vitest";
import { toChatMessages } from "./openai";

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
