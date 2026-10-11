// Recipes: integrations that worked once, saved so the next request runs them
// directly (docs/recipes.md). Running goes through the same runtime as
// python_run/command_run.
import { z } from "zod";
import { jobReport } from "./runtimeTools";
import { defineTool, type RecipeSummary, type RegistryRecipe, type ToolDefinition, type ToolEnv, type ToolOutput } from "./tools";

const WAIT_S = 90;

function line(r: RecipeSummary): string {
  const status = r.statusHere === "verified" ? `verified here ${r.testedHere ?? ""}`.trim() : r.statusHere === "broken" ? "BROKEN here" : "draft (not verified here)";
  const deps = r.kind === "python" ? (r.packages.length ? r.packages.join(" ") : "no packages") : `program ${r.program}`;
  const origin = r.origin === "local" ? "" : "; imported (asks before running)";
  return `${r.id} v${r.version} [${status}] ${r.title} — capability: ${r.capability}; ${r.tier}/${r.kind}: ${deps}${r.license ? `; license ${r.license}` : ""}${origin}`;
}

async function guard(env: ToolEnv): Promise<ToolOutput | null> {
  const reason = await env.runtime.unavailable();
  return reason ? { isError: true, content: reason } : null;
}

const recipeSearch = defineTool({
  name: "recipe_search",
  description:
    "Search saved recipes (integrations of open-source tools that worked before) by capability or words, e.g. " +
    '"mesh", "depth", "audio beats". Do this before setting up a library with python_run: a recipe verified here runs ' +
    "right away with recipe_run.",
  input: z.object({ query: z.string().default("") }),
  readOnly: true,
  async run({ query }, env) {
    const blocked = await guard(env);
    if (blocked) return blocked;
    const { platform, recipes } = await env.recipes.search(query);
    // The shared registry adds recipes this machine doesn't have (or has older).
    let shared = "";
    try {
      const local = new Map(recipes.map((r) => [r.id, r.version]));
      const others = (await env.recipes.registrySearch(query)).recipes.filter((r) => (local.get(r.id) ?? 0) < r.version);
      if (others.length) shared = `\n\nIn the shared registry, not on this machine (recipe_install adds one):\n${others.map(registryLine).join("\n")}`;
    } catch (err) {
      shared = `\n\n(The shared registry couldn't be searched: ${err instanceof Error ? err.message : String(err)})`;
    }
    if (!recipes.length) {
      return { content: `No recipes match "${query}" on ${platform}.${shared ? "" : " Set it up with python_run/command_run, then save it with recipe_save."}${shared}` };
    }
    return { content: `Recipes on ${platform} (best first):\n${recipes.map(line).join("\n")}${shared}` };
  },
});

function registryLine(r: RegistryRecipe): string {
  return `${r.id} v${r.version} ${r.title} — capability: ${r.capability}; ${r.kind}${r.license ? `; license ${r.license}` : ""}; verified on ${r.verifiedOn.join(", ") || "no platform yet"}`;
}

const recipeInstall = defineTool({
  name: "recipe_install",
  description:
    "Add a recipe from the shared registry (found with recipe_search) to this machine. It arrives as a draft: " +
    "recipe_verify it here (the person is asked before its code first runs), then recipe_run.",
  input: z.object({ id: z.string() }),
  readOnly: false,
  async run({ id }, env) {
    const blocked = await guard(env);
    if (blocked) return blocked;
    const { summary, kept } = await env.recipes.install(id);
    if (kept) return { content: `This machine already has ${line(summary)}; kept it.` };
    return { content: `Installed from the registry: ${line(summary)}\nNext: recipe_verify with id "${id}".` };
  },
});

const recipeRead = defineTool({
  name: "recipe_read",
  description: "Read a recipe's markdown: setup, the run code, what params it reads from in/params.json, verification and notes.",
  input: z.object({ id: z.string().min(1) }),
  readOnly: true,
  async run({ id }, env) {
    const blocked = await guard(env);
    if (blocked) return blocked;
    return { content: (await env.recipes.read(id)).text };
  },
});

