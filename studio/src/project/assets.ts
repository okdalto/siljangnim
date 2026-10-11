// Project assets: kinds, names and light metadata (docs/m2.md#2-에셋-업로드).
// The parsers here are pure; analyzeAsset adds what needs the browser.

export const ASSET_DIR = "assets/";
export const MAX_ASSET_BYTES = 200 * 1024 * 1024;
/** Longest side of images attached to a prompt for vision. */
export const VISION_MAX_SIZE = 1024;

export type AssetKind = "image" | "svg" | "video" | "audio" | "font" | "model" | "text" | "other";

export type AssetMeta = Record<string, string | number | boolean | number[]>;

export interface AssetInfo {
  name: string;
  kind: AssetKind;
  size: number;
  type: string;
  meta: AssetMeta;
}

const EXTENSIONS: Record<string, AssetKind> = {
  png: "image", jpg: "image", jpeg: "image", webp: "image", gif: "image", avif: "image", bmp: "image",
  svg: "svg",
  mp4: "video", webm: "video", mov: "video", m4v: "video",
  mp3: "audio", wav: "audio", ogg: "audio", m4a: "audio", flac: "audio", aac: "audio",
  ttf: "font", otf: "font", woff: "font", woff2: "font",
  glb: "model", gltf: "model", obj: "model",
  json: "text", txt: "text", csv: "text", tsv: "text", md: "text", glsl: "text", frag: "text", vert: "text", wgsl: "text", js: "text", xml: "text",
};

const MIME_TYPES: Record<string, string> = {
  svg: "image/svg+xml", glb: "model/gltf-binary", gltf: "model/gltf+json", obj: "model/obj",
  json: "application/json", txt: "text/plain", csv: "text/csv", md: "text/markdown",
  ttf: "font/ttf", otf: "font/otf", woff: "font/woff", woff2: "font/woff2",
};

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function assetKind(name: string, mime = ""): AssetKind {
  const byExt = EXTENSIONS[extensionOf(name)];
  if (byExt) return byExt;
  if (mime === "image/svg+xml") return "svg";
  for (const kind of ["image", "video", "audio", "font", "text"] as const) if (mime.startsWith(`${kind}/`)) return kind;
  return "other";
}

/** A MIME type for the stored Blob, so the runtime and <img> handle it (browsers leave some empty). */
export function assetMimeType(name: string, given: string): string {
  return given || MIME_TYPES[extensionOf(name)] || "application/octet-stream";
}

/** A file name safe to use as an asset key: no folders, quotes or control characters. */
export function sanitizeAssetName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  // eslint-disable-next-line no-control-regex
  const clean = base.replace(/[\u0000-\u001f"'`<>|?*:]+/g, "").replace(/\s+/g, "-").replace(/^\.+/, "");
  return clean || "asset";
}

/** `name.png`, then `name-2.png`, `name-3.png`… until it is free. */
export function uniqueAssetName(name: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(name)) return name;
  const ext = extensionOf(name);
  const stem = ext ? name.slice(0, -(ext.length + 1)) : name;
  for (let i = 2; ; i++) {
    const candidate = ext ? `${stem}-${i}.${ext}` : `${stem}-${i}`;
    if (!used.has(candidate)) return candidate;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** One line per asset for the agent and the UI, e.g. `image 1920x1080`. */
export function describeMeta(kind: AssetKind, meta: AssetMeta): string {
  const parts: string[] = [];
  if (typeof meta.width === "number" && typeof meta.height === "number") parts.push(`${meta.width}x${meta.height}`);
  if (typeof meta.duration === "number") parts.push(`${meta.duration.toFixed(2)}s`);
  if (typeof meta.vertices === "number") parts.push(`${meta.vertices} vertices`);
  if (typeof meta.faces === "number") parts.push(`${meta.faces} faces`);
  if (typeof meta.meshes === "number") parts.push(`${meta.meshes} meshes`);
  if (typeof meta.animations === "number" && meta.animations) parts.push(`${meta.animations} animations`);
  if (typeof meta.lines === "number") parts.push(`${meta.lines} lines`);
  if (typeof meta.json === "string") parts.push(`JSON ${meta.json}`);
  if (typeof meta.error === "string") parts.push(`(could not analyze: ${meta.error})`);
  return [kind, ...parts].join(" ");
}

// --- pure parsers ---

interface GltfJson {
  meshes?: Array<{ primitives?: Array<{ attributes?: Record<string, number>; indices?: number; mode?: number }> }>;
  accessors?: Array<{ count?: number; min?: number[]; max?: number[] }>;
  materials?: unknown[];
  textures?: unknown[];
  animations?: unknown[];
  skins?: unknown[];
}

export function gltfStats(gltf: GltfJson): AssetMeta {
  let vertices = 0;
  let faces = 0;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const mesh of gltf.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      const position = prim.attributes?.POSITION;
      const acc = position !== undefined ? gltf.accessors?.[position] : undefined;
      if (acc?.count) {
        vertices += acc.count;
        for (let i = 0; i < 3; i++) {
          if (acc.min?.[i] !== undefined) min[i] = Math.min(min[i]!, acc.min[i]!);
          if (acc.max?.[i] !== undefined) max[i] = Math.max(max[i]!, acc.max[i]!);
        }
      }
      const indexCount = prim.indices !== undefined ? gltf.accessors?.[prim.indices]?.count : acc?.count;
      // Triangles (mode 4, the default) only.
      if (indexCount && (prim.mode ?? 4) === 4) faces += Math.floor(indexCount / 3);
    }
  }
  const meta: AssetMeta = {
    vertices,
    faces,
    meshes: gltf.meshes?.length ?? 0,
    materials: gltf.materials?.length ?? 0,
    textures: gltf.textures?.length ?? 0,
    animations: gltf.animations?.length ?? 0,
    skinned: Boolean(gltf.skins?.length),
  };
  if (Number.isFinite(min[0])) {
    const round = (v: number) => Math.round(v * 1000) / 1000;
    meta.boundsMin = min.map(round);
    meta.boundsMax = max.map(round);
  }
  return meta;
}

