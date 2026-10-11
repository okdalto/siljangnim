import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, activeModel, migrateSettings } from "./settings";

describe("migrateSettings", () => {
  it("turns an old OpenAI-compatible setup with a base URL into a custom server", () => {
    const s = migrateSettings({ provider: "openai", openaiModel: "qwen", openaiBaseUrl: "http://localhost:8000/v1" } as never);
    expect(s).toMatchObject({ provider: "custom", customBaseUrl: "http://localhost:8000/v1", customModel: "qwen", openaiModel: "" });
    expect(s).not.toHaveProperty("openaiBaseUrl");
    expect(activeModel(s)).toBe("qwen");
  });

  it("keeps GPT on api.openai.com when no base URL was set", () => {
    const s = migrateSettings({ provider: "openai", openaiModel: "gpt-x", openaiBaseUrl: "" } as never);
    expect(s.provider).toBe("openai");
    expect(activeModel(s)).toBe("gpt-x");
  });

  it("fills defaults", () => {
    expect(migrateSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it("drops API keys pasted into model or URL fields", () => {
    const s = migrateSettings({ provider: "openai", openaiModel: "sk-proj-abc", customBaseUrl: "sk-xyz" });
    expect(s.openaiModel).toBe("");
    expect(s.customBaseUrl).toBe("");
    expect(JSON.stringify(s)).not.toContain("sk-");
  });
});
