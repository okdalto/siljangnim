import { afterEach, describe, expect, it, vi } from "vitest";
import { forwardLlmRequest, webForward } from "../../server/llmForward.js";

const upstream = vi.fn(async (..._args: unknown[]) => new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));

function request(path: string, headers: Record<string, string> = {}, origin = "https://studio.example") {
  return new Request(`https://studio.example/api/llm/${path}`, { method: "POST", headers: { origin, ...headers }, body: "{}" });
}

afterEach(() => {
  upstream.mockClear();
  vi.unstubAllGlobals();
});

describe("web LLM forwarder", () => {
  it("forwards the studio's API calls from its own pages", async () => {
    vi.stubGlobal("fetch", upstream);
    const res = await webForward(request("anthropic/v1/messages", { "x-api-key": "k" }));
    expect(res.status).toBe(200);
    expect(String(upstream.mock.calls[0]![0])).toBe("https://api.anthropic.com/v1/messages");
    expect((await webForward(request("openai/responses", { authorization: "Bearer k" }))).status).toBe(200);
  });

  it("refuses other origins, including the scene's", async () => {
    vi.stubGlobal("fetch", upstream);
    expect((await webForward(request("anthropic/v1/messages", {}, "https://scene.example"))).status).toBe(403);
    const noOrigin = new Request("https://studio.example/api/llm/openai/models", { headers: { "sec-fetch-site": "cross-site" } });
    expect((await webForward(noOrigin)).status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("is not an open proxy: only API paths and public https servers", async () => {
    vi.stubGlobal("fetch", upstream);
    expect((await webForward(request("anthropic/v1/files"))).status).toBe(404);
    expect((await webForward(request("openai/anything/else"))).status).toBe(404);
    for (const base of ["http://api.example.com/v1", "https://localhost:11434/v1", "https://192.168.0.5/v1", "https://[::1]/v1", "https://10.1.2.3/v1"]) {
      expect((await webForward(request("openai/chat/completions", { "x-llm-base-url": base }))).status, base).toBe(400);
    }
    expect((await webForward(request("openai/chat/completions", { "x-llm-base-url": "https://openrouter.ai/api/v1" }))).status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it("stays permissive for the desktop and dev server", async () => {
    vi.stubGlobal("fetch", upstream);
    const res = await forwardLlmRequest(request("openai/chat/completions", { "x-llm-base-url": "http://localhost:11434/v1" }));
    expect(res.status).toBe(200);
  });
});
