import { describe, expect, it } from "vitest";
import { CATALOG } from "../catalog/catalog";
import { DEFAULT_SCENE, type Scene } from "../scene/schema";
import { MOVES, TRAITS, moveRequest, sceneTraits, suggestMoves } from "./moves";

const scene = (setup: string, render = "", extra: Partial<Scene> = {}): Scene => ({ ...DEFAULT_SCENE, script: { setup, render, cleanup: "" }, ...extra });

describe("moves", () => {
  it("only names traits the scene reader knows and tools the catalog has", () => {
    const ids = new Set(CATALOG.map((c) => c.id));
    for (const move of MOVES) {
      for (const t of [...move.fits, ...move.done]) expect(TRAITS, `${move.id}: trait ${t}`).toContain(t);
      for (const tool of move.tools) expect(ids, `${move.id}: tool ${tool}`).toContain(tool);
      expect(move.guide.length, move.id).toBeGreaterThan(200);
    }
    expect(new Set(MOVES.map((m) => m.id)).size).toBe(MOVES.length);
  });

  it("reads a 2D shader field, a 3D mesh and the inputs", () => {
    const flat = sceneTraits(scene("const p = ctx.utils.createProgram(ctx.utils.FULLSCREEN_VERTEX_SHADER, fs);", "ctx.utils.drawFullscreen(p);"));
    expect([...flat]).toEqual(expect.arrayContaining(["field", "2d"]));
    expect(flat.has("3d")).toBe(false);
    const solid = sceneTraits(scene("const cam = ctx.utils.createOrbitCamera({}); const m = ctx.utils.createMesh(ctx.utils.geometry.sphere(32));", "", { inputs: ["microphone", "midi"] }));
    expect([...solid]).toEqual(expect.arrayContaining(["3d", "mesh", "audio", "midi"]));
    expect(solid.has("2d")).toBe(false);
  });

  it("suggests what fits, one per category first, and skips what is there or was picked", () => {
    const field = scene("ctx.utils.drawFullscreen(p); const t = await ctx.utils.loadTexture('photo.png');");
    const ids = suggestMoves(field, { limit: 4 }).map((s) => s.move.id);
    expect(ids).toHaveLength(4);
    expect(new Set(ids.map((id) => MOVES.find((m) => m.id === id)!.category)).size).toBe(4);
    expect(ids).toContain("extrude-3d");
    // A 3D mesh doesn't get "lift into 3D"; PBR goes away once the code has it; picked moves aren't offered again.
    const mesh = scene("const cam = ctx.utils.createOrbitCamera({}); ctx.utils.createMesh(g);");
    const meshIds = suggestMoves(mesh, { limit: 10 }).map((s) => s.move.id);
    expect(meshIds).not.toContain("extrude-3d");
    expect(meshIds).toContain("pbr-ibl");
    expect(suggestMoves(scene("createOrbitCamera(); createMesh(g); float roughness;"), { limit: 10 }).map((s) => s.move.id)).not.toContain("pbr-ibl");
    expect(suggestMoves(mesh, { limit: 10, applied: ["pbr-ibl"] }).map((s) => s.move.id)).not.toContain("pbr-ibl");
  });

  it("asks the agent for the move by id", () => {
    const move = MOVES.find((m) => m.id === "pixel-sorting")!;
    expect(moveRequest(move)).toMatch(/^\[Move\] Apply "Pixel sorting" \(pixel-sorting\)/);
    expect(moveRequest(move)).toContain('move_get "pixel-sorting"');
  });
});
