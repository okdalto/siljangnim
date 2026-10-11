import { describe, expect, it } from "vitest";
import { storedZip } from "../scene/runtime/zip";
import { convertV1Project, readZip } from "./v1Import";

const enc = new TextEncoder();
const json = (v: unknown) => enc.encode(JSON.stringify(v));

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** A zip with the given entry deflated (method 8), built by patching a stored one. */
async function zipWithDeflated(files: Array<{ name: string; data: Uint8Array }>, deflatedName: string): Promise<ArrayBuffer> {
  const out = files.map((f) => ({ ...f }));
  const target = out.find((f) => f.name === deflatedName)!;
  const compressed = await deflate(target.data);
  target.data = compressed;
  const bytes = new Uint8Array(await storedZip(out).arrayBuffer());
  const view = new DataView(bytes.buffer);
  // Set method 8 in the local header and central directory entry of that file.
  for (let i = 0; i < bytes.length - 4; i++) {
    const sig = view.getUint32(i, true);
    const nameAt = sig === 0x04034b50 ? i + 30 : sig === 0x02014b50 ? i + 46 : -1;
    if (nameAt < 0) continue;
    const len = view.getUint16(sig === 0x04034b50 ? i + 26 : i + 28, true);
    if (new TextDecoder().decode(bytes.subarray(nameAt, nameAt + len)) !== deflatedName) continue;
    view.setUint16(sig === 0x04034b50 ? i + 8 : i + 10, 8, true);
  }
  return bytes.buffer;
}

const V1_SCENE = {
  version: 1,
  render_mode: "script",
  backendTarget: "auto",
  script: { setup: "ctx.state.img = ctx.uploads['my photo.png'];", render: "ctx.utils.drawFullscreen(ctx.state.p);" },
  uniforms: { u_speed: { type: "float", value: 1 }, u_tint: { type: "vec4", value: [1, 0, 0, 1] }, u_on: { type: "bool", value: true } },
};

const PANELS = {
  controls: {
    title: "Controls",
    controls: [
      { type: "separator", label: "Motion" },
      { type: "slider", label: "Speed", uniform: "u_speed", min: 0, max: 4, step: 0.1, default: 2 },
      { type: "toggle", label: "On", uniform: "u_on", default: false },
      { type: "separator", label: "Look" },
      { type: "color", label: "Tint", uniform: "u_tint", default: "#00ff0080" },
      { type: "dropdown", label: "Mode", uniform: "u_mode", options: [{ label: "A", value: 0 }, { label: "B", value: 1 }], default: 1 },
      { type: "monitor", label: "FPS", stateKey: "fps" },
    ],
  },
  notes: { title: "Notes", html: "<p>hi</p>" },
};

describe("v1 import", () => {
  it("reads stored and deflated zip entries", async () => {
    const files = await readZip(await zipWithDeflated([{ name: "p/scene.json", data: json({ a: 1 }) }, { name: "p/x.txt", data: enc.encode("hello hello hello") }], "p/x.txt"));
    expect(new TextDecoder().decode(files.get("p/x.txt"))).toBe("hello hello hello");
    expect(new TextDecoder().decode(files.get("p/scene.json"))).toBe('{"a":1}');
    await expect(readZip(new ArrayBuffer(10))).rejects.toThrow("not a zip");
  });

  it("converts the scene, controls, groups and uploads, and lists what it left out", async () => {
    const zip = storedZip([
      { name: "My Piece/siljangnim-project.json", data: json({ name: "my-piece", display_name: "My Piece", schema_version: 2 }) },
      { name: "My Piece/scene.json", data: json(V1_SCENE) },
      { name: "My Piece/panels.json", data: json(PANELS) },
      { name: "My Piece/chat_history.json", data: json([{ role: "user", text: "hi" }]) },
      { name: "My Piece/uploads/my photo.png", data: new Uint8Array([137, 80, 78, 71]) },
      { name: "My Piece/_nodes/nodes.json", data: json([]) },
    ]);
    const result = convertV1Project(await readZip(await zip.arrayBuffer()));
    expect(result.name).toBe("My Piece");
    expect(result.scene.version).toBe(2);
    expect(result.scene.uniforms.u_speed).toEqual({ type: "float", value: 2, min: 0, max: 4, step: 0.1, label: "Speed" });
    expect(result.scene.uniforms.u_tint).toMatchObject({ type: "color", value: [0, 1, 0, 128 / 255], label: "Tint" });
    expect(result.scene.uniforms.u_on).toMatchObject({ type: "bool", value: false, widget: "toggle" });
    expect(result.scene.uniforms.u_mode).toMatchObject({ type: "int", value: 1, widget: "select" });
    expect(result.scene.controls).toEqual([
      { label: "Motion", uniforms: ["u_speed", "u_on"] },
      { label: "Look", uniforms: ["u_tint", "u_mode"] },
    ]);
    expect(result.assets.map((a) => a.name)).toEqual(["my-photo.png"]);
    expect(result.notes.join("\n")).toMatch(/"my photo.png" is now the asset "my-photo.png"/);
    expect(result.notes.join("\n")).toMatch(/"monitor" controls have no v2 equivalent/);
    expect(result.notes.join("\n")).toMatch(/v1 panel "Notes" \(HTML\/URL\) was not imported/);
    expect(result.notes.join("\n")).toMatch(/chat history was not imported/);
  });

  it("explains a zip that isn't a v1 project", async () => {
    const zip = storedZip([{ name: "readme.txt", data: enc.encode("x") }]);
    expect(() => convertV1Project(new Map([["readme.txt", new Uint8Array()]]))).toThrow(/no scene.json/);
    expect(zip.size).toBeGreaterThan(0);
  });
});
