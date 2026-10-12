import { describe, expect, it } from "vitest";
import { CATALOG, REFERENCES, referenceFor, searchCatalog, searchReferences } from "./catalog";

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

  it("carries the index.opensource reference list, without repeating curated tools", () => {
    // Every listed project is either curated (and linked) or kept as a reference.
    expect(REFERENCES.length + CATALOG.filter((e) => referenceFor(e)).length).toBe(412);
    expect(new Set(REFERENCES.map((r) => r.id)).size).toBe(REFERENCES.length);
    // d3-delaunay is curated, so the reference copy is dropped and linked instead.
    expect(REFERENCES.some((r) => r.name === "d3-delaunay")).toBe(false);
    expect(referenceFor(CATALOG.find((e) => e.id === "d3-delaunay")!)?.index.no).toBe(2);
    expect(searchReferences("context free").map((r) => r.name)).toContain("Context Free");
    expect(searchReferences("")).toEqual([]);
  });

  it("catalog_search adds reference matches after the curated ones", async () => {
    const { CATALOG_TOOLS } = await import("../agent/catalogTools");
    const { stubEnv } = await import("../agent/testing");
    const search = CATALOG_TOOLS.find((t) => t.name === "catalog_search")!;
    const text = String((await search.run(search.input.parse({ query: "streamlines" }), stubEnv())).content);
    expect(text).toContain("From the reference list (index.opensource");
    const get = CATALOG_TOOLS.find((t) => t.name === "catalog_get")!;
    const ref = REFERENCES.find((r) => r.name === "Context Free")!;
    expect(String((await get.run({ id: ref.id }, stubEnv())).content)).toContain("Not set up in Siljangnim yet");
  });
});

