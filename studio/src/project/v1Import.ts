// Importing Siljangnim v1 project zips (M3): the scene (v1 script scenes
// migrate in parseScene), the controls from panels.json as uniform ranges,
// widgets and groups, and uploads/ as assets. Chat history, version nodes,
// HTML/URL panels and v1-only controls aren't carried over; the result lists
// what was left out.
import { parseScene, type Scene, type UniformDef } from "../scene/schema";
import { sanitizeAssetName } from "./assets";

const MANIFEST = "siljangnim-project.json";

/** Entries of a ZIP (stored or deflated), by path. */
export async function readZip(data: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const bytes = new Uint8Array(data);
  const view = new DataView(data);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip file");
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const files = new Map<string, Uint8Array>();
  const decoder = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error("broken zip directory");
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLength = view.getUint16(p + 28, true);
    const extraLength = view.getUint16(p + 30, true);
    const commentLength = view.getUint16(p + 32, true);
    const offset = view.getUint32(p + 42, true);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLength));
    p += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith("/")) continue;
    const start = offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true);
    const raw = bytes.subarray(start, start + size);
    if (method === 0) files.set(name, raw);
    else if (method === 8) files.set(name, await inflate(raw));
    else throw new Error(`${name}: unsupported zip compression (method ${method})`);
  }
  return files;
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export interface V1Import {
  name: string;
  scene: Scene;
  assets: Array<{ name: string; data: Uint8Array }>;
  /** What didn't come over, for the person (and the agent). */
  notes: string[];
}

interface V1Control {
  type?: string;
  label?: string;
  uniform?: string;
  min?: number | number[];
  max?: number | number[];
  step?: number;
  default?: unknown;
  options?: Array<{ label?: unknown; value?: unknown }>;
  children?: V1Control[];
}

export function convertV1Project(files: Map<string, Uint8Array>): V1Import {
  const decoder = new TextDecoder();
  const paths = [...files.keys()];
  const manifestPath = paths.find((p) => p === MANIFEST || p.endsWith(`/${MANIFEST}`));
  const scenePath = paths.find((p) => p === "scene.json" || p.endsWith("/scene.json"));
  if (!scenePath) throw new Error("This zip has no scene.json; is it a Siljangnim v1 project export?");
  const root = scenePath.slice(0, scenePath.length - "scene.json".length);
  const json = (path: string): unknown => {
    const data = files.get(root + path);
    if (!data) return null;
    try {
      return JSON.parse(decoder.decode(data));
    } catch {
      return null;
    }
  };
  const notes: string[] = [];
  const manifest = (manifestPath ? json(MANIFEST) : null) as { name?: string; display_name?: string } | null;
  const name = manifest?.display_name || manifest?.name || root.replace(/\/$/, "").split("/").pop() || "Imported v1 project";

  const parsed = parseScene(json("scene.json"));
  if (!parsed.ok) throw new Error(`The v1 scene couldn't be converted: ${parsed.errors.join("; ")}`);
  const scene = applyV1Controls(parsed.scene, json("panels.json"), notes);

  const assets: Array<{ name: string; data: Uint8Array }> = [];
  for (const [path, data] of files) {
    if (!path.startsWith(`${root}uploads/`)) continue;
    const original = path.slice(`${root}uploads/`.length);
    if (!original || original.includes("/")) continue;
    const clean = sanitizeAssetName(original);
    if (clean !== original) notes.push(`Upload "${original}" is now the asset "${clean}"; update references to it.`);
    assets.push({ name: clean, data });
  }
  if (files.has(`${root}chat_history.json`)) notes.push("The v1 chat history was not imported.");
  if (paths.some((p) => p.startsWith(`${root}_nodes/`))) notes.push("v1 version history was not imported; the imported scene is the first version.");
  return { name, scene, assets, notes };
}

