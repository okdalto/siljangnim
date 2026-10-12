// The examples in /examples, bundled into the studio so a new user can open
// one right away (Projects menu → Examples). Each folder has example.json,
// scene.json, thumbnail.png and optionally assets/.
import { parseScene, type Scene } from "../scene/schema";

interface ExampleMeta {
  order: number;
  title: string;
  title_ko?: string;
  description: string;
  description_ko?: string;
  prompt: string;
  made_with: string;
  features: string[];
  mode: "live" | "timeline";
  /** Platform features the example can't run without, e.g. "webgpu". */
  requires?: string[];
  /** Catalog ids of the open-source tools the example is built around (src/catalog). */
  uses?: string[];
  /** Plain-language versions for people new to it: what you see, what to try, what the tool is. */
  summary?: string;
  summary_ko?: string;
  try?: string[];
  try_ko?: string[];
  tool_about?: string;
  tool_about_ko?: string;
  /** Material from others in the example (fonts, images, data): what, from whom, license, link. */
  credits?: Array<{ what: string; what_ko?: string; source: string; license: string; url: string }>;
}

/** The example's plain-language text in the person's language (technical description as the fallback). */
export function exampleText(e: ExampleMeta, korean: boolean): { title: string; summary: string; tries: string[]; tool: string; details: string } {
  return {
    title: (korean && e.title_ko) || e.title,
    summary: (korean ? e.summary_ko : e.summary) || e.summary || (korean && e.description_ko) || e.description,
    tries: (korean ? e.try_ko : e.try) ?? e.try ?? [],
    tool: (korean ? e.tool_about_ko : e.tool_about) ?? e.tool_about ?? "",
    details: (korean && e.description_ko) || e.description,
  };
}

export interface Example extends ExampleMeta {
  slug: string;
  thumbnail: string;
  assets: Array<{ name: string; url: string }>;
  /** How its generated assets were made (pipeline.json; recipe examples), for project.md. */
  pipeline: unknown;
  /** The scene, validated (scene.json files load on demand to keep the app bundle small). */
  scene(): Promise<Scene>;
}

const metas = import.meta.glob<ExampleMeta>("../../../examples/*/example.json", { eager: true, import: "default" });
const scenes = import.meta.glob<unknown>("../../../examples/*/scene.json", { import: "default" });
const thumbnails = import.meta.glob<string>("../../../examples/*/thumbnail.png", { eager: true, query: "?url", import: "default" });
const pipelines = import.meta.glob<unknown>("../../../examples/*/pipeline.json", { eager: true, import: "default" });
const assetUrls = import.meta.glob<string>("../../../examples/*/assets/*", { eager: true, query: "?url", import: "default" });

const slugOf = (path: string) => path.split("/").at(-2)!;
const dirOf = (path: string) => path.slice(0, path.lastIndexOf("/"));

export const EXAMPLES: Example[] = Object.entries(metas)
  .map(([path, meta]) => {
    const dir = dirOf(path);
    return {
      ...meta,
      slug: slugOf(path),
      thumbnail: thumbnails[`${dir}/thumbnail.png`] ?? "",
      assets: Object.entries(assetUrls)
        .filter(([p]) => p.startsWith(`${dir}/assets/`))
        .map(([p, url]) => ({ name: p.slice(p.lastIndexOf("/") + 1), url })),
      pipeline: pipelines[`${dir}/pipeline.json`] ?? null,
      async scene() {
        const load = scenes[`${dir}/scene.json`];
        if (!load) throw new Error(`example ${slugOf(path)} has no scene.json`);
        const parsed = parseScene(await load());
        if (!parsed.ok) throw new Error(`example ${slugOf(path)}: ${parsed.errors.join("; ")}`);
        return parsed.scene;
      },
    };
  })
  .sort((a, b) => a.order - b.order);
