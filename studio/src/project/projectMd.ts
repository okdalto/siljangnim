// project.md: a project as one readable document another person's agent can
// rebuild from (docs/architecture.md#5-공유-프로젝트-md, docs/project-md.md).
// It carries the scene (code written in this project) and how each generated
// asset was made: recipe references, or the job's own code. Never third-party
// code. Pure: the session gathers the inputs and does the I/O.

import { parseScene, type Scene } from "../scene/schema";

export const PROJECT_MD = "project.md";
export const PIPELINE_FILE = "pipeline.json";

/** One finished runtime job whose outputs became project assets. */
export interface PipelineStep {
  kind: "python" | "command";
  /** id@version when the job ran a recipe. */
  recipe?: string;
  packages: string[];
  /** Exact versions installed (python). */
  resolved: string[];
  /** command: argv with the program name only. */
  argv?: string[];
  /** python: the job's code, or the recipe's (both written by agents, not third-party code). */
  code?: string;
  inputs: string[];
  params?: Record<string, unknown>;
  outputs: string[];
}

export interface ProjectAssetEntry {
  name: string;
  kind: string;
  bytes: number;
  sha256: string;
  /** user-provided, or made by pipeline step N (1-based). */
  source: "user-provided" | `step ${number}`;
  /** Whether the bundle carries the file. */
  included: boolean;
}

export interface ProjectRecipeRef {
  ref: string;
  title?: string;
  license?: string | null;
  weightsLicense?: string | null;
}

export interface ProjectDocument {
  title: string;
  exported: string;
  scene: Scene;
  assets: ProjectAssetEntry[];
  pipeline: PipelineStep[];
  recipes: ProjectRecipeRef[];
  programs: string[];
  /** What the person asked for, oldest first. */
  requests: string[];
  preview: boolean;
}

/**
 * Steps recorded so far plus a new one. A step that remakes the same files
 * (a re-run with other params) takes the old one's place, so later steps
 * that read those files still come after it.
 */
export function addPipelineStep(steps: PipelineStep[], step: PipelineStep): PipelineStep[] {
  const made = new Set(step.outputs);
  const overlaps = (s: PipelineStep) => s.outputs.some((o) => made.has(o));
  const at = steps.findIndex(overlaps);
  if (at < 0) return [...steps, step];
  return steps.flatMap((s, i) => (i === at ? [step] : overlaps(s) ? [] : [s]));
}

/** Which step made each asset, by name (the last step wins). */
export function assetSources(steps: PipelineStep[]): Map<string, number> {
  const sources = new Map<string, number>();
  steps.forEach((s, i) => s.outputs.forEach((o) => sources.set(o, i + 1)));
  return sources;
}

function fence(text: string, lang: string): string {
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((m) => m[0].length));
  const ticks = "`".repeat(Math.max(3, longest + 1));
  return `${ticks}${lang}\n${text.replace(/\n+$/, "")}\n${ticks}`;
}