/** v1 "controls" panels → uniform ranges, labels, widgets and groups on the v2 scene. */
export function applyV1Controls(scene: Scene, panels: unknown, notes: string[]): Scene {
  if (!panels || typeof panels !== "object") return scene;
  const uniforms = { ...scene.uniforms };
  const groups: Array<{ label: string; uniforms: string[] }> = [];
  let group: { label: string; uniforms: string[] } | null = null;
  const skipped = new Set<string>();

  const visit = (c: V1Control) => {
    if (c.type === "separator" || c.type === "group") {
      group = { label: c.label || "Controls", uniforms: [] };
      groups.push(group);
      c.children?.forEach(visit);
      return;
    }
    const def = c.uniform ? toUniform(c, uniforms[c.uniform]) : null;
    if (!c.uniform || !def) {
      if (c.type) skipped.add(c.type);
      return;
    }
    uniforms[c.uniform] = def;
    if (!group) {
      group = { label: "Controls", uniforms: [] };
      groups.push(group);
    }
    group.uniforms.push(c.uniform);
  };
  for (const panel of Object.values(panels as Record<string, { controls?: V1Control[]; html?: string; url?: string; title?: string }>)) {
    if (Array.isArray(panel?.controls)) panel.controls.forEach(visit);
    else if (panel?.html || panel?.url) notes.push(`The v1 panel "${panel.title ?? "panel"}" (HTML/URL) was not imported; ask the agent to rebuild it as a v2 panel.`);
  }
  for (const type of skipped) notes.push(`v1 "${type}" controls have no v2 equivalent yet and were left out.`);
  const parsed = parseScene({ ...scene, uniforms, controls: groups.filter((g) => g.uniforms.length).length > 1 ? groups.filter((g) => g.uniforms.length) : undefined });
  if (!parsed.ok) {
    notes.push(`Some v1 controls didn't fit the v2 format and were left out (${parsed.errors.join("; ")}).`);
    return scene;
  }
  return parsed.scene;
}

function hexColor(value: unknown): number[] | null {
  if (typeof value !== "string" || !/^#([0-9a-f]{6}|[0-9a-f]{8})$/i.test(value)) return null;
  const parts = value.slice(1).match(/../g)!.map((h) => parseInt(h, 16) / 255);
  return parts.length === 3 ? [...parts, 1] : parts;
}

function toUniform(c: V1Control, existing: UniformDef | undefined): UniformDef | null {
  const label = c.label;
  const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
  switch (c.type) {
    case "slider": {
      const min = num(c.min, 0);
      const max = num(c.max, 1);
      const isInt = existing?.type === "int";
      return { type: isInt ? "int" : "float", value: num(c.default, num(existing?.value, min)), min, max, ...(c.step ? { step: c.step } : {}), ...(label ? { label } : {}) };
    }
    case "color": {
      const rgba = hexColor(c.default) ?? (Array.isArray(existing?.value) ? (existing.value as number[]) : [1, 1, 1, 1]);
      // v1 colors were vec4 uniforms.
      return { type: "color", value: rgba.length === 3 ? [...rgba, 1] : rgba, ...(label ? { label } : {}) };
    }
    case "toggle":
      return { type: "bool", value: Boolean(c.default ?? existing?.value ?? false), widget: "toggle", ...(label ? { label } : {}) };
    case "button":
      return { type: "bool", value: false, widget: "button", ...(label ? { label } : {}) };
    case "dropdown": {
      const options = (c.options ?? []).flatMap((o) => (typeof o.value === "number" ? [{ label: String(o.label ?? o.value), value: o.value }] : []));
      if (!options.length) return null;
      return { type: "int", value: num(c.default, options[0]!.value), widget: "select", options, ...(label ? { label } : {}) };
    }
    case "pad2d": {
      const min = Array.isArray(c.min) ? num(c.min[0], 0) : num(c.min, 0);
      const max = Array.isArray(c.max) ? num(c.max[0], 1) : num(c.max, 1);
      const value = Array.isArray(c.default) && c.default.length >= 2 ? [num(c.default[0], 0), num(c.default[1], 0)] : [min, min];
      return { type: "vec2", value, min, max, widget: "pad", ...(label ? { label } : {}) };
    }
    case "vec3": {
      const value = Array.isArray(c.default) && c.default.length >= 3 ? [num(c.default[0], 0), num(c.default[1], 0), num(c.default[2], 0)] : [0, 0, 0];
      return { type: "vec3", value, ...(typeof c.min === "number" ? { min: c.min } : {}), ...(typeof c.max === "number" ? { max: c.max } : {}), ...(label ? { label } : {}) };
    }
    default:
      return null;
  }
}
