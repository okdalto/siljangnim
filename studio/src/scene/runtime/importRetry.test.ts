import { describe, expect, it, vi } from "vitest";
import { importWithRetry } from "./importRetry";

describe("module network retries", () => {
  it("recovers a failed download with a fresh URL while keeping package and options", async () => {
    const value = { default: 42 };
    const load = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch dynamically imported module"))
      .mockResolvedValue(value);
    expect(await importWithRetry("https://esm.sh/meyda@5.6.3?bundle", load, async () => {})).toBe(value);
    expect(load).toHaveBeenCalledTimes(2);
    const retry = new URL(load.mock.calls[1]?.[0] as string);
    expect(retry.pathname).toBe("/meyda@5.6.3");
    expect(retry.searchParams.has("bundle")).toBe(true);
    expect(retry.searchParams.get("__siljangnim_retry")).toBe("1");
  });
  it("still fails after three network attempts", async () => {
    const error = new TypeError("Failed to fetch dynamically imported module");
    const load = vi.fn().mockRejectedValue(error);
    await expect(importWithRetry("https://esm.sh/test@1", load, async () => {})).rejects.toBe(error);
    expect(load).toHaveBeenCalledTimes(3);
  });
  it("does not retry module execution errors", async () => {
    const error = new TypeError("Cannot read properties of undefined");
    const load = vi.fn().mockRejectedValue(error);
    await expect(importWithRetry("https://esm.sh/test@1", load, async () => {})).rejects.toBe(error);
    expect(load).toHaveBeenCalledTimes(1);
  });
});
