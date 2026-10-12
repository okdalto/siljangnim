import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { CATALOG } from "../catalog/catalog";
import { EXAMPLES } from "./examples";

const ROOT = join(import.meta.dirname, "..", "..", "..");

describe("examples", () => {
  it("are all there, in order, with a thumbnail", () => {
    expect(EXAMPLES.length).toBeGreaterThanOrEqual(10);
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
      for (const match of code.matchAll(/(?:assets\[\s*\\?['"]|loadTexture\(\\?['"]|createVideoTexture\(\\?['"]|audio\.play\(\\?['"])([\w.-]+\.\w+)/g)) {
        expect(e.assets.map((a) => a.name), `${e.slug} uses ${match[1]}`).toContain(match[1]);
      }
    }
  });

  it("name the open-source tools they're built around, and ship the recipes they ran", () => {
    const open = EXAMPLES.filter((e) => e.uses?.length);
    expect(open.length).toBeGreaterThanOrEqual(15);
    for (const e of open) for (const id of e.uses!) expect(CATALOG.map((c) => c.id), `${e.slug} uses ${id}`).toContain(id);
    for (const e of EXAMPLES) {
      const dir = join(ROOT, "examples", e.slug, "recipe");
      if (!existsSync(dir)) continue;
      // The example's recipe is the one in the shared registry, byte for byte.
      for (const id of readdirSync(dir)) {
        expect(readFileSync(join(dir, id, "recipe.md"), "utf8"), `${e.slug}: ${id}`).toBe(readFileSync(join(ROOT, "registry", "recipes", id, "recipe.md"), "utf8"));
      }
      const steps = (e.pipeline as { steps?: Array<{ recipe?: string; outputs: string[] }> } | null)?.steps ?? [];
      for (const step of steps) for (const out of step.outputs) expect(e.assets.map((a) => a.name), `${e.slug}: ${out}`).toContain(out);
    }
  });

  it("explain themselves in plain words, in English and Korean", () => {
    for (const e of EXAMPLES) {
      expect(e.summary, e.slug).toBeTruthy();
      expect(e.summary_ko, e.slug).toBeTruthy();
      expect(e.summary!.length, `${e.slug} summary is short`).toBeLessThanOrEqual(160);
      expect(e.try?.length, `${e.slug} has things to try`).toBeGreaterThan(0);
      expect(e.try_ko?.length, `${e.slug} try_ko matches try`).toBe(e.try!.length);
      expect(e.tool_about, e.slug).toBeTruthy();
      expect(e.tool_about_ko, e.slug).toBeTruthy();
    }
  });

  it("credit outside material with a source link and a license", () => {
    for (const e of EXAMPLES) {
      for (const c of e.credits ?? []) {
        expect(c.what && c.source && c.license, e.slug).toBeTruthy();
        expect(c.url, e.slug).toMatch(/^https:\/\//);
      }
    }
    // Examples that ship someone else's font, image or data say so.
    for (const slug of ["oss-opentype", "oss-opencv", "oss-image-q", "oss-sgp4", "oss-umap", "oss-networkx"]) {
      expect(EXAMPLES.find((e) => e.slug === slug)?.credits?.length, slug).toBeGreaterThan(0);
    }
  });
});

