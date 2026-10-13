import "fake-indexeddb/auto";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { ExampleCache, type ExampleFile } from "./exampleCache";
import { ProjectStore } from "./store";

function file(path: string, content: string): ExampleFile {
  return { path, url: `https://examples.test/${path}`, bytes: Buffer.byteLength(content), sha256: createHash("sha256").update(content).digest("hex") };
}
const scene = file("scene.json", "scene");
const asset = file("assets/picture.png", "picture");
const example = { slug: "demo", files: [scene, asset] };
const fixtureFetch = () => vi.fn<typeof fetch>(async (url) => new Response(String(url).endsWith("scene.json") ? "scene" : "picture"));

describe("on-demand example cache", () => {
  it("makes no requests until read, persists across instances and reopens without the network", async () => {
    const name = crypto.randomUUID();
    const request = fixtureFetch();
    const cache = new ExampleCache(name, request);
    expect((await cache.status([example])).ready.size).toBe(0);
    expect(request).not.toHaveBeenCalled();
    const progress: number[] = [];
    await cache.read(example.slug, example.files, { onProgress: (n) => progress.push(n) });
    expect(request).toHaveBeenCalledTimes(2);
    expect(progress.at(-1)).toBe(scene.bytes + asset.bytes);
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
    const offline = vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"));
    const reopened = new ExampleCache(name, offline);
    expect(await (await reopened.read(example.slug, example.files)).get(asset.path)!.text()).toBe("picture");
    expect(offline).not.toHaveBeenCalled();
    expect((await reopened.status([example])).ready.has(example.slug)).toBe(true);
  });

  it("keeps verified files for retries but never marks a partial download ready", async () => {
    const request = fixtureFetch().mockResolvedValueOnce(new Response("scene")).mockResolvedValueOnce(new Response("missing", { status: 404 }));
    const cache = new ExampleCache(crypto.randomUUID(), request);
    await expect(cache.read(example.slug, example.files)).rejects.toThrow("HTTP 404");
    expect((await cache.status([example])).ready.size).toBe(0);
    await cache.read(example.slug, example.files);
    expect(request).toHaveBeenCalledTimes(3);
    expect((await cache.status([example])).ready.size).toBe(1);
  });

  it("rejects corrupted, truncated and oversized responses without caching them", async () => {
    for (const content of ["wrong", "scen", "scene plus extra"]) {
      const cache = new ExampleCache(crypto.randomUUID(), vi.fn<typeof fetch>().mockResolvedValue(new Response(content)));
      await expect(cache.read("demo", [scene])).rejects.toThrow(/integrity|size mismatch/);
      expect((await cache.status([example])).bytes).toBe(0);
    }
  });

  it("cancels during transfer without caching an incomplete file, then retries", async () => {
    const controller = new AbortController();
    const request = fixtureFetch();
    const cache = new ExampleCache(crypto.randomUUID(), request);
    await expect(cache.read("demo", [scene], { signal: controller.signal, onProgress: (n) => { if (n) controller.abort(); } })).rejects.toMatchObject({ name: "AbortError" });
    expect((await cache.status([example])).bytes).toBe(0);
    await cache.read("demo", [scene]);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("downloads only changed files and removes obsolete versions after success", async () => {
    const request = fixtureFetch();
    const cache = new ExampleCache(crypto.randomUUID(), request);
    await cache.read("demo", example.files);
    const changed = file("scene.json", "new scene");
    const updated = { slug: "demo", files: [changed, asset] };
    expect((await cache.status([updated])).ready.size).toBe(0);
    request.mockResolvedValue(new Response("new scene"));
    await cache.read("demo", updated.files);
    await cache.prune("demo", updated.files);
    expect(request).toHaveBeenCalledTimes(3);
    expect((await cache.status([updated])).bytes).toBe(changed.bytes + asset.bytes);
  });

  it("uses the declared media type even when the host serves it as plain text", async () => {
    const svg = { ...file("assets/shape.svg", "<svg/>"), mime: "image/svg+xml" };
    const cache = new ExampleCache(crypto.randomUUID(), vi.fn<typeof fetch>().mockResolvedValue(new Response("<svg/>", { headers: { "Content-Type": "text/plain" } })));
    expect((await cache.read("demo", [svg])).get(svg.path)!.type).toBe("image/svg+xml");
  });

  it("clears downloads without deleting projects and downloads again next time", async () => {
    const store = new ProjectStore(crypto.randomUUID());
    const project = await store.createProject("Keep me");
    const request = fixtureFetch();
    const cache = new ExampleCache(crypto.randomUUID(), request);
    await cache.read("demo", example.files);
    await cache.clear();
    expect(await store.getProject(project.id)).toMatchObject({ name: "Keep me" });
    expect((await cache.status([example])).bytes).toBe(0);
    await cache.read("demo", example.files);
    expect(request).toHaveBeenCalledTimes(4);
  });
});
