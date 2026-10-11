import { describe, expect, it } from "vitest";
import { EXAMPLES } from "./examples";

describe("examples", () => {
  it("are all there, in order, with a thumbnail", () => {
    expect(EXAMPLES.length).toBeGreaterThanOrEqual(9);
    expect(EXAMPLES.map((e) => e.order)).toEqual([...EXAMPLES.map((e) => e.order)].sort((a, b) => a - b));
    for (const e of EXAMPLES) {
      expect(e.title, e.slug).toBeTruthy();
      expect(e.description, e.slug).toBeTruthy();
      expect(e.thumbnail, e.slug).toBeTruthy();
    }
  });

  it("have valid scenes whose mode matches, and every asset a scene names is shipped", async () => {
    for (const e of EXAMPLES) {
      const scene = await e.scene();
      expect(Boolean(scene.timeline), e.slug).toBe(e.mode === "timeline");
      expect(scene.backend === "webgpu", e.slug).toBe(Boolean(e.requires?.includes("webgpu")));
      const code = JSON.stringify(scene.script);
      for (const match of code.matchAll(/(?:assets\[\s*\\?['"]|loadTexture\(\\?['"])([\w.-]+\.\w+)/g)) {
        expect(e.assets.map((a) => a.name), `${e.slug} uses ${match[1]}`).toContain(match[1]);
      }
    }
  });
});
