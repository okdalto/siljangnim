import { describe, expect, it } from "vitest";
import { CATALOG, searchCatalog } from "./catalog";

describe("catalog", () => {
  it("has unique ids and an install path for each grade", () => {
    expect(new Set(CATALOG.map((e) => e.id)).size).toBe(CATALOG.length);
    for (const e of CATALOG) {
      if (e.tier === "B") expect(e.install.cdn, e.id).toMatch(/^https:\/\/(esm\.sh|cdn\.jsdelivr\.net|unpkg\.com)\//);
      if (e.tier === "C" || e.tier === "E") expect(e.install.pip?.length, e.id).toBeGreaterThan(0);
      if (e.tier === "D") expect(e.install.program, e.id).toBeTruthy();
    }
  });

  it("finds by capability, best and lightest first, with filters", () => {
    expect(searchCatalog("delaunay")[0]!.id).toBe("d3-delaunay");
    expect(searchCatalog("plotter svg")[0]!.id).toBe("vpype");
    expect(searchCatalog("depth").map((e) => e.id)).toContain("depth-anything-v2");
    expect(searchCatalog("mesh", { tier: "C" }).every((e) => e.tier === "C")).toBe(true);
    expect(searchCatalog("", { media: "audio" }).map((e) => e.id)).toContain("librosa");
    expect(searchCatalog("nonexistent-capability")).toEqual([]);
  });

  it("catalog_get shows the example built around a tool as a working reference", async () => {
    const { CATALOG_TOOLS } = await import("../agent/catalogTools");
    const get = CATALOG_TOOLS.find((t) => t.name === "catalog_get")!;
    const { stubEnv } = await import("../agent/testing");
    const text = String((await get.run({ id: "librosa" }, stubEnv())).content);
    expect(text).toContain('Example "Beat runway (librosa)"');
    expect(text).toContain("recipe librosa.beat-track@1");
    expect(text).toContain('fetch(ctx.assets["beats.json"])');
    const search = CATALOG_TOOLS.find((t) => t.name === "catalog_search")!;
    expect(String((await search.run(search.input.parse({ query: "delaunay" }), stubEnv())).content)).toContain('Example: "Low-poly drift (d3-delaunay)"');
  });
});
