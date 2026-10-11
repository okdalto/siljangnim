import { describe, expect, it } from "vitest";
import { RECIPE_TOOLS } from "./recipeTools";
import { noRecipes, noRuntime, stubEnv } from "./testing";
import type { RecipeDetail, RecipeSummary, RuntimeJob, RuntimeRequest } from "./tools";

const tool = (name: string) => RECIPE_TOOLS.find((t) => t.name === name)!;
const summary = (over: Partial<RecipeSummary> = {}): RecipeSummary => ({
  id: "trimesh.knot",
  version: 2,
  title: "Torus knot",
  capability: "mesh-generate",
  tier: "C",
  kind: "python",
  packages: ["trimesh==4.5.3"],
  program: null,
  io: {},
  license: "MIT",
  origin: "local",
  statusHere: "verified",
  testedHere: "2026-10-11",
  ...over,
});
const detail = (over: Partial<RecipeSummary> = {}): RecipeDetail => ({
  summary: summary(over),
  code: "print(1)",
  argv: [],
  text: "---\nid: trimesh.knot\n---",
  verify: { params: { p: 2 }, expectOutputs: ["knot.obj"] },
});
const job = (over: Partial<RuntimeJob> = {}): RuntimeJob => ({ id: "j", state: "done", exitCode: 0, error: null, log: "ok", outputs: ["knot.obj"], assets: ["knot.obj"], resolved: [], seconds: 1, ...over });

function env(recipe: RecipeDetail, result: RuntimeJob) {
  const runs: RuntimeRequest[] = [];
  const statuses: Array<[string, string]> = [];
  const e = stubEnv({
    runtime: { ...noRuntime, unavailable: async () => null, run: async (r) => (runs.push(r), result) },
    recipes: {
      ...noRecipes,
      search: async () => ({ platform: "mac-arm64", recipes: [recipe.summary] }),
      read: async () => recipe,
      save: async () => recipe.summary,
      setStatus: async (_id, status) => (statuses.push([_id, status]), { ...recipe.summary, statusHere: status }),
    },
  });
  return { e, runs, statuses };
}

describe("recipe tools", () => {
  it("search lists status here, dependencies and origin", async () => {
    const { e } = env(detail({ origin: "imported", statusHere: "draft" }), job());
    const text = String((await tool("recipe_search").run(tool("recipe_search").input.parse({ query: "mesh" }), e)).content);
    expect(text).toContain("trimesh.knot v2 [draft (not verified here)] Torus knot — capability: mesh-generate; C/python: trimesh==4.5.3; license MIT; imported");
  });

  it("runs a local verified recipe as trusted, with params", async () => {
    const { e, runs } = env(detail(), job());
    const out = await tool("recipe_run").run(tool("recipe_run").input.parse({ id: "trimesh.knot", params: { p: 3 } }), e);
    expect(String(out.content)).toMatch(/^Recipe trimesh.knot v2 \(verified here\)\.[\s\S]*assets: knot.obj/);
    expect(runs[0]).toMatchObject({ kind: "python", packages: ["trimesh==4.5.3"], code: "print(1)", params: { p: 3 }, recipe: { id: "trimesh.knot", version: 2, trusted: true } });
  });

  it("doesn't trust imported or unverified recipes", async () => {
    for (const over of [{ origin: "imported" }, { statusHere: "draft" as const }, { statusHere: "broken" as const }]) {
      const { e, runs } = env(detail(over), job());
      await tool("recipe_run").run(tool("recipe_run").input.parse({ id: "trimesh.knot" }), e);
      expect(runs[0]!.recipe!.trusted).toBe(false);
    }
  });

  it("verify marks verified only when every expected output was written", async () => {
    const good = env(detail({ statusHere: "draft" }), job());
    const ok = await tool("recipe_verify").run(tool("recipe_verify").input.parse({ id: "trimesh.knot" }), good.e);
    expect(ok.isError).toBeFalsy();
    expect(good.statuses).toEqual([["trimesh.knot", "verified"]]);
    expect(good.runs[0]).toMatchObject({ params: { p: 2 }, recipe: { trusted: false } });

    const missing = env(detail({ statusHere: "draft" }), job({ outputs: [] }));
    const bad = await tool("recipe_verify").run(tool("recipe_verify").input.parse({ id: "trimesh.knot" }), missing.e);
    expect(bad.isError).toBe(true);
    expect(String(bad.content)).toContain("Expected outputs not written: knot.obj");
    expect(missing.statuses).toEqual([["trimesh.knot", "broken"]]);

    const slow = env(detail({ statusHere: "draft" }), job({ state: "installing" }));
    const pending = await tool("recipe_verify").run(tool("recipe_verify").input.parse({ id: "trimesh.knot" }), slow.e);
    expect(String(pending.content)).toContain("isn't marked yet");
    expect(slow.statuses).toEqual([]);
  });
});