/** Front matter: one `key: <JSON>` per line, which is valid YAML. */
function front(fields: Record<string, unknown>): string {
  return Object.entries(fields)
    .filter(([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0))
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join("\n");
}

function quote(text: string): string {
  return text
    .trim()
    .split("\n")
    .map((l) => `> ${l}`)
    .join("\n");
}

export function renderProjectMd(doc: ProjectDocument): string {
  const { scene } = doc;
  const weights = doc.recipes.filter((r) => r.weightsLicense);
  const lines: string[] = [];
  lines.push(
    "---",
    front({
      title: doc.title,
      siljangnim: 2,
      exported: doc.exported,
      backend: scene.backend,
      recipes: doc.recipes.map((r) => r.ref),
      programs: doc.programs,
      weights_licenses: weights.map((r) => `${r.ref}: ${r.weightsLicense}`),
      assets: doc.assets,
      pipeline: doc.pipeline.map(({ code: _code, ...rest }) => rest),
      preview: doc.preview ? "preview.png" : undefined,
    }),
    "---",
    "",
    `# ${doc.title}`,
    "",
    "A Siljangnim project. The scene below is the project's own code; generated assets are described by how they were made, so an agent can rebuild them. See **Rebuilding** at the end.",
    "",
    "## Intent",
    "",
  );
  if (doc.requests.length) {
    lines.push("What the person asked for, in order:", "");
    for (const r of doc.requests) lines.push(quote(r.length > 600 ? `${r.slice(0, 600)}…` : r), "");
  } else {
    lines.push("(Not recorded: the conversation happened in an external agent.)", "");
  }
  if (weights.length) {
    lines.push("## Usage conditions", "", "Model weights used here have their own licenses, which may limit how the results can be used:", "");
    for (const r of weights) lines.push(`- ${r.ref}: ${r.weightsLicense}`);
    lines.push("");
  }

  lines.push("## Assets", "");
  if (!doc.assets.length) lines.push("None.", "");
  for (const a of doc.assets) {
    const where = a.source === "user-provided" ? "provided by the person" : `made by ${a.source}`;
    lines.push(`- \`${a.name}\` (${a.kind}, ${a.bytes} bytes): ${where}${a.included ? ", included in the bundle" : ", not included"}`);
  }
  lines.push("");

  lines.push("## Pipeline", "");
  if (!doc.pipeline.length) lines.push("No open-source tools: everything runs in the scene.", "");
  doc.pipeline.forEach((step, i) => {
    const what = step.kind === "python" ? "Python" : `command \`${step.argv?.[0] ?? "?"}\``;
    lines.push(`### Step ${i + 1}: ${what}${step.recipe ? ` (recipe ${step.recipe})` : ""}`, "");
    if (step.packages.length) lines.push(`- Packages: ${step.packages.join(", ")}${step.resolved.length ? ` (installed: ${step.resolved.join(", ")})` : ""}`);
    if (step.kind === "command" && step.argv) lines.push(`- Arguments: \`${JSON.stringify(step.argv)}\``);
    lines.push(`- Inputs: ${step.inputs.length ? step.inputs.map((n) => `\`${n}\``).join(", ") : "none"}`);
    if (step.params && Object.keys(step.params).length) lines.push(`- Params (in/params.json): \`${JSON.stringify(step.params)}\``);
    lines.push(`- Outputs: ${step.outputs.map((n) => `\`${n}\``).join(", ")}`, "");
    if (step.code) lines.push(fence(step.code, "python"), "");
  });

  lines.push("## Scene", "");
  const uniforms = Object.entries(scene.uniforms);
  lines.push(`Backend: ${scene.backend}. Inputs: ${scene.inputs.join(", ") || "none"}.${scene.timeline ? ` Timeline: ${scene.timeline.duration}s${scene.timeline.loop ? ", looping" : ""}.` : ""}`, "");
  if (uniforms.length) {
    lines.push("Controls:", "");
    for (const [name, u] of uniforms) lines.push(`- \`${name}\` (${u.type}${u.label ? `, "${u.label}"` : ""}) = ${JSON.stringify(u.value)}`);
    lines.push("");
  }
  lines.push(fence(JSON.stringify(scene, null, 2), "json"), "");

  lines.push(
    "## Rebuilding",
    "",
    "For an agent connected to Siljangnim (the desktop app, or `npx siljangnim-mcp`):",
    "",
    "1. `project_import_md` with this whole document creates the project with the scene above. Opening the bundle (.zip) in the app instead also brings the included assets and recipes.",
    "2. For each pipeline step whose outputs are missing, in order: with a recipe, `recipe_search` for its id and `recipe_run` it with the inputs and params (imported recipes ask the person before they run). When the recipe isn't on this machine, or the step has none, run the code shown with `python_run` and the same packages, inputs and params (or `command_run` with the arguments). Outputs keep the names listed.",
    "3. Assets provided by the person that aren't included: ask them for the files.",
    "4. Check the result with `viewport_capture`" + (doc.preview ? " and compare it with preview.png; tools aren't always deterministic, so close is fine." : "."),
    "",
  );
  return lines.join("\n");
}

