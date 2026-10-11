import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { ProjectStore, SCENE_FILE } from "./store";

let n = 0;
const freshStore = () => new ProjectStore(`test-${n++}`);

describe("ProjectStore", () => {
  it("creates, lists by recency, and renames projects", async () => {
    const store = freshStore();
    const a = await store.createProject("A");
    await new Promise((r) => setTimeout(r, 2));
    const b = await store.createProject("B");
    expect((await store.listProjects()).map((p) => p.id)).toEqual([b.id, a.id]);

    await new Promise((r) => setTimeout(r, 2));
    await store.renameProject(a.id, "A2");
    const list = await store.listProjects();
    expect(list[0]).toMatchObject({ id: a.id, name: "A2" });
  });

  it("stores files and chat per project and deletes them together", async () => {
    const store = freshStore();
    const p = await store.createProject("P");
    const other = await store.createProject("Other");
    await store.writeFile(p.id, SCENE_FILE, "{}");
    await store.writeFile(p.id, "assets/a.txt", "hello");
    await store.writeFile(other.id, SCENE_FILE, "[]");
    await store.writeChat(p.id, [{ role: "user", content: "hi" }]);

    expect(await store.listFiles(p.id)).toEqual(["assets/a.txt", SCENE_FILE]);
    expect(await store.readFile(p.id, SCENE_FILE)).toBe("{}");
    expect(await store.readChat(p.id)).toEqual([{ role: "user", content: "hi" }]);

    await store.deleteProject(p.id);
    expect(await store.getProject(p.id)).toBeUndefined();
    expect(await store.listFiles(p.id)).toEqual([]);
    expect(await store.readChat(p.id)).toEqual([]);
    expect(await store.readFile(other.id, SCENE_FILE)).toBe("[]");
  });
});
