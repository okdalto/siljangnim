import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock storage before importing module
vi.mock("../storage.js", () => ({
  readJson: vi.fn().mockResolvedValue({}),
  writeJson: vi.fn().mockResolvedValue(undefined),
}));

const { toolOpenPanel, toolClosePanel } = await import("./uiTools.js");

describe("toolOpenPanel", () => {
  let broadcast;

  beforeEach(() => {
    broadcast = vi.fn();
  });

  // ---------------------------------------------------------------------------
  // Basic validation
  // ---------------------------------------------------------------------------

  it("returns error when id is missing", async () => {
    const result = await toolOpenPanel({}, broadcast);
    expect(result).toContain("Error");
    expect(result).toContain("id");
    expect(broadcast).not.toHaveBeenCalled();
  });

  it("returns error when controls array is empty", async () => {
    const result = await toolOpenPanel(
      { id: "p1", template: "controls", config: { controls: [] } },
      broadcast,
    );
    expect(result).toContain("Error");
    expect(broadcast).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Native controls mode — quality validation
  // ---------------------------------------------------------------------------

  it("opens panel successfully with good controls", async () => {
    const result = await toolOpenPanel(
      {
        id: "controls",
        template: "controls",
        config: {
          controls: [
            { type: "slider", label: "Speed", uniform: "u_speed", min: 0, max: 3, default: 1 },
            { type: "color", label: "Color", uniform: "u_color", default: "#ff0000" },
          ],
        },
      },
      broadcast,
    );
    expect(result).toContain("ok");
    expect(result).not.toContain("Warning");
    expect(broadcast).toHaveBeenCalledOnce();
    expect(broadcast.mock.calls[0][0]).toMatchObject({
      type: "open_panel",
      id: "controls",
    });
  });

  it("warns when panel has no interactive controls", async () => {
    const result = await toolOpenPanel(
      {
        id: "info",
        template: "controls",
        config: {
          controls: [
            { type: "monitor", label: "FPS", stateKey: "fps" },
            { type: "separator", label: "Info" },
          ],
        },
      },
      broadcast,
    );
    expect(result).toContain("ok");
    expect(result).toContain("Warning");
    expect(result).toContain("no interactive controls");
    // Panel should still be opened (soft validation, not hard error)
    expect(broadcast).toHaveBeenCalledOnce();
  });

  it("warns when controls are missing uniform field", async () => {
    const result = await toolOpenPanel(
      {
        id: "bad",
        template: "controls",
        config: {
          controls: [
            { type: "slider", label: "Speed", min: 0, max: 1, default: 0.5 },
            { type: "toggle", label: "Enable" },
          ],
        },
      },
      broadcast,
    );
    expect(result).toContain("Warning");
    expect(result).toContain("2 control(s) missing 'uniform'");
  });

  it("does not warn about uniform for decorative types", async () => {
    const result = await toolOpenPanel(
      {
        id: "ok",
        template: "controls",
        config: {
          controls: [
            { type: "separator", label: "Group" },
            { type: "slider", label: "Speed", uniform: "u_speed", min: 0, max: 1, default: 0.5 },
            { type: "monitor", label: "FPS", stateKey: "fps" },
            { type: "buffer_preview", label: "Preview", stateKey: "buf" },
          ],
        },
      },
      broadcast,
    );
    expect(result).toContain("ok");
    expect(result).not.toContain("missing 'uniform'");
  });

  it("does not warn about uniform for preset type", async () => {
    const result = await toolOpenPanel(
      {
        id: "presets",
        template: "controls",
        config: {
          controls: [
            { type: "slider", label: "X", uniform: "u_x", min: 0, max: 1, default: 0.5 },
            { type: "preset", label: "Presets", options: [{ label: "A", value: 0 }] },
          ],
        },
      },
      broadcast,
    );
    expect(result).not.toContain("missing 'uniform'");
  });

  it("can emit both warnings at once", async () => {
    const result = await toolOpenPanel(
      {
        id: "terrible",
        template: "controls",
        config: {
          controls: [
            { type: "text", label: "val", default: 1 },
          ],
        },
      },
      broadcast,
    );
    expect(result).toContain("no interactive controls");
    expect(result).toContain("missing 'uniform'");
  });

  // ---------------------------------------------------------------------------
  // HTML and URL modes
  // ---------------------------------------------------------------------------

  it("opens HTML panel", async () => {
    const result = await toolOpenPanel(
      { id: "h1", html: "<div>hello</div>" },
      broadcast,
    );
    expect(result).toContain("ok");
    expect(broadcast).toHaveBeenCalledOnce();
    expect(broadcast.mock.calls[0][0]).toMatchObject({ type: "open_panel", html: "<div>hello</div>" });
  });

  it("opens URL panel with valid https", async () => {
    const result = await toolOpenPanel(
      { id: "u1", url: "https://example.com" },
      broadcast,
    );
    expect(result).toContain("ok");
    expect(result).toContain("URL panel");
  });

  it("rejects non-http URL scheme", async () => {
    const result = await toolOpenPanel(
      { id: "u2", url: "javascript:alert(1)" },
      broadcast,
    );
    expect(result).toContain("Error");
    expect(result).toContain("only http/https");
    expect(broadcast).not.toHaveBeenCalled();
  });

  it("rejects invalid URL", async () => {
    const result = await toolOpenPanel(
      { id: "u3", url: "not a url" },
      broadcast,
    );
    expect(result).toContain("Error");
    expect(result).toContain("invalid URL");
  });

  it("returns error when no html, url, or template provided", async () => {
    const result = await toolOpenPanel({ id: "empty" }, broadcast);
    expect(result).toContain("Error");
    expect(result).toContain("required");
  });

  // ---------------------------------------------------------------------------
  // Default values
  // ---------------------------------------------------------------------------

  it("uses default width/height when not specified", async () => {
    await toolOpenPanel(
      { id: "d1", html: "<p>test</p>" },
      broadcast,
    );
    const msg = broadcast.mock.calls[0][0];
    expect(msg.width).toBe(320);
    expect(msg.height).toBe(300);
  });

  it("uses custom width/height", async () => {
    await toolOpenPanel(
      { id: "d2", html: "<p>test</p>", width: 500, height: 400 },
      broadcast,
    );
    const msg = broadcast.mock.calls[0][0];
    expect(msg.width).toBe(500);
    expect(msg.height).toBe(400);
  });
});

describe("toolClosePanel", () => {
  it("returns error when id is missing", async () => {
    const broadcast = vi.fn();
    const result = await toolClosePanel({}, broadcast);
    expect(result).toContain("Error");
  });

  it("closes panel and broadcasts", async () => {
    const broadcast = vi.fn();
    const result = await toolClosePanel({ id: "p1" }, broadcast);
    expect(result).toContain("ok");
    expect(broadcast).toHaveBeenCalledWith({ type: "close_panel", id: "p1" });
  });
});
