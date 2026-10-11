// Catalog tools: which open-source tool fits, before setting one up (docs/catalog.md).
import { z } from "zod";
import { CATALOG, searchCatalog, type CatalogEntry } from "../catalog/catalog";
import { EXAMPLES, type Example } from "../project/examples";
import { defineTool, type ToolDefinition } from "./tools";

const HOW: Record<CatalogEntry["tier"], string> = {
  B: "JS in the scene via ctx.utils.import",
  C: "Python via python_run",
  D: "installed program via command_run",
  E: "GPU/large model via python_run (slow without a GPU)",
};

/** The gallery example built around a tool: a working integration to learn from. */
const exampleFor = (id: string): Example | undefined => EXAMPLES.find((x) => x.uses?.[0] === id) ?? EXAMPLES.find((x) => x.uses?.includes(id));

function line(e: CatalogEntry): string {
  const example = exampleFor(e.id);
  return `${e.id} [${e.tier}: ${HOW[e.tier]}] ${e.name} — ${e.purpose} License ${e.license}${e.weights_license ? `; weights: ${e.weights_license}` : ""}.${example ? ` Example: "${example.title}".` : ""}`;
}

const MAX_REFERENCE = 4000;

/** The example's setup code (and the recipe it ran), so the agent can follow a version that works. */
async function reference(e: CatalogEntry): Promise<string> {
  const example = exampleFor(e.id);
  if (!example) return "";
  const scene = await example.scene();
  const setup = scene.script.setup.length > MAX_REFERENCE ? `${scene.script.setup.slice(0, MAX_REFERENCE)}\n// …` : scene.script.setup;
  const steps = (example.pipeline as { steps?: Array<{ recipe?: string; params?: unknown }> } | null)?.steps ?? [];
  const recipes = steps.flatMap((s) => (s.recipe ? [`${s.recipe}${s.params ? ` with params ${JSON.stringify(s.params)}` : ""}`] : []));
  return [
    `\nExample "${example.title}" (gallery: Projects → Examples) is built around it. ${example.description}`,
    recipes.length ? `Its assets came from recipe ${recipes.join(", ")} (recipe_search / recipe_install to run it here).` : "",
    `Its scene setup, a working integration:\n${setup}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function detail(e: CatalogEntry): string {
  const install = e.install.cdn ? `import: ${e.install.cdn}` : e.install.pip ? `packages: ${JSON.stringify(e.install.pip)}` : `program: ${e.install.program}`;
  return [
    `${e.name} (${e.id}) — ${e.repo}`,
    e.purpose,
    `Grade ${e.tier}: ${HOW[e.tier]}. ${install}`,
    `Media in: ${e.media.in.join(", ") || "—"}; out: ${e.media.out.join(", ") || "—"}.`,
    `License: ${e.license}${e.weights_license ? `. Model weights: ${e.weights_license} (tell the person when it limits use)` : ""}.`,
    e.gpu ? `GPU: ${e.gpu}.` : "",
    e.notes ?? "",
    "Versions shown are known to exist; check recipe_search for a setup that already worked here.",
  ]
    .filter(Boolean)
    .join("\n");
}

const catalogSearch = defineTool({
  name: "catalog_search",
  description:
    "Search the catalog of open-source tools (metadata only: purpose, grade, license, install) for a capability, e.g. " +
    '"depth", "plotter svg", "beat detection", "triangulation". Lighter options come first: B runs in the scene, C/D/E ' +
    "on this computer. Then recipe_search for a setup that already worked.",
  input: z.object({
    query: z.string().default(""),
    media: z.string().optional().describe("Only tools that take or make this media, e.g. image, audio, svg, model."),
    tier: z.enum(["B", "C", "D", "E"]).optional(),
  }),
  readOnly: true,
  async run({ query, media, tier }) {
    const found = searchCatalog(query, { media, tier });
    if (!found.length) return { content: `Nothing in the catalog (${CATALOG.length} tools) matches "${query}". Pick a well-known library yourself and tell the person where it comes from.` };
    return { content: `Catalog matches (best first):\n${found.slice(0, 12).map(line).join("\n")}` };
  },
});

const catalogGet = defineTool({
  name: "catalog_get",
  description: "Details for one catalog entry: repository, how to install or import it, media, licenses (including model weights).",
  input: z.object({ id: z.string() }),
  readOnly: true,
  async run({ id }) {
    const e = CATALOG.find((c) => c.id === id);
    return e ? { content: detail(e) + (await reference(e)) } : { isError: true, content: `No catalog entry "${id}"; use catalog_search.` };
  },
});

export const CATALOG_TOOLS: ToolDefinition[] = [catalogSearch, catalogGet];