export interface ParsedProjectMd {
  title: string;
  scene: Scene;
  assets: ProjectAssetEntry[];
  pipeline: PipelineStep[];
  recipes: string[];
  weightsLicenses: string[];
}

/** Read a project.md (ours, or edited by hand as long as the scene block is intact). */
export function parseProjectMd(text: string): ParsedProjectMd {
  const normalized = text.replace(/\r\n/g, "\n");
  const meta: Record<string, unknown> = {};
  const fm = normalized.match(/^---\n([\s\S]*?)\n---\n/);
  if (fm) {
    for (const line of fm[1]!.split("\n")) {
      const m = line.match(/^([A-Za-z_]+):\s*(.*)$/);
      if (!m) continue;
      try {
        meta[m[1]!] = JSON.parse(m[2]!);
      } catch {
        meta[m[1]!] = m[2]!.replace(/^["']|["']$/g, "");
      }
    }
  }
  const body = fm ? normalized.slice(fm[0].length) : normalized;
  const sceneStart = body.search(/^## Scene\s*$/m);
  if (sceneStart < 0) throw new Error('no "## Scene" section');
  const block = body.slice(sceneStart).match(/^(`{3,})json\n([\s\S]*?)\n\1\s*$/m);
  if (!block) throw new Error("the Scene section has no ```json block");
  let raw: unknown;
  try {
    raw = JSON.parse(block[2]!);
  } catch (err) {
    throw new Error(`the scene JSON doesn't parse: ${err instanceof Error ? err.message : err}`);
  }
  const parsed = parseScene(raw);
  if (!parsed.ok) throw new Error(`the scene is not valid: ${parsed.errors.join("; ")}`);

  const pipeline = (Array.isArray(meta.pipeline) ? meta.pipeline : []) as PipelineStep[];
  // Code lives in the body, under each step's heading.
  pipeline.forEach((step, i) => {
    const section = body.match(new RegExp(`^### Step ${i + 1}:[^\\n]*\\n([\\s\\S]*?)(?=^### |^## |(?![\\s\\S]))`, "m"));
    const code = section?.[1]!.match(/^(`{3,})python\n([\s\S]*?)\n\1\s*$/m);
    if (code) step.code = code[2];
  });
  const title = typeof meta.title === "string" && meta.title ? meta.title : (body.match(/^# (.+)$/m)?.[1]?.trim() ?? "Imported project");
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  return {
    title,
    scene: parsed.scene,
    assets: (Array.isArray(meta.assets) ? meta.assets : []) as ProjectAssetEntry[],
    pipeline,
    recipes: strings(meta.recipes),
    weightsLicenses: strings(meta.weights_licenses),
  };
}

/** What the agent should hear after an import: what's here and what to rebuild. */
export function importNote(doc: ParsedProjectMd, present: Set<string>, importedRecipes: string[]): string {
  const missing = doc.assets.filter((a) => !present.has(a.name));
  const parts = [`This project was imported from a project.md ("${doc.title}"). The scene is loaded.`];
  if (missing.length) {
    const generated = missing.filter((a) => a.source !== "user-provided");
    const user = missing.filter((a) => a.source === "user-provided");
    if (generated.length) {
      parts.push(`Missing generated assets: ${generated.map((a) => `${a.name} (${a.source})`).join(", ")}. Rebuild them by running the pipeline steps in order (project_export_md shows them with code and params).`);
    }
    if (user.length) parts.push(`Missing assets the original person provided: ${user.map((a) => a.name).join(", ")}; ask for them.`);
  } else if (doc.assets.length) {
    parts.push("All assets came with it.");
  }
  if (importedRecipes.length) parts.push(`Recipes added from the bundle (draft on this machine; running them asks the person first): ${importedRecipes.join(", ")}.`);
  if (doc.weightsLicenses.length) parts.push(`Model weight licenses apply: ${doc.weightsLicenses.join("; ")}. Mention them to the person.`);
  return parts.join(" ");
}
