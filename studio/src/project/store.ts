// Projects, their files and their chat, in IndexedDB.
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { MessageParam } from "../agent/llm/types";

export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectFile {
  projectId: string;
  path: string;
  content: string | Blob;
  updatedAt: number;
}

export interface ProjectChat {
  projectId: string;
  messages: MessageParam[];
  updatedAt: number;
}

interface StudioDB extends DBSchema {
  projects: { key: string; value: ProjectMeta; indexes: { byUpdated: number } };
  files: { key: [string, string]; value: ProjectFile; indexes: { byProject: string } };
  chats: { key: string; value: ProjectChat };
}

export const SCENE_FILE = "scene.json";

export class ProjectStore {
  private readonly db: Promise<IDBPDatabase<StudioDB>>;

  constructor(name = "siljangnim-studio") {
    this.db = openDB<StudioDB>(name, 1, {
      upgrade(db) {
        db.createObjectStore("projects", { keyPath: "id" }).createIndex("byUpdated", "updatedAt");
        db.createObjectStore("files", { keyPath: ["projectId", "path"] }).createIndex("byProject", "projectId");
        db.createObjectStore("chats", { keyPath: "projectId" });
      },
    });
  }

  async listProjects(): Promise<ProjectMeta[]> {
    const all = await (await this.db).getAllFromIndex("projects", "byUpdated");
    return all.reverse();
  }

  async getProject(id: string): Promise<ProjectMeta | undefined> {
    return (await this.db).get("projects", id);
  }

  async createProject(name: string): Promise<ProjectMeta> {
    const now = Date.now();
    const project: ProjectMeta = { id: crypto.randomUUID(), name, createdAt: now, updatedAt: now };
    await (await this.db).put("projects", project);
    return project;
  }

  async renameProject(id: string, name: string): Promise<void> {
    await this.touch(id, { name });
  }

  async deleteProject(id: string): Promise<void> {
    const db = await this.db;
    const tx = db.transaction(["projects", "files", "chats"], "readwrite");
    const fileKeys = await tx.objectStore("files").index("byProject").getAllKeys(id);
    await Promise.all([
      tx.objectStore("projects").delete(id),
      tx.objectStore("chats").delete(id),
      ...fileKeys.map((key) => tx.objectStore("files").delete(key)),
      tx.done,
    ]);
  }

  async readFile(projectId: string, path: string): Promise<string | Blob | undefined> {
    return (await (await this.db).get("files", [projectId, path]))?.content;
  }

  async writeFile(projectId: string, path: string, content: string | Blob): Promise<void> {
    await (await this.db).put("files", { projectId, path, content, updatedAt: Date.now() });
    await this.touch(projectId);
  }

  async listFiles(projectId: string): Promise<string[]> {
    const keys = await (await this.db).getAllKeysFromIndex("files", "byProject", projectId);
    return keys.map(([, path]) => path).sort();
  }

  async readChat(projectId: string): Promise<MessageParam[]> {
    return (await (await this.db).get("chats", projectId))?.messages ?? [];
  }

  async writeChat(projectId: string, messages: MessageParam[]): Promise<void> {
    await (await this.db).put("chats", { projectId, messages, updatedAt: Date.now() });
    await this.touch(projectId);
  }

  private async touch(id: string, patch: Partial<ProjectMeta> = {}): Promise<void> {
    const db = await this.db;
    const project = await db.get("projects", id);
    if (project) await db.put("projects", { ...project, ...patch, updatedAt: Date.now() });
  }
}
