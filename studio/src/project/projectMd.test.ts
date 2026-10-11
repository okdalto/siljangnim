import { describe, expect, it } from "vitest";
import { DEFAULT_SCENE } from "../scene/schema";
import { addPipelineStep, assetSources, importNote, parseProjectMd, renderProjectMd, type PipelineStep, type ProjectDocument } from "./projectMd";

const steps: PipelineStep[] = [
  { kind: "python", recipe: "trimesh.torus-knot@2", packages: ["trimesh==4.5.0"], resolved: ["trimesh==4.5.0", "numpy==2.3.1"], inputs: [], params: { p: 2, q: 3 }, outputs: ["knot.obj"] },
  { kind: "python", packages: [], resolved: [], code: "import json\n# a ``` inside code\nprint('hi')", inputs: ["knot.obj"], outputs: ["stats.json"] },
];

function doc(): ProjectDocument {
  const scene = structuredClone(DEFAULT_SCENE);
  scene.script.setup += "\n// a ``` fence in a string";
  return {
    title: "Knot: test",
    exported: "2026-10-11",
    scene,
    assets: [
      { name: "photo.png", kind: "image", bytes: 10, sha256: "ab", source: "user-provided", included: true },
      { name: "knot.obj", kind: "model", bytes: 20, sha256: "cd", source: "step 1", included: false },
      { name: "stats.json", kind: "text", bytes: 5, sha256: "ef", source: "step 2", included: false },
    ],
    pipeline: steps,
    recipes: [{ ref: "trimesh.torus-knot@2", license: "MIT", weightsLicense: null }],
    programs: [],
    requests: ["Make a torus knot", "Make it gold"],
    preview: true,
  };
}

describe("project.md", () => {
  it("round-trips the scene, assets and pipeline (with code) through the document", () => {
    const text = renderProjectMd(doc());
    expect(text).toMatch(/^---\ntitle: "Knot: test"\nsiljangnim: 2/);
    expect(text).toContain("### Step 1: Python (recipe trimesh.torus-knot@2)");
    expect(text).toContain("> Make it gold");
    const parsed = parseProjectMd(text);
    expect(parsed.title).toBe("Knot: test");
    expect(parsed.scene).toEqual(doc().scene);
    expect(parsed.recipes).toEqual(["trimesh.torus-knot@2"]);
    expect(parsed.assets.map((a) => a.source)).toEqual(["user-provided", "step 1", "step 2"]);
    expect(parsed.pipeline[0]!.code).toBeUndefined();
    expect(parsed.pipeline[0]!.params).toEqual({ p: 2, q: 3 });
    expect(parsed.pipeline[1]!.code).toBe(steps[1]!.code);
  });

  it("reads a hand-written document with only a scene", () => {
    const text = `# Hand made\n\n## Scene\n\n\`\`\`json\n${JSON.stringify(DEFAULT_SCENE)}\n\`\`\`\n`;
    const parsed = parseProjectMd(text);
    expect(parsed.title).toBe("Hand made");
    expect(parsed.pipeline).toEqual([]);
    expect(() => parseProjectMd("# nothing")).toThrow(/Scene/);
  });

  it("tells the agent what to rebuild", () => {
    const parsed = parseProjectMd(renderProjectMd(doc()));
    const note = importNote(parsed, new Set(["photo.png"]), ["trimesh.torus-knot"]);
    expect(note).toContain("knot.obj (step 1), stats.json (step 2)");
    expect(note).toContain("Recipes added from the bundle");
    expect(note).not.toContain("ask for them");
  });

  it("keeps one step per output, a re-run in the original's place", () => {
    const rerun = { ...steps[0]!, params: { p: 3, q: 5 } };
    const next = addPipelineStep(steps, rerun);
    expect(next.map((s) => s.outputs[0])).toEqual(["knot.obj", "stats.json"]);
    expect(next[0]!.params).toEqual({ p: 3, q: 5 });
    expect(assetSources(next).get("knot.obj")).toBe(1);
    expect(addPipelineStep(steps, { ...steps[1]!, outputs: ["new.png"] })).toHaveLength(3);
  });
});
