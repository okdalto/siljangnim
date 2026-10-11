import { describe, expect, it } from "vitest";
import { noProject, noRecipes, noRuntime } from "../agent/testing";
import { ASSET_TOOLS } from "../agent/assetTools";
import type { AssetController, HistoryController, SceneController } from "../agent/tools";
import {
  assetKind,
  assetMimeType,
  describeMeta,
  glbStats,
  gltfStats,
  objStats,
  sanitizeAssetName,
  svgStats,
  textStats,
  uniqueAssetName,
  type AssetInfo,
} from "./assets";

describe("asset names", () => {
  it("strips folders and unsafe characters", () => {
    expect(sanitizeAssetName("C:\\pics\\my photo.png")).toBe("my-photo.png");
    expect(sanitizeAssetName('../"evil"<x>.svg')).toBe("evilx.svg");
    expect(sanitizeAssetName("...")).toBe("asset");
  });

  it("numbers duplicates before the extension", () => {
    expect(uniqueAssetName("a.png", [])).toBe("a.png");
    expect(uniqueAssetName("a.png", ["a.png", "a-2.png"])).toBe("a-3.png");
    expect(uniqueAssetName("data", ["data"])).toBe("data-2");
  });

  it("classifies by extension, then MIME type", () => {
    expect(assetKind("x.PNG")).toBe("image");
    expect(assetKind("x.svg")).toBe("svg");
    expect(assetKind("clip.webm")).toBe("video");
    expect(assetKind("m.glb")).toBe("model");
    expect(assetKind("d.json")).toBe("text");
    expect(assetKind("noext", "audio/mpeg")).toBe("audio");
    expect(assetKind("noext", "")).toBe("other");
    expect(assetMimeType("m.glb", "")).toBe("model/gltf-binary");
    expect(assetMimeType("x.png", "image/png")).toBe("image/png");
  });
});

describe("asset metadata", () => {
  const gltf = {
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    accessors: [
      { count: 8, min: [-1, -1, -1], max: [1, 2, 1] },
      { count: 36 },
    ],
    materials: [{}],
    animations: [{}, {}],
  };

  it("counts glTF vertices, faces and bounds", () => {
    expect(gltfStats(gltf)).toMatchObject({ vertices: 8, faces: 12, meshes: 1, materials: 1, animations: 2, boundsMin: [-1, -1, -1], boundsMax: [1, 2, 1] });
  });

  it("reads the JSON chunk of a GLB", () => {
    const json = new TextEncoder().encode(JSON.stringify(gltf).padEnd(Math.ceil(JSON.stringify(gltf).length / 4) * 4, " "));
    const buffer = new ArrayBuffer(20 + json.length);
    const view = new DataView(buffer);
    view.setUint32(0, 0x46546c67, true);
    view.setUint32(4, 2, true);
    view.setUint32(8, buffer.byteLength, true);
    view.setUint32(12, json.length, true);
    view.setUint32(16, 0x4e4f534a, true);
    new Uint8Array(buffer, 20).set(json);
    expect(glbStats(buffer)).toMatchObject({ vertices: 8, faces: 12 });
    expect(() => glbStats(new ArrayBuffer(24))).toThrow(/not a GLB/);
  });

  it("counts OBJ elements", () => {
    expect(objStats("v 0 0 0\nv 1 0 0\nv 0 1 0\nvn 0 0 1\nf 1 2 3\n")).toEqual({ vertices: 3, faces: 1, normals: true, uvs: false });
  });

  it("reads SVG size from attributes or the viewBox", () => {
    expect(svgStats('<svg width="120" height="80px">')).toEqual({ width: 120, height: 80 });
    expect(svgStats('<svg viewBox="0 0 24 24" xmlns="x">')).toEqual({ width: 24, height: 24 });
    expect(svgStats("<svg>")).toEqual({});
  });

  it("describes text and JSON", () => {
    expect(textStats("a.json", '{"a":1,"b":2}')).toEqual({ lines: 1, json: "object with 2 keys" });
    expect(textStats("a.json", "[1,2")).toMatchObject({ json: expect.stringMatching(/^invalid/) });
    expect(describeMeta("image", { width: 640, height: 400 })).toBe("image 640x400");
    expect(describeMeta("video", { width: 1920, height: 1080, duration: 3.5 })).toBe("video 1920x1080 3.50s");
  });
});

describe("asset tools", () => {
  const list = ASSET_TOOLS.find((t) => t.name === "asset_list")!;
  const read = ASSET_TOOLS.find((t) => t.name === "asset_read")!;
  const files: Record<string, Blob> = {
    "poster.png": new Blob([new Uint8Array([137, 80])], { type: "image/png" }),
    "data.json": new Blob(['{"points":[1,2,3]}'], { type: "application/json" }),
    "long.txt": new Blob(["x".repeat(250)], { type: "text/plain" }),
  };
  const infos: AssetInfo[] = [
    { name: "data.json", kind: "text", size: 18, type: "application/json", meta: { lines: 1, json: "object with 1 keys" } },
    { name: "poster.png", kind: "image", size: 2048, type: "image/png", meta: { width: 640, height: 400 } },
  ];
  const assets: AssetController = { list: async () => infos, read: async (name) => files[name] };
  const env = { scene: {} as SceneController, history: {} as HistoryController, assets, user: { ask: async () => null }, runtime: noRuntime, recipes: noRecipes, project: noProject, signal: new AbortController().signal };

  it("lists assets with size and metadata", async () => {
    const text = String((await list.run({}, env)).content);
    expect(text).toContain("data.json  18 B  text 1 lines JSON object with 1 keys");
    expect(text).toContain("poster.png  2.0 KB  image 640x400");
  });

  it("reads text in pages and refuses binaries with a hint", async () => {
    expect((await read.run(read.input.parse({ name: "data.json" }), env)).content).toBe('{"points":[1,2,3]}');
    const page = String((await read.run(read.input.parse({ name: "long.txt", max_chars: 100 }), env)).content);
    expect(page).toContain("characters 0-100 of 250; call again with offset=100");
    const image = await read.run(read.input.parse({ name: "poster.png" }), env);
    expect(image.isError).toBe(true);
    expect(String(image.content)).toContain('ctx.utils.loadTexture("poster.png")');
    const missing = await read.run(read.input.parse({ name: "nope" }), env);
    expect(String(missing.content)).toContain("Available: data.json, poster.png");
  });
});
