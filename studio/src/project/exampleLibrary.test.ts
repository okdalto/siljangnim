import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "vite";
import { expect, it } from "vitest";
import { exampleLibrary } from "../../server/exampleLibrary";

it("keeps payloads out of JS and excludes them completely from remote builds", async () => {
  const root = mkdtempSync(join(tmpdir(), "example-library-"));
  try {
    const dir = join(root, "examples", "demo");
    mkdirSync(join(dir, "assets"), { recursive: true });
    writeFileSync(join(dir, "example.json"), JSON.stringify({ title: "Demo", order: 1 }));
    writeFileSync(join(dir, "scene.json"), '{"script":"PAYLOAD_SENTINEL"}');
    writeFileSync(join(dir, "thumbnail.png"), "thumbnail");
    writeFileSync(join(dir, "assets", "data.bin"), "ASSET_SENTINEL");
    writeFileSync(join(dir, "assets", "mesh.obj"), "v 0 0 0");
    writeFileSync(join(root, "entry.js"), 'import library from "virtual:example-library"; console.log(library);');
    for (const remote of [undefined, "https://examples.test/pinned/examples"]) {
      const result = await build({ configFile: false, root, logLevel: "silent", plugins: [exampleLibrary(join(root, "examples"), remote)], build: { write: false, rollupOptions: { input: join(root, "entry.js") } } });
      if (!("output" in result)) throw new Error("Expected single build output");
      const chunks = result.output.filter((o) => o.type === "chunk");
      expect(chunks.map((c) => c.code).join("")).not.toMatch(/PAYLOAD_SENTINEL|ASSET_SENTINEL/);
      const assets = result.output.filter((o) => o.type === "asset");
      expect(assets).toHaveLength(remote ? 0 : 4);
      if (!remote) expect(assets.some((a) => a.fileName.endsWith("mesh.obj.txt"))).toBe(true);
      expect(chunks[0]!.code).toContain(remote ?? "/example-library/");
      expect(chunks[0]!.code).toContain("sha256");
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
