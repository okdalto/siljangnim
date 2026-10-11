import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EXTERNAL_TOOLS, mcpSpec } from "./external";

describe("MCP spec", () => {
  it("matches mcp/src/spec.json (run npm --prefix studio run export-mcp)", () => {
    const committed = JSON.parse(readFileSync(join(import.meta.dirname, "../../../mcp/src/spec.json"), "utf8"));
    expect(committed).toEqual(mcpSpec());
  });

  it("leaves out ask_user and tells external agents to talk in their own chat", () => {
    expect(EXTERNAL_TOOLS.map((t) => t.name)).not.toContain("ask_user");
    expect(mcpSpec().instructions).toContain("Talk with the person in your own chat");
    expect(mcpSpec().instructions).not.toContain("ask_user");
  });
});
