import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { CATALOG } from "../catalog/catalog";
import { EXAMPLES } from "./examples";
import { exampleFetchFixture } from "./exampleTestFixture";
exampleFetchFixture();

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

  it("name the open-source tools they're built around, and ship the recipes they ran", async () => {
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
      const steps = ((await e.load()).pipeline as { steps?: Array<{ recipe?: string; outputs: string[] }> } | null)?.steps ?? [];
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


describe("SVG path lantern data", () => {
  it("samples a closed path evenly, with unit tangent directions", () => {
    const data = JSON.parse(readFileSync(join(ROOT, "examples/oss-svgpathtools/assets/path.json"), "utf8")) as {
      length: number; points: number[][];
    };
    expect(data.points.length).toBe(600);
    const spacing = data.length / data.points.length;
    data.points.forEach((point, i) => {
      expect(point.every(Number.isFinite)).toBe(true);
      expect(Math.hypot(point[2]!, point[3]!)).toBeCloseTo(1, 5);
      const next = data.points[(i + 1) % data.points.length]!;
      // Chords approximate arc lengths at this resolution, including the closing seam.
      const distance = Math.hypot(next[0]! - point[0]!, next[1]! - point[1]!);
      expect(distance / spacing).toBeGreaterThan(0.98);
      expect(distance / spacing).toBeLessThan(1.001);
    });
  });
});

describe("catalog recipe examples", () => {
  const asset = (slug: string, name: string): unknown => JSON.parse(readFileSync(join(ROOT, "examples", slug, "assets", name), "utf8"));

  it("provides a runnable reference for every catalog tool", () => {
    const used = new Set(EXAMPLES.flatMap((e) => e.uses ?? []));
    for (const tool of CATALOG) expect(used.has(tool.id), tool.id).toBe(true);
  });

  it("ships the recipe inputs as well as outputs", async () => {
    for (const e of EXAMPLES) {
      const steps = ((await e.load()).pipeline as { steps?: Array<{ inputs?: string[] }> } | null)?.steps ?? [];
      for (const step of steps) for (const input of step.inputs ?? []) {
        expect(e.assets.map((a) => a.name), `${e.slug}: input ${input}`).toContain(input);
      }
    }
  });

  it("preserves geometry while reducing travel, points and triangles", () => {
    const paths = asset("oss-vpype", "paths.json") as { before: number[][][]; after: number[][][]; travelBefore: number; travelAfter: number };
    expect(paths.travelAfter).toBeLessThan(paths.travelBefore);
    // Sorting may reverse a path, but must not drop or change any coordinates.
    const points = (lines: number[][][]) => lines.flat().map((p) => p.join(",")).sort();
    expect(points(paths.after)).toEqual(points(paths.before));
    const cloud = asset("oss-open3d", "cloud.json") as { levels: Array<{ points: number[][] }> };
    cloud.levels.forEach((level, i) => {
      expect(level.points.length).toBeGreaterThan(0);
      expect(level.points.every((p) => p.length === 3 && p.every(Number.isFinite))).toBe(true);
      if (i) expect(level.points.length).toBeLessThan(cloud.levels[i - 1]!.points.length);
    });
    const mesh = asset("oss-pymeshlab", "mesh.json") as { levels: Array<{ vertices: number[][]; faces: number[][] }> };
    mesh.levels.forEach((level, i) => {
      expect(level.vertices.every((p) => p.length === 3 && p.every(Number.isFinite))).toBe(true);
      expect(level.faces.every((f) => f.length === 3 && f.every((v) => Number.isInteger(v) && v >= 0 && v < level.vertices.length))).toBe(true);
      if (i) expect(level.faces.length).toBeLessThan(mesh.levels[i - 1]!.faces.length);
    });
  });

  it("keeps speech timestamps and stem envelopes within the source duration", () => {
    const speech = asset("oss-whisper", "transcript.json") as { duration: number; words: Array<{ word: string; start: number; end: number }> };
    expect(speech.words.length).toBeGreaterThan(5);
    speech.words.forEach((word, i) => {
      expect(word.word.trim()).toBeTruthy();
      expect(word.start).toBeGreaterThanOrEqual(i ? speech.words[i - 1]!.start : 0);
      expect(word.end).toBeGreaterThanOrEqual(word.start);
      expect(word.end).toBeLessThanOrEqual(speech.duration);
    });
    const audio = asset("oss-demucs", "stems.json") as { duration: number; stems: Array<{ name: string; rms: number[] }> };
    expect(audio.duration).toBe(6);
    expect(audio.stems.map((s) => s.name).sort()).toEqual(["bass", "drums", "other", "vocals"]);
    for (const stem of audio.stems) {
      expect(stem.rms).toHaveLength(240);
      expect(stem.rms.every((x) => Number.isFinite(x) && x >= 0)).toBe(true);
    }
  });
});
