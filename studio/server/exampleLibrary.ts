import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import type { Plugin } from "vite";

const MIME: Record<string, string> = {
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml", ".webp": "image/webp", ".gif": "image/gif", ".wav": "audio/wav",
  ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".mp4": "video/mp4", ".webm": "video/webm",
  ".ttf": "font/ttf", ".otf": "font/otf", ".woff": "font/woff", ".woff2": "font/woff2",
  ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".txt": "text/plain", ".csv": "text/csv",
};
const ID = "virtual:example-library";
const hash = (data: Buffer) => createHash("sha256").update(data).digest("hex");

/** Only descriptors enter JS. A remote build emits no example payload or thumbnails. */
export function exampleLibrary(root: string, remoteBase?: string): Plugin {
  if (remoteBase && !/^https:\/\//.test(remoteBase)) throw new Error("SILJANGNIM_EXAMPLES_BASE_URL must use HTTPS");
  const base = remoteBase?.replace(/\/$/, "");
  const local = new Map<string, Buffer>();
  const entries = readdirSync(root).filter((slug) => existsSync(join(root, slug, "example.json"))).map((slug) => {
    const dir = join(root, slug);
    const describe = (path: string) => {
      const data = readFileSync(join(dir, path));
      const sha256 = hash(data);
      const relative = `${slug}/${path}`.split("/").map(encodeURIComponent).join("/");
      // electron-builder excludes *.obj as compiler output, so use .obj.txt only for local delivery.
      const localPath = path.endsWith(".obj") ? `${relative}.txt` : relative;
      const url = base ? `${base}/${relative}` : `/example-library/${sha256}/${localPath}`;
      if (!base) local.set(url, data);
      return { path, url, bytes: data.length, sha256, mime: MIME[extname(path)] ?? "application/octet-stream" };
    };
    const files = [describe("scene.json")];
    if (existsSync(join(dir, "pipeline.json"))) files.push(describe("pipeline.json"));
    if (existsSync(join(dir, "assets"))) for (const name of readdirSync(join(dir, "assets")).sort()) files.push(describe(`assets/${name}`));
    const thumbnail = describe("thumbnail.png").url;
    return { ...JSON.parse(readFileSync(join(dir, "example.json"), "utf8")), slug, thumbnail, files };
  });
  return {
    name: "siljangnim-example-library",
    resolveId(id) { if (id === ID) return `\0${ID}`; },
    load(id) { if (id === `\0${ID}`) return `export default ${JSON.stringify(entries)};`; },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split("?")[0] ?? "";
        const data = local.get(path);
        if (!data) return next();
        res.setHeader("Content-Type", MIME[extname(path)] ?? "application/octet-stream");
        res.setHeader("Content-Length", data.length);
        res.end(data);
      });
      // The manifest hashes must change with the files, including new examples.
      server.watcher.add(root);
      const restart = (path: string) => { if (path.startsWith(root)) void server.restart(); };
      server.watcher.on("change", restart).on("add", restart).on("unlink", restart);
    },
    generateBundle() {
      for (const [url, source] of local) this.emitFile({ type: "asset", fileName: url.slice(1), source });
    },
  };
}
