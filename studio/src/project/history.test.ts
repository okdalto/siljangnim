import { describe, expect, it } from "vitest";
import { noRuntime } from "../agent/testing";
import { HISTORY_TOOLS } from "../agent/historyTools";
import type { HistoryController, SceneController, VersionInfo } from "../agent/tools";
import { DEFAULT_SCENE } from "../scene/schema";
import { layoutTree, resolveVersionId, sameScene, versionMessage } from "./history";

const v = (id: string, parentId: string | null, createdAt: number) => ({ id, parentId, createdAt });

describe("sameScene", () => {
  it("ignores key order but not values", () => {
    const reordered = Object.fromEntries(Object.entries(DEFAULT_SCENE).reverse()) as typeof DEFAULT_SCENE;
    expect(sameScene(DEFAULT_SCENE, reordered)).toBe(true);
    const tweaked = structuredClone(DEFAULT_SCENE);
    tweaked.uniforms.u_speed!.value = 2;
    expect(sameScene(DEFAULT_SCENE, tweaked)).toBe(false);
  });
});

describe("versionMessage", () => {
  it("keeps one short line", () => {
    expect(versionMessage("  make\n  waves ")).toBe("make waves");
    const long = versionMessage("x".repeat(100));
    expect(long).toHaveLength(60);
    expect(long.endsWith("…")).toBe(true);
    expect(versionMessage("   ")).toBe("Untitled change");
  });
});

describe("layoutTree", () => {
  it("keeps the main line flat and indents branches under their parent", () => {
    // a → b → c, then restore a and branch d → e, then restore b and branch f
    const versions = [v("a", null, 1), v("b", "a", 2), v("c", "b", 3), v("d", "a", 4), v("e", "d", 5), v("f", "b", 6)];
    const rows = layoutTree(versions).map((r) => `${r.depth}${r.version.id}`);
    expect(rows).toEqual(["0a", "1d", "1e", "0b", "1f", "0c"]);
  });

  it("treats versions with a missing parent as roots", () => {
    expect(layoutTree([v("x", "gone", 1)]).map((r) => r.depth)).toEqual([0]);
  });

  it("handles long linear histories", () => {
    const chain = Array.from({ length: 20_000 }, (_, i) => v(`v${i}`, i ? `v${i - 1}` : null, i));
    const rows = layoutTree(chain);
    expect(rows).toHaveLength(20_000);
    expect(rows.every((r) => r.depth === 0)).toBe(true);
  });
});

describe("resolveVersionId", () => {
  const versions = [{ id: "abcd1234-0000" }, { id: "abcd9999-0000" }, { id: "ffff0000-0000" }];

  it("accepts full ids and unique prefixes", () => {
    expect(resolveVersionId(versions, "ffff0000-0000").id).toBe("ffff0000-0000");
    expect(resolveVersionId(versions, "abcd12").id).toBe("abcd1234-0000");
  });

  it("explains ambiguous and unknown ids", () => {
    expect(() => resolveVersionId(versions, "abcd")).toThrow(/matches 2 versions/);
    expect(() => resolveVersionId(versions, "nope")).toThrow(/history_list/);
  });
});

describe("history tools", () => {
  const list = HISTORY_TOOLS.find((t) => t.name === "history_list")!;
  const restoreTool = HISTORY_TOOLS.find((t) => t.name === "history_restore")!;
  const infos: VersionInfo[] = [
    { id: "11111111-aaaa", parentId: null, createdAt: Date.UTC(2026, 9, 11, 4, 0), message: "Initial scene", head: false },
    { id: "22222222-bbbb", parentId: "11111111-aaaa", createdAt: Date.UTC(2026, 9, 11, 4, 5), message: "make waves", head: true },
  ];
  const scene = { get: () => DEFAULT_SCENE } as SceneController;
  const restored: string[] = [];
  const history: HistoryController = {
    list: async () => infos,
    restore: async (id) => {
      restored.push(id);
      return { version: infos[0]!, load: { ok: true, errors: [] } };
    },
  };
  const env = { scene, history, assets: { list: async () => [], read: async () => undefined }, user: { ask: async () => null }, runtime: noRuntime, signal: new AbortController().signal };

  it("lists versions with short ids and marks HEAD", async () => {
    const out = await list.run({}, env);
    const text = String(out.content);
    expect(text).toContain('11111111  2026-10-11 04:00  "Initial scene"');
    expect(text).toMatch(/22222222 .*"make waves"\s+<- HEAD/);
  });

  it("restores by id and reports the load result", async () => {
    const out = await restoreTool.run(restoreTool.input.parse({ id: "11111111" }), env);
    expect(restored).toEqual(["11111111"]);
    expect(out.isError).toBeFalsy();
    expect(String(out.content)).toContain('Restored version 11111111 "Initial scene"');
  });
});
