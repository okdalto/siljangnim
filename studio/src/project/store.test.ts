import "fake-indexeddb/auto";
import { openDB } from "idb";
import { describe, expect, it } from "vitest";
import { DEFAULT_SCENE } from "../scene/schema";
import { ProjectStore, SCENE_FILE, type Version } from "./store";

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

  it("keeps versions per project and deletes them with it", async () => {
    const store = freshStore();
    const p = await store.createProject("P");
    const other = await store.createProject("Other");
    const version = (id: string, projectId: string, parentId: string | null, createdAt: number): Version => ({
      id,
      projectId,
      parentId,
      createdAt,
      message: id,
      scene: DEFAULT_SCENE,
      chatLength: 0,
    });
    await store.addVersion(version("b", p.id, "a", 2));
    await store.addVersion(version("a", p.id, null, 1));
    await store.addVersion(version("x", other.id, null, 1));
    await store.setHead(p.id, "b");

    expect((await store.listVersions(p.id)).map((v) => v.id)).toEqual(["a", "b"]);
    expect((await store.getProject(p.id))?.head).toBe("b");

    await store.deleteProject(p.id);
    expect(await store.listVersions(p.id)).toEqual([]);
    expect(await store.getVersion("a")).toBeUndefined();
    expect((await store.listVersions(other.id)).map((v) => v.id)).toEqual(["x"]);
  });
});

describe("ProjectStore migration", () => {
  it("upgrades a version 1 database without losing data", async () => {
    const name = `migrate-${n++}`;
    // The M1 schema, as shipped.
    const v1 = await openDB(name, 1, {
      upgrade(db) {
        db.createObjectStore("projects", { keyPath: "id" }).createIndex("byUpdated", "updatedAt");
        db.createObjectStore("files", { keyPath: ["projectId", "path"] }).createIndex("byProject", "projectId");
        db.createObjectStore("chats", { keyPath: "projectId" });
      },
    });
    await v1.put("projects", { id: "p1", name: "Old", createdAt: 1, updatedAt: 1 });
    await v1.put("files", { projectId: "p1", path: SCENE_FILE, content: "{}", updatedAt: 1 });
    await v1.put("chats", { projectId: "p1", messages: [{ role: "user", content: "hi" }], updatedAt: 1 });
    v1.close();

    const store = new ProjectStore(name);
    expect((await store.listProjects()).map((p) => p.name)).toEqual(["Old"]);
    expect(await store.readFile("p1", SCENE_FILE)).toBe("{}");
    expect(await store.readChat("p1")).toEqual([{ role: "user", content: "hi" }]);
    expect(await store.listVersions("p1")).toEqual([]);
    await store.addVersion({ id: "v1", projectId: "p1", parentId: null, createdAt: 2, message: "m", scene: DEFAULT_SCENE, chatLength: 1 });
    expect((await store.listVersions("p1")).map((v) => v.id)).toEqual(["v1"]);
  });
});