const recipeSave = defineTool({
  name: "recipe_save",
  description:
    "Save an integration that just worked as a recipe, so later requests can reuse it. Write the code to read its inputs " +
    "from in/ and its parameters from in/params.json (json.load; use defaults when missing), and to write results to out/. " +
    "Pin package versions. Give verify.params and verify.expect_outputs a small, fast case. It is saved as a draft (a new " +
    "version when the code or packages change); then call recipe_verify.",
  input: z.object({
    id: z.string().describe('Lowercase id like "trimesh.torus-knot" (tool.what-it-does).'),
    title: z.string().min(1),
    capability: z.string().min(1).describe('Search words for what it does, e.g. "mesh-generate torus knot".'),
    kind: z.enum(["python", "command"]),
    packages: z.array(z.string()).default([]),
    code: z.string().default("").describe("python: the complete script."),
    argv: z.array(z.string()).default([]).describe("command: program and arguments."),
    source: z.object({ name: z.string().optional(), repo: z.string().optional(), ref: z.string().optional(), license: z.string().optional(), weights_license: z.string().optional() }).default({}),
    io: z.record(z.string(), z.unknown()).default({}).describe('e.g. {"inputs": [{"name": "photo", "media": "image"}], "outputs": [{"name": "depth.png", "media": "image"}]}'),
    verify: z.object({ params: z.record(z.string(), z.unknown()).default({}), expect_outputs: z.array(z.string()).default([]) }).default({ params: {}, expect_outputs: [] }),
    setup: z.string().default("").describe("Anything beyond the packages a person should know to set it up."),
    notes: z.string().default("").describe("Pitfalls found (memory limits, license limits on weights, missing optional deps)."),
  }),
  readOnly: false,
  async run({ id, ...fields }, env) {
    const blocked = await guard(env);
    if (blocked) return blocked;
    const saved = await env.recipes.save(id, fields);
    return { content: `Saved ${line(saved)}.\nNext: recipe_verify with id "${saved.id}".` };
  },
});

const recipeVerify = defineTool({
  name: "recipe_verify",
  description:
    "Run a recipe with its verify params and check that every expected output was written. Marks it verified on this " +
    "platform, or broken (with the log kept in the recipe) when it fails.",
  input: z.object({ id: z.string().min(1), wait_s: z.number().int().min(0).max(110).default(WAIT_S) }),
  readOnly: false,
  async run({ id, wait_s }, env) {
    const blocked = await guard(env);
    if (blocked) return blocked;
    const recipe = await env.recipes.read(id);
    const job = await env.runtime.run(
      {
        kind: recipe.summary.kind,
        packages: recipe.summary.packages,
        code: recipe.code,
        argv: recipe.argv,
        inputs: [],
        params: recipe.verify.params,
        timeoutS: 600,
        waitS: wait_s,
        recipe: { id, version: recipe.summary.version, trusted: false },
      },
      env.signal,
    );
    if (job.state === "queued" || job.state === "installing" || job.state === "running") {
      return { content: `${String(jobReport(job).content)}\nThe recipe isn't marked yet: when job_status shows it finished, call recipe_verify again (installed packages are reused, so it is quick).` };
    }
    const missing = recipe.verify.expectOutputs.filter((name) => !job.outputs.includes(name));
    const ok = job.state === "done" && !missing.length;
    const summary = await env.recipes.setStatus(id, ok ? "verified" : "broken", job.log + (missing.length ? `\nmissing outputs: ${missing.join(", ")}` : ""));
    const report = jobReport(job);
    if (ok) return { content: `Verified: ${line(summary)}\n\n${String(report.content)}` };
    return {
      isError: true,
      content: `Marked broken: ${line(summary)}${missing.length ? `\nExpected outputs not written: ${missing.join(", ")}` : ""}\n\n${String(report.content)}\n\nFix it and save a new version with recipe_save.`,
    };
  },
});

const recipeRun = defineTool({
  name: "recipe_run",
  description:
    "Run a saved recipe with your params (passed as in/params.json) and input assets. Outputs become project assets, as " +
    "with python_run. A recipe verified on this machine runs without asking the person again.",
  input: z.object({
    id: z.string().min(1),
    params: z.record(z.string(), z.unknown()).default({}),
    inputs: z.array(z.string()).default([]),
    timeout_s: z.number().int().min(1).max(1800).default(300),
    wait_s: z.number().int().min(0).max(110).default(WAIT_S),
  }),
  readOnly: false,
  async run({ id, params, inputs, timeout_s, wait_s }, env) {
    const blocked = await guard(env);
    if (blocked) return blocked;
    const recipe = await env.recipes.read(id);
    const s = recipe.summary;
    const trusted = s.origin === "local" && s.statusHere === "verified";
    const job = await env.runtime.run(
      { kind: s.kind, packages: s.packages, code: recipe.code, argv: recipe.argv, inputs, params, timeoutS: timeout_s, waitS: wait_s, recipe: { id, version: s.version, trusted } },
      env.signal,
    );
    const report = jobReport(job);
    const head = `Recipe ${id} v${s.version} (${trusted ? "verified here" : s.statusHere}).`;
    const hint = report.isError && trusted ? "\nIf the recipe itself is at fault (not the params or inputs), run recipe_verify to mark it." : "";
    return { ...report, content: `${head}\n${String(report.content)}${hint}` };
  },
});

export const RECIPE_TOOLS: ToolDefinition[] = [recipeSearch, recipeInstall, recipeRead, recipeSave, recipeVerify, recipeRun] as ToolDefinition[];
