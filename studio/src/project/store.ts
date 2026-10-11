// Projects, their files and their chat, in IndexedDB.
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { MessageParam } from "../agent/llm/types";
import type { Scene } from "../scene/schema";
import type { AssetMeta } from "./assets";

export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** Version the current scene descends from (see docs/m2.md#1-버전-히스토리). */
  head?: string;
}

export interface ProjectFile {
  projectId: string;
  path: string;
  content: string | Blob;
  updatedAt: number;
  /** Analysis results for assets (see project/assets.ts). */
  meta?: AssetMeta;
}

export interface ProjectChat {
  projectId: string;
  messages: MessageParam[];
  updatedAt: number;
}

/** A full scene snapshot in the project's version tree. */
export interface Version {
  id: string;
  projectId: string;
  parentId: string | null;
  createdAt: number;
  message: string;
  scene: Scene;
  thumbnail?: Blob;
  /** Number of chat messages when the version was made. */
  chatLength: number;
}

interface StudioDB extends DBSchema {
  projects: { key: string; value: ProjectMeta; indexes: { byUpdated: number } };
  files: { key: [string, string]; value: ProjectFile; indexes: { byProject: string } };
  chats: { key: string; value: ProjectChat };
  versions: { key: string; value: Version; indexes: { byProject: string } };
}

export const DB_VERSION = 2;

export const SCENE_FILE = "scene.json";

export class ProjectStore {
  private readonly db: Promise<IDBPDatabase<StudioDB>>;

  constructor(name = "siljangnim-studio") {
    this.db = openDB<StudioDB>(name, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore("projects", { keyPath: "id" }).createIndex("byUpdated", "updatedAt");
          db.createObjectStore("files", { keyPath: ["projectId", "path"] }).createIndex("byProject", "projectId");
          db.createObjectStore("chats", { keyPath: "projectId" });
        }
        if (oldVersion < 2) {
          db.createObjectStore("versions", { keyPath: "id" }).createIndex("byProject", "projectId");
        }
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
    const tx = db.transaction(["projects", "files", "chats", "versions"], "readwrite");
    const fileKeys = await tx.objectStore("files").index("byProject").getAllKeys(id);
    const versionKeys = await tx.objectStore("versions").index("byProject").getAllKeys(id);
    await Promise.all([
      tx.objectStore("projects").delete(id),
      tx.objectStore("chats").delete(id),
      ...fileKeys.map((key) => tx.objectStore("files").delete(key)),
      ...versionKeys.map((key) => tx.objectStore("versions").delete(key)),
      tx.done,
    ]);
  }

  async readFile(projectId: string, path: string): Promise<string | Blob | undefined> {
    return (await (await this.db).get("files", [projectId, path]))?.content;
  }

  async writeFile(projectId: string, path: string, content: string | Blob, meta?: AssetMeta): Promise<void> {
    await (await this.db).put("files", { projectId, path, content, updatedAt: Date.now(), ...(meta ? { meta } : {}) });
    await this.touch(projectId);
  }

  async deleteFile(projectId: string, path: string): Promise<void> {
    await (await this.db).delete("files", [projectId, path]);
    await this.touch(projectId);
  }

  /** Full records of the files under a folder prefix such as "assets/", sorted by path. */
  async listFileRecords(projectId: string, prefix: string): Promise<ProjectFile[]> {
    const all = await (await this.db).getAllFromIndex("files", "byProject", projectId);
    return all.filter((f) => f.path.startsWith(prefix)).sort((a, b) => (a.path < b.path ? -1 : 1));
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

  /** All versions of a project, oldest first. */
  async listVersions(projectId: string): Promise<Version[]> {
    const all = await (await this.db).getAllFromIndex("versions", "byProject", projectId);
    return all.sort((a, b) => a.createdAt - b.createdAt);
  }

  async getVersion(id: string): Promise<Version | undefined> {
    return (await this.db).get("versions", id);
  }

  async addVersion(version: Version): Promise<void> {
    await (await this.db).put("versions", version);
  }

  /** Move the project's HEAD. Doesn't count as an edit, so the project keeps its place in the list. */
  async setHead(projectId: string, versionId: string): Promise<void> {
    const db = await this.db;
    const project = await db.get("projects", projectId);
    if (project) await db.put("projects", { ...project, head: versionId });
  }

  private async touch(id: string, patch: Partial<ProjectMeta> = {}): Promise<void> {
    const db = await this.db;
    const project = await db.get("projects", id);
    if (project) await db.put("projects", { ...project, ...patch, updatedAt: Date.now() });
  }
}
