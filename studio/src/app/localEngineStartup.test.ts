import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalEngineId, LocalEngineStatus } from "../desktop";
import { boot, updateSettings } from "./session";
import { DEFAULT_SETTINGS } from "./settings";
import { useApp } from "./state";

const { detect } = vi.hoisted(() => ({ detect: vi.fn() }));
vi.mock("./platform", async (importOriginal) => ({
  ...await importOriginal<typeof import("./platform")>(),
  bridge: { localAgent: { detect } },
  bridgeToken: null,
  keys: { status: async () => ({ anthropic: false, openai: false }) },
}));

const ready: Record<LocalEngineId, LocalEngineStatus> = {
  "claude-code": { installed: true, loggedIn: true, install: null, docs: "" },
  codex: { installed: false, loggedIn: false, install: null, docs: "" },
};
let finishDetection: (value: typeof ready) => void;

beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  vi.stubGlobal("window", { addEventListener: vi.fn(), location: { hash: "" } });
  useApp.setState({ settings: { ...DEFAULT_SETTINGS }, localEngines: null });
  detect.mockReturnValue(new Promise<typeof ready>((resolve) => { finishDetection = resolve; }));
});
afterEach(() => vi.unstubAllGlobals());

describe("first-launch engine detection", () => {
  it("picks a signed-in engine when no settings were chosen", async () => {
    await boot();
    finishDetection(ready);
    await vi.waitFor(() => expect(useApp.getState().settings.provider).toBe("claude-code"));
  });

  it("keeps the person's choice when detection finishes later", async () => {
    await boot();
    updateSettings({ provider: "anthropic" });
    finishDetection(ready);
    await vi.waitFor(() => expect(useApp.getState().localEngines).toEqual(ready));
    expect(useApp.getState().settings.provider).toBe("anthropic");
  });
});