const GLB_MAGIC = 0x46546c67; // "glTF"
const GLB_JSON_CHUNK = 0x4e4f534a; // "JSON"

export function glbStats(buffer: ArrayBuffer): AssetMeta {
  const view = new DataView(buffer);
  if (buffer.byteLength < 20 || view.getUint32(0, true) !== GLB_MAGIC) throw new Error("not a GLB file");
  const length = view.getUint32(12, true);
  if (view.getUint32(16, true) !== GLB_JSON_CHUNK) throw new Error("GLB has no JSON chunk");
  const json = new TextDecoder().decode(new Uint8Array(buffer, 20, Math.min(length, buffer.byteLength - 20)));
  return gltfStats(JSON.parse(json) as GltfJson);
}

export function objStats(text: string): AssetMeta {
  let vertices = 0;
  let faces = 0;
  let normals = 0;
  let uvs = 0;
  for (const line of text.split("\n")) {
    const t = line.trimStart();
    if (t.startsWith("v ")) vertices++;
    else if (t.startsWith("f ")) faces++;
    else if (t.startsWith("vn ")) normals++;
    else if (t.startsWith("vt ")) uvs++;
  }
  return { vertices, faces, normals: normals > 0, uvs: uvs > 0 };
}

/** Size of an SVG from width/height attributes or the viewBox (numbers only). */
export function svgStats(text: string): AssetMeta {
  const tag = text.match(/<svg\b[^>]*>/i)?.[0] ?? "";
  const attr = (name: string) => tag.match(new RegExp(`\\s${name}\\s*=\\s*["']\\s*([\\d.]+)`, "i"))?.[1];
  let width = Number(attr("width"));
  let height = Number(attr("height"));
  const viewBox = tag.match(/viewBox\s*=\s*["']([^"']+)["']/i)?.[1]?.trim().split(/[\s,]+/).map(Number);
  if ((!width || !height) && viewBox?.length === 4) {
    width = viewBox[2]!;
    height = viewBox[3]!;
  }
  return width && height ? { width: Math.round(width), height: Math.round(height) } : {};
}

export function textStats(name: string, text: string): AssetMeta {
  const meta: AssetMeta = { lines: text ? text.split("\n").length : 0 };
  if (extensionOf(name) === "json" || extensionOf(name) === "gltf") {
    try {
      const value: unknown = JSON.parse(text);
      meta.json = Array.isArray(value) ? `array of ${value.length}` : value === null ? "null" : typeof value === "object" ? `object with ${Object.keys(value).length} keys` : typeof value;
    } catch (err) {
      meta.json = `invalid (${err instanceof Error ? err.message : String(err)})`;
    }
  }
  return meta;
}

// --- browser analysis ---

/** Light metadata for an uploaded file. Never throws: failures land in meta.error. */
export async function analyzeAsset(name: string, blob: Blob): Promise<AssetMeta> {
  const kind = assetKind(name, blob.type);
  try {
    switch (kind) {
      case "image": {
        const bitmap = await createImageBitmap(blob);
        const meta = { width: bitmap.width, height: bitmap.height };
        bitmap.close();
        return meta;
      }
      case "svg":
        return svgStats(await blob.text());
      case "video":
        return await mediaStats(blob, "video");
      case "audio":
        return await mediaStats(blob, "audio");
      case "model": {
        const ext = extensionOf(name);
        if (ext === "glb") return glbStats(await blob.arrayBuffer());
        if (ext === "gltf") return gltfStats(JSON.parse(await blob.text()) as GltfJson);
        return objStats(await blob.text());
      }
      case "text":
        return textStats(name, await blob.text());
      default:
        return {};
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

function mediaStats(blob: Blob, tag: "video" | "audio"): Promise<AssetMeta> {
  return new Promise((resolve, reject) => {
    const el = document.createElement(tag);
    const url = URL.createObjectURL(blob);
    const done = (result: AssetMeta | Error) => {
      URL.revokeObjectURL(url);
      el.removeAttribute("src");
      if (result instanceof Error) reject(result);
      else resolve(result);
    };
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      const meta: AssetMeta = { duration: Number.isFinite(el.duration) ? el.duration : 0 };
      if (el instanceof HTMLVideoElement) {
        meta.width = el.videoWidth;
        meta.height = el.videoHeight;
      }
      done(meta);
    };
    el.onerror = () => done(new Error(`this ${tag} format can't be decoded here`));
    el.src = url;
  });
}

/** A downscaled copy of an image for a vision block: PNG when it may have alpha, else JPEG. */
export async function visionImage(blob: Blob): Promise<{ mediaType: "image/png" | "image/jpeg"; data: string; width: number; height: number }> {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, VISION_MAX_SIZE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas unavailable");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const mediaType = blob.type === "image/jpeg" ? "image/jpeg" : "image/png";
  const out = await canvas.convertToBlob({ type: mediaType, quality: 0.9 });
  return { mediaType, data: await blobToBase64(out), width, height };
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}
