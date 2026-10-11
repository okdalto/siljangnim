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
}

export interface Example extends ExampleMeta {
  slug: string;
  thumbnail: string;
  assets: Array<{ name: string; url: string }>;
  /** The scene, validated (scene.json files load on demand to keep the app bundle small). */
  scene(): Promise<Scene>;
}

const metas = import.meta.glob<ExampleMeta>("../../../examples/*/example.json", { eager: true, import: "default" });
const scenes = import.meta.glob<unknown>("../../../examples/*/scene.json", { import: "default" });
const thumbnails = import.meta.glob<string>("../../../examples/*/thumbnail.png", { eager: true, query: "?url", import: "default" });
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
