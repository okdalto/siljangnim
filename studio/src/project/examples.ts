import library from "virtual:example-library";
import { exampleCache, type DownloadOptions, type ExampleFile } from "./exampleCache";
import { parseScene, type Scene } from "../scene/schema";

export interface ExampleMeta {
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

export interface PreparedExample {
  scene: Scene;
  pipeline: unknown;
  assets: Array<{ name: string; blob: Blob }>;
}
export interface Example extends ExampleMeta {
  slug: string;
  thumbnail: string;
  files: ExampleFile[];
  bytes: number;
  assets: Array<{ name: string }>;
  load(options?: DownloadOptions): Promise<PreparedExample>;
  scene(): Promise<Scene>;
}

function validatedScene(value: unknown, slug: string): Scene {
  const parsed = parseScene(value);
  if (!parsed.ok) throw new Error(`example ${slug}: ${parsed.errors.join("; ")}`);
  return parsed.scene;
}

export const EXAMPLES: Example[] = library.map((entry) => ({
  ...entry,
  bytes: entry.files.reduce((n, f) => n + f.bytes, 0),
  assets: entry.files.filter((f) => f.path.startsWith("assets/")).map((f) => ({ name: f.path.slice(7) })),
  async load(options?: DownloadOptions) {
    const blobs = await exampleCache.read(entry.slug, entry.files, options);
    const scene = validatedScene(JSON.parse(await blobs.get("scene.json")!.text()), entry.slug);
    const pipeline = blobs.has("pipeline.json") ? JSON.parse(await blobs.get("pipeline.json")!.text()) : null;
    await exampleCache.prune(entry.slug, entry.files);
    return { scene, pipeline, assets: [...blobs].filter(([path]) => path.startsWith("assets/")).map(([path, blob]) => ({ name: path.slice(7), blob })) };
  },
  async scene() {
    // Catalog lookups need only code; do not download media merely to read a reference.
    const blobs = await exampleCache.read(entry.slug, entry.files.filter((f) => f.path === "scene.json"));
    return validatedScene(JSON.parse(await blobs.get("scene.json")!.text()), entry.slug);
  },
})).sort((a, b) => a.order - b.order);
