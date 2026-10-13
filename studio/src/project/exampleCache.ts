import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export interface ExampleFile {
  path: string;
  url: string;
  bytes: number;
  sha256: string;
  mime?: string;
}
export interface DownloadOptions {
  signal?: AbortSignal;
  onProgress?: (loaded: number, total: number) => void;
}
interface CacheDB extends DBSchema {
  files: { key: string; value: { key: string; slug: string; blob: Blob }; indexes: { slug: string } };
}
const key = (slug: string, file: ExampleFile) => `${slug}/${file.path}/${file.sha256}`;

/** Independent of projects: clearing downloads never removes a person's work. */
export class ExampleCache {
  private db?: Promise<IDBPDatabase<CacheDB>>;
  constructor(private name = "siljangnim-example-cache", private request: typeof fetch = (...args) => fetch(...args)) {}
  private database() {
    return this.db ??= openDB<CacheDB>(this.name, 1, {
      upgrade(db) { db.createObjectStore("files", { keyPath: "key" }).createIndex("slug", "slug"); },
    });
  }
  async status(examples: Array<{ slug: string; files: ExampleFile[] }>) {
    const db = await this.database();
    const records = await db.getAll("files");
    const keys = new Set(records.map((r) => r.key));
    return {
      bytes: records.reduce((n, r) => n + r.blob.size, 0),
      ready: new Set(examples.filter((e) => e.files.every((f) => keys.has(key(e.slug, f)))).map((e) => e.slug)),
    };
  }
  async clear() { await (await this.database()).clear("files"); }
  async read(slug: string, files: ExampleFile[], options: DownloadOptions = {}): Promise<Map<string, Blob>> {
    const { signal, onProgress } = options;
    const total = files.reduce((n, f) => n + f.bytes, 0);
    let loaded = 0;
    const result = new Map<string, Blob>();
    const db = await this.database();
    onProgress?.(0, total);
    for (const file of files) {
      signal?.throwIfAborted();
      const cached = await db.get("files", key(slug, file));
      let blob = cached?.blob;
      if (blob && file.mime && blob.type !== file.mime) blob = new Blob([blob], { type: file.mime });
      if (!blob) {
        const response = await this.request(file.url, { signal, credentials: "omit", cache: "no-cache" });
        if (!response.ok) throw new Error(`${slug}/${file.path}: HTTP ${response.status}. Please retry the download.`);
        const reader = response.body?.getReader();
        const chunks: ArrayBuffer[] = [];
        let bytes = 0;
        if (!reader) throw new Error(`${slug}/${file.path}: empty response`);
        try {
          while (true) {
            signal?.throwIfAborted();
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.byteLength;
            if (bytes > file.bytes) throw new Error(`${slug}/${file.path}: download size mismatch`);
            chunks.push(new Uint8Array(value).buffer);
            onProgress?.(loaded + bytes, total);
          }
        } finally {
          await reader.cancel().catch(() => {});
          reader.releaseLock();
        }
        blob = new Blob(chunks, { type: file.mime ?? response.headers.get("Content-Type") ?? "application/octet-stream" });
        const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
        const sha256 = Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, "0")).join("");
        if (bytes !== file.bytes || sha256 !== file.sha256) throw new Error(`${slug}/${file.path}: download integrity check failed. Please retry.`);
        signal?.throwIfAborted();
        try { await db.put("files", { key: key(slug, file), slug, blob }); }
        catch { throw new Error("Couldn't save the example download. Clear the example cache or free storage, then retry."); }
      }
      loaded += file.bytes;
      onProgress?.(loaded, total);
      result.set(file.path, blob);
    }
    signal?.throwIfAborted();
    return result;
  }
  /** Called only after a complete, validated example loads; partial retries remain reusable. */
  async prune(slug: string, files: ExampleFile[]) {
    const db = await this.database();
    const keep = new Set(files.map((f) => key(slug, f)));
    const tx = db.transaction("files", "readwrite");
    for (const old of await tx.store.index("slug").getAllKeys(slug)) if (!keep.has(old)) await tx.store.delete(old);
    await tx.done;
  }
}
export const exampleCache = new ExampleCache();
