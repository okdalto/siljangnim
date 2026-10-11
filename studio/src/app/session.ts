// App controller: projects, the scene host, and agent runs. UI components
// read state from useApp and call these functions.
import { studioNote } from "../agent/context";
import { HISTORY_TOOLS } from "../agent/historyTools";
import { repairConversation, runAgent } from "../agent/loop";
import type { ContentBlockParam, MessageParam } from "../agent/llm/types";
import { SYSTEM_PROMPT } from "../agent/prompt";
import { SCENE_TOOLS } from "../agent/sceneTools";
import {
  runTool,
  type AssetController,
  type HistoryController,
  type RecipeController,
  type RecipeSummary,
  type RuntimeController,
  type RuntimeJob,
  type SceneController,
  type ToolEnv,
  type ToolOutput,
  type UserController,
  type VersionInfo,
} from "../agent/tools";
import { RUNTIME_TOOLS } from "../agent/runtimeTools";
import { PERMISSIONS_FILE, approvalNeeded, grant, parseGrants, programName, type ApprovalAnswer, type ApprovalRequest } from "../project/permissions";
import { hubClient, type HubClient, type HubJob, type HubRecipeSummary } from "./hubClient";
import { RECIPE_TOOLS } from "../agent/recipeTools";
import { EXTERNAL_TOOLS } from "../agent/external";
import { USER_TOOLS } from "../agent/userTools";
import { ASSET_TOOLS } from "../agent/assetTools";
import {
  ASSET_DIR,
  MAX_ASSET_BYTES,
  analyzeAsset,
  assetKind,
  assetMimeType,
  describeMeta,
  sanitizeAssetName,
  uniqueAssetName,
  visionImage,
  type AssetInfo,
} from "../project/assets";
import { EXAMPLES } from "../project/examples";
import { resolveVersionId, sameScene, versionMessage } from "../project/history";
import { ProjectStore, SCENE_FILE, type Version } from "../project/store";
import type { SceneHost } from "../scene/host";
import type { LoadResult } from "../scene/protocol";
import { evaluateTrack, keyAt, removeKeyAt, upsertKey } from "../scene/gl/keyframes";
import { DEFAULT_SCENE, KEYFRAMABLE, parseScene, type Scene, type Timeline, type UniformValue } from "../scene/schema";
import { bridgeToken, keys } from "./platform";
import { createProvider, looksLikeApiKey, saveSettings, type Settings } from "./settings";
import { useApp, type AppState } from "./state";

const ACTIVE_PROJECT_KEY = "siljangnim.activeProject";
const SAVE_DELAY_MS = 400;
/** Controls idle this long become a version. */
const CONTROL_VERSION_DELAY_MS = 1500;
const THUMBNAIL_SIZE = 256;
const MONITOR_HISTORY = 60;
const THUMBNAIL_TIMEOUT_MS = 3000;

const store = new ProjectStore();
let host: SceneHost | null = null;
let agentAbort: AbortController | null = null;
/** The run that owns `live`; outlives agentAbort while a stopped run winds down. */
let running: AbortController | null = null;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
/** Version commits and restores run one at a time, in call order. */
let versionChain: Promise<unknown> = Promise.resolve();
let controlTimer: ReturnType<typeof setTimeout> | undefined;
/** Since the last version: controls moved (by label) and timeline actions ("Added Speed key"). */
const controlChanges = new Set<string>();
const controlActions = new Set<string>();
/** Scene state for undo: what controls and the timeline can change. */
interface ControlSnapshot {
  uniforms: Scene["uniforms"];
  timeline: Scene["timeline"];
  keyframes: Scene["keyframes"];
  overrides: string[];
}
const UNDO_LIMIT = 100;
/** Changes to the same thing closer together than this are one undo step (a slider drag). */
const UNDO_COALESCE_MS = 800;
let undoStack: ControlSnapshot[] = [];
let redoStack: ControlSnapshot[] = [];
let lastUndo = { key: "", at: 0 };
let undoSerial = 0;
/** Seconds within which "add key" replaces an existing key instead of adding one. */
export const KEY_SNAP_SECONDS = 1 / 30;
const DEFAULT_TIMELINE: Timeline = { duration: 10, loop: true, preserveStateOnLoop: false };

/** Blobs of the open project's assets, by name; sent to the runtime with every load. */
let assetBlobs = new Map<string, Blob>();
/** Resolves the agent's open question (see ask_user). */
let answerPending: ((answer: string | null) => void) | null = null;
/** Context for the next prompt, by project (e.g. "the person restored version X"). */
const pendingNotes = new Map<string, string>();

const get = useApp.getState;
const set = useApp.setState;

// --- boot & projects ---

export async function boot(): Promise<void> {
  // Opened by the MCP bridge: an external agent drives this viewer.
  if (bridgeToken) void import("./bridge").then(({ connectBridge }) => connectBridge(bridgeToken!));
  set({ keyStatus: await keys.status() });
  let projects = await store.listProjects();
  if (!projects.length) {
    await createProject("Untitled");
    projects = await store.listProjects();
  }
  const remembered = safeLocal(() => localStorage.getItem(ACTIVE_PROJECT_KEY));
  const target = projects.find((p) => p.id === remembered) ?? projects[0]!;
  await openProject(target.id);
  set({ ready: true });
}

export async function openProject(id: string): Promise<void> {
  stopAgent();
  await flushControlVersion();
  await flushSave();
  const project = await store.getProject(id);
  if (!project) return;
  const raw = await store.readFile(id, SCENE_FILE);
  let scene = DEFAULT_SCENE;
  if (typeof raw === "string") {
    const parsed = parseScene(safeJson(raw));
    if (parsed.ok) scene = parsed.scene;
  }
  const messages = repairConversation(await store.readChat(id));
  const versions = await store.listVersions(id);
  const records = await store.listFileRecords(id, ASSET_DIR);
  assetBlobs = new Map(records.flatMap((r) => (r.content instanceof Blob ? [[r.path.slice(ASSET_DIR.length), r.content] as const] : [])));
  const assets = records.flatMap((r) => (r.content instanceof Blob ? [assetInfo(r.path.slice(ASSET_DIR.length), r.content, r.meta ?? {})] : []));
  safeLocal(() => localStorage.setItem(ACTIVE_PROJECT_KEY, id));
  clearUndo();
  set({ project, scene, messages, versions, assets, attachments: [], overrides: [], live: null, notice: null, projects: await store.listProjects() });
  if (host) void loadIntoHost(scene);
}

export async function createProject(name = "Untitled"): Promise<void> {
  const project = await store.createProject(name);
  await store.writeFile(project.id, SCENE_FILE, JSON.stringify(DEFAULT_SCENE, null, 2));
  set({ projects: await store.listProjects() });
  await openProject(project.id);
}

/** A new project with an example's scene and assets (see /examples). */
export async function openExample(slug: string): Promise<void> {
  const example = EXAMPLES.find((e) => e.slug === slug);
  if (!example) return;
  set({ examplesOpen: false });
  try {
    const scene = await example.scene();
    const project = await store.createProject(example.title);
    await store.writeFile(project.id, SCENE_FILE, JSON.stringify(scene, null, 2));
    // Assets go in before the project opens, so the first load already has them.
    for (const asset of example.assets) {
      const blob = await (await fetch(asset.url)).blob();
      const typed = new Blob([blob], { type: assetMimeType(asset.name, blob.type) });
      await store.writeFile(project.id, ASSET_DIR + asset.name, typed, await analyzeAsset(asset.name, typed));
    }
    await openProject(project.id);
  } catch (err) {
    set({ notice: { kind: "error", text: `Couldn't open the example: ${err instanceof Error ? err.message : String(err)}` } });
  }
}

export function setExamplesOpen(open: boolean): void {
  set({ examplesOpen: open });
}

export async function renameProject(name: string): Promise<void> {
  const project = get().project;
  if (!project || !name.trim()) return;
  await store.renameProject(project.id, name.trim());
  set({ project: { ...project, name: name.trim() }, projects: await store.listProjects() });
}

export async function deleteProject(id: string): Promise<void> {
  if (get().project?.id === id) {
    stopAgent();
    discardControlVersion();
  }
  pendingNotes.delete(id);
  await store.deleteProject(id);
  const projects = await store.listProjects();
  set({ projects });
  if (get().project?.id === id) {
    if (projects[0]) await openProject(projects[0].id);
    else await createProject("Untitled");
  }
}

// --- scene ---

export function attachSceneHost(next: SceneHost): () => void {
  host = next;
  const offStats = next.on("stats", (s) => set((st) => ({ runtime: { ...st.runtime, state: s.state, fps: s.fps, time: s.time } })));
  const offError = next.on("error", (e) => set((st) => ({ runtime: { ...st.runtime, errors: [...st.runtime.errors, e].slice(-20) } })));
  const offMonitors = next.on("monitors", (values) =>
    set((st) => ({
      monitors: Object.fromEntries(
        Object.entries(values).map(([name, value]) => {
          const history = st.monitors[name]?.history ?? [];
          return [name, { value, history: typeof value === "number" ? [...history, value].slice(-MONITOR_HISTORY) : [] }];
        }),
      ),
    })),
  );
  void loadIntoHost(get().scene);
  return () => {
    offStats();
    offError();
    offMonitors();
    if (host === next) host = null;
  };
}

async function loadIntoHost(scene: Scene): Promise<LoadResult> {
  if (!host) return { ok: false, errors: [] };
  set((st) => ({ runtime: { ...st.runtime, state: "loading", errors: [] } }));
  const result = await host.load(scene, Object.fromEntries(assetBlobs));
  set((st) => ({ runtime: { ...st.runtime, errors: result.errors } }));
  // Projects start their history with whatever scene they first show.
  const project = get().project;
  if (project) void commitVersion(project.id, "Initial scene", { rootOnly: true, scene });
  return result;
}

/** Replace the whole scene and reload it (agent edits, restores). Undo doesn't reach across these. */
export async function applyScene(scene: Scene): Promise<LoadResult> {
  clearUndo();
  set({ scene, overrides: [] });
  scheduleSave();
  return loadIntoHost(scene);
}

export function setUniformValue(name: string, value: UniformValue): void {
  const scene = get().scene;
  const def = scene.uniforms[name];
  if (!def) return;
  recordUndo(`uniform:${name}`);
  const keyed = Boolean(scene.keyframes[name]);
  set((st) => ({
    scene: { ...scene, uniforms: { ...scene.uniforms, [name]: { ...def, value } } },
    overrides: keyed && !st.overrides.includes(name) ? [...st.overrides, name] : st.overrides,
  }));
  host?.setUniform(name, value);
  scheduleSave();
  noteControlChange(def.label ?? name, "adjusted");
}

/** Press a button widget: the uniform reads true for one frame. Not an edit, so no undo or version. */
export function pulseUniform(name: string): void {
  host?.setUniform(name, true);
}

export function transport(action: "play" | "pause"): void {
  if (host) void host.request("transport", { action }).catch(() => undefined);
}

export function seek(time: number): void {
  const timeline = get().scene.timeline;
  const t = Math.max(0, timeline ? Math.min(time, timeline.duration) : time);
  // Show the new time right away; the runtime's stats catch up within a frame or two.
  set((st) => ({ runtime: { ...st.runtime, time: t } }));
  if (host) void host.request("transport", { action: "seek", time: t }).catch(() => undefined);
}

/** Create, change or (with null) remove the timeline. Removing it drops the keyframes too. */
export function updateTimeline(patch: Partial<Timeline> | null): void {
  const scene = get().scene;
  if (patch === null) {
    changeTimeline("Removed timeline", undefined, {});
    return;
  }
  const timeline = { ...DEFAULT_TIMELINE, ...scene.timeline, ...patch };
  // Keys past a shortened end would be invalid; keep them inside.
  const keyframes = Object.fromEntries(
    Object.entries(scene.keyframes).map(([name, keys]) => [name, keys.map((k) => ({ ...k, time: Math.min(k.time, timeline.duration) }))]),
  );
  changeTimeline(scene.timeline ? "Edited timeline" : "Added timeline", timeline, keyframes);
}

/** Add a key for a uniform at the playhead with its current value, or remove the key that is there. */
export async function toggleKey(name: string): Promise<void> {
  const { scene } = get();
  const def = scene.uniforms[name];
  if (!def || !KEYFRAMABLE.includes(def.type)) return;
  // The playhead from the runtime itself: stats arrive only a few times a second.
  const time = host ? (await host.request("status", {}).catch(() => null))?.time ?? get().runtime.time : get().runtime.time;
  const current = get().scene;
  const timeline = current.timeline ?? DEFAULT_TIMELINE;
  const t = Math.round(Math.min(time, timeline.duration) * 100) / 100;
  const keys = current.keyframes[name] ?? [];
  const label = def.label ?? name;
  const existing = keyAt(keys, t, KEY_SNAP_SECONDS);
  let next: Scene["keyframes"];
  if (existing) {
    const rest = removeKeyAt(keys, existing.time);
    next = { ...current.keyframes };
    if (rest.length) next[name] = rest;
    else delete next[name];
  } else {
    const value = displayedValue(name);
    next = { ...current.keyframes, [name]: upsertKey(keys, { time: t, value }) };
  }
  changeTimeline(`${existing ? "Removed" : "Added"} ${label} key`, timeline, next);
}

/** What a uniform shows right now: its keyframe value at the playhead, unless the person overrode it. */
export function displayedValue(name: string): number {
  const { scene, runtime, overrides } = get();
  const def = scene.uniforms[name];
  const base = typeof def?.value === "number" ? def.value : 0;
  const keys = scene.keyframes[name];
  if (!keys || overrides.includes(name)) return base;
  return evaluateTrack(keys, runtime.time) ?? base;
}

function changeTimeline(label: string, timeline: Timeline | undefined, keyframes: Scene["keyframes"]): void {
  const scene = get().scene;
  const parsed = parseScene({ ...scene, timeline, keyframes });
  if (!parsed.ok) {
    set({ notice: { kind: "error", text: parsed.errors.join("; ") } });
    return;
  }
  recordUndo(`timeline:${undoSerial++}`);
  set({ scene: parsed.scene, overrides: [] });
  sendTimeline(parsed.scene);
  scheduleSave();
  noteControlChange(label, "action");
}

function sendTimeline(scene: Scene): void {
  if (host) void host.request("setTimeline", { timeline: scene.timeline, keyframes: scene.keyframes }).catch(() => undefined);
}

function noteControlChange(label: string, kind: "adjusted" | "action"): void {
  (kind === "adjusted" ? controlChanges : controlActions).add(label);
  clearTimeout(controlTimer);
  controlTimer = setTimeout(() => void flushControlVersion(), CONTROL_VERSION_DELAY_MS);
}

// --- undo (controls and timeline only, this session) ---

function snapshot(): ControlSnapshot {
  const { scene, overrides } = get();
  return { uniforms: scene.uniforms, timeline: scene.timeline, keyframes: scene.keyframes, overrides };
}

/** Save the state before a change. Repeated changes to the same thing in quick succession are one step. */
function recordUndo(key: string): void {
  const now = Date.now();
  const coalesce = key === lastUndo.key && now - lastUndo.at < UNDO_COALESCE_MS;
  lastUndo = { key, at: now };
  if (coalesce) return;
  undoStack = [...undoStack, snapshot()].slice(-UNDO_LIMIT);
  redoStack = [];
  set({ canUndo: true, canRedo: false });
}

function clearUndo(): void {
  undoStack = [];
  redoStack = [];
  lastUndo = { key: "", at: 0 };
  set({ canUndo: false, canRedo: false });
}

export function undo(): void {
  const previous = undoStack.at(-1);
  if (!previous || get().live) return;
  undoStack = undoStack.slice(0, -1);
  redoStack = [...redoStack, snapshot()];
  restoreSnapshot(previous, "Undo");
}

export function redo(): void {
  const next = redoStack.at(-1);
  if (!next || get().live) return;
  redoStack = redoStack.slice(0, -1);
  undoStack = [...undoStack, snapshot()];
  restoreSnapshot(next, "Redo");
}

function restoreSnapshot(snap: ControlSnapshot, label: string): void {
  const scene = get().scene;
  const next: Scene = { ...scene, uniforms: snap.uniforms, timeline: snap.timeline, keyframes: snap.keyframes };
  // The next change, even to the same control, starts a new step.
  lastUndo = { key: "", at: 0 };
  set({ scene: next, overrides: snap.overrides, canUndo: undoStack.length > 0, canRedo: redoStack.length > 0 });
  if (host) {
    for (const [name, def] of Object.entries(snap.uniforms)) {
      if (scene.uniforms[name]?.value !== def.value) host.setUniform(name, def.value);
    }
    // Clears the runtime's overrides; re-apply the ones the snapshot had.
    sendTimeline(next);
    for (const name of snap.overrides) {
      const def = snap.uniforms[name];
      if (def) host.setUniform(name, def.value);
    }
  }
  scheduleSave();
  noteControlChange(label, "action");
}

function scheduleSave(): void {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void flushSave(), SAVE_DELAY_MS);
}

async function flushSave(): Promise<void> {
  clearTimeout(saveTimer);
  saveTimer = undefined;
  const { project, scene } = get();
  if (project) await store.writeFile(project.id, SCENE_FILE, JSON.stringify(scene, null, 2));
}

// --- history ---

/**
 * Save the current scene as a child of HEAD and move HEAD to it. Skipped when
 * the scene equals HEAD's (or, with rootOnly, when any version exists).
 */
function commitVersion(projectId: string, message: string, options: { rootOnly?: boolean; scene?: Scene } = {}): Promise<Version | null> {
  return chained(async () => {
    const { project, messages, versions } = get();
    // The root records the scene that was loaded, even if an edit already replaced it.
    const scene = options.scene ?? get().scene;
    if (project?.id !== projectId) return null;
    if (options.rootOnly && versions.length) return null;
    const head = versions.find((v) => v.id === project.head) ?? null;
    if (head && sameScene(head.scene, scene)) return null;
    const version: Version = {
      id: crypto.randomUUID(),
      projectId,
      parentId: head?.id ?? null,
      createdAt: Date.now(),
      message,
      scene,
      // The viewport only shows this scene if nothing replaced it meanwhile.
      thumbnail: sameScene(get().scene, scene) ? await captureThumbnail() : undefined,
      chatLength: messages.length,
    };
    await store.addVersion(version);
    await store.setHead(projectId, version.id);
    if (get().project?.id === projectId) {
      set((st) => ({ versions: [...st.versions, version], project: st.project && { ...st.project, head: version.id } }));
    }
    return version;
  });
}

/** Load a version's scene and move HEAD to it. Later changes branch from there. */
function restore(projectId: string, idOrPrefix: string): Promise<{ version: Version; load: LoadResult }> {
  return chained(async () => {
    const { project, versions } = get();
    if (project?.id !== projectId) throw new Error("The project was switched; nothing was restored.");
    const version = resolveVersionId(versions, idOrPrefix);
    await store.setHead(projectId, version.id);
    set((st) => ({ project: st.project && { ...st.project, head: version.id } }));
    return { version, load: await applyScene(version.scene) };
  });
}

/** Restore from the history panel. The agent hears about it with the next prompt. */
export async function restoreVersion(id: string): Promise<void> {
  const project = get().project;
  if (!project || get().live) return;
  await flushControlVersion();
  try {
    const { version } = await restore(project.id, id);
    pendingNotes.set(
      project.id,
      `The person restored version ${version.id.slice(0, 8)} ("${version.message}") from the history panel. The current scene is that version; earlier messages may describe a different scene.`,
    );
  } catch (err) {
    set({ notice: { kind: "error", text: err instanceof Error ? err.message : String(err) } });
  }
}

export function setSidebarTab(tab: AppState["sidebarTab"]): void {
  set({ sidebarTab: tab });
}

function flushControlVersion(): Promise<unknown> {
  clearTimeout(controlTimer);
  controlTimer = undefined;
  const project = get().project;
  if ((!controlChanges.size && !controlActions.size) || !project) return Promise.resolve();
  const parts = [...(controlChanges.size ? [`Adjusted ${[...controlChanges].join(", ")}`] : []), ...mergeActions([...controlActions])];
  controlChanges.clear();
  controlActions.clear();
  return commitVersion(project.id, versionMessage(parts.join("; ")));
}

/** "Claude Code: scene write", "Claude Code: scene edit" → "Claude Code: scene write, scene edit". */
export function mergeActions(actions: string[]): string[] {
  const out: string[] = [];
  const byPrefix = new Map<string, string[]>();
  for (const action of actions) {
    const colon = action.indexOf(": ");
    if (colon < 0) {
      out.push(action);
      continue;
    }
    const prefix = action.slice(0, colon);
    const rest = byPrefix.get(prefix);
    if (rest) rest.push(action.slice(colon + 2));
    else {
      byPrefix.set(prefix, [action.slice(colon + 2)]);
      out.push(prefix);
    }
  }
  return out.map((item) => (byPrefix.has(item) ? `${item}: ${byPrefix.get(item)!.join(", ")}` : item));
}

function discardControlVersion(): void {
  clearTimeout(controlTimer);
  controlTimer = undefined;
  controlChanges.clear();
  controlActions.clear();
}

function chained<T>(task: () => Promise<T>): Promise<T> {
  const next = versionChain.then(task, task);
  versionChain = next.catch(() => undefined);
  return next;
}

async function captureThumbnail(): Promise<Blob | undefined> {
  if (!host) return undefined;
  try {
    return (await host.request("capture", { maxSize: THUMBNAIL_SIZE }, THUMBNAIL_TIMEOUT_MS)).png;
  } catch {
    return undefined; // a version without a thumbnail is still useful
  }
}

// --- assets ---

/** Save dropped or picked files as project assets and attach them to the next prompt. */
export async function uploadAssets(files: File[]): Promise<void> {
  const project = get().project;
  if (!project || !files.length) return;
  const { rejected } = await addAssetFiles(project.id, files, { attach: true });
  if (rejected.length) set({ notice: { kind: "error", text: `Not uploaded: ${rejected.join("; ")}.` } });
}

/** Store files as project assets (renaming duplicates). Returns the names they got. */
async function addAssetFiles(projectId: string, files: File[], options: { attach: boolean }): Promise<{ names: string[]; rejected: string[] }> {
  const names: string[] = [];
  const rejected: string[] = [];
  for (const file of files) {
    if (file.size > MAX_ASSET_BYTES) {
      rejected.push(`${file.name} is over the 200 MB limit`);
      continue;
    }
    if (!file.size) {
      rejected.push(`${file.name} is empty`);
      continue;
    }
    const name = uniqueAssetName(sanitizeAssetName(file.name), assetBlobs.keys());
    const blob = new Blob([file], { type: assetMimeType(name, file.type) });
    const meta = await analyzeAsset(name, blob);
    await store.writeFile(projectId, ASSET_DIR + name, blob, meta);
    if (get().project?.id !== projectId) break;
    assetBlobs.set(name, blob);
    names.push(name);
    const info = assetInfo(name, blob, meta);
    set((st) => ({
      assets: [...st.assets.filter((a) => a.name !== name), info].sort((a, b) => (a.name < b.name ? -1 : 1)),
      attachments: options.attach ? [...st.attachments, name] : st.attachments,
    }));
  }
  return { names, rejected };
}

export async function deleteAsset(name: string): Promise<void> {
  const project = get().project;
  if (!project) return;
  await store.deleteFile(project.id, ASSET_DIR + name);
  if (get().project?.id !== project.id) return;
  assetBlobs.delete(name);
  set((st) => ({ assets: st.assets.filter((a) => a.name !== name), attachments: st.attachments.filter((n) => n !== name) }));
}

export function assetBlob(name: string): Blob | undefined {
  return assetBlobs.get(name);
}

/** Stop mentioning an asset in the next prompt (it stays in the project). */
export function detachAsset(name: string): void {
  set((st) => ({ attachments: st.attachments.filter((n) => n !== name) }));
}

/** A note naming the attached assets, plus downscaled images so the model can see them. */
async function attachmentBlocks(names: string[]): Promise<ContentBlockParam[]> {
  const infos = names.flatMap((n) => get().assets.filter((a) => a.name === n));
  if (!infos.length) return [];
  const list = infos.map((a) => `${a.name} (${describeMeta(a.kind, a.meta)})`).join(", ");
  const blocks: ContentBlockParam[] = [studioNote(`The person uploaded ${list}. Scenes reach them through ctx.assets[name].`)];
  for (const info of infos) {
    const blob = assetBlobs.get(info.name);
    if (info.kind !== "image" || !blob) continue;
    try {
      const image = await visionImage(blob);
      blocks.push({ type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } });
    } catch {
      // The model still gets the name and metadata.
    }
  }
  return blocks;
}

// --- agent ---

/** What tools act on, bound to one project: a run that outlives a project switch can't touch the new one. */
function projectEnv(
  projectId: string,
  sceneHost: SceneHost,
): { scene: SceneController; history: HistoryController; assets: AssetController; runtime: RuntimeController; recipes: RecipeController } {
  return {
    runtime: runtimeController(projectId),
    recipes: recipeController,
    scene: {
      get: () => get().scene,
      apply: (scene) => (get().project?.id === projectId ? applyScene(scene) : Promise.resolve({ ok: false, errors: [] })),
      capture: (maxSize) => sceneHost.request("capture", { maxSize }),
      status: () => sceneHost.request("status", {}),
    },
    history: {
      list: async () => {
        const { project: current, versions } = get();
        return current?.id === projectId ? versions.map((v) => versionInfo(v, current.head)) : [];
      },
      restore: async (id) => {
        const { version, load } = await restore(projectId, id);
        return { version: versionInfo(version, version.id), load };
      },
    },
    assets: {
      list: async () => (get().project?.id === projectId ? get().assets : []),
      read: async (name) => (get().project?.id === projectId ? assetBlobs.get(name) : undefined),
    },
  };
}

// --- runtime: open-source tools through the hub (docs/runtime.md) ---

const LOCK_FILE = "project.lock.json";
/** Output files already saved as assets, by job id, so a second job_status doesn't save them twice. */
const importedJobs = new Map<string, string[]>();
/** Which recipe (id@version) a job ran, for project.lock.json. */
const jobRecipes = new Map<string, string>();
let answerApproval: ((answer: ApprovalAnswer | "unanswered") => void) | null = null;

/**
 * Ask the person to allow a runtime action. Resolves "deny" when the run
 * stops, and "unanswered" after `timeoutS` so a tool call never hangs on a
 * card nobody is looking at.
 */
function requestApproval(request: ApprovalRequest, signal: AbortSignal, timeoutS: number): Promise<ApprovalAnswer | "unanswered"> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve("deny");
    const timer = setTimeout(() => done("unanswered"), timeoutS * 1000);
    const done = (answer: ApprovalAnswer | "unanswered") => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      if (answerApproval === done) answerApproval = null;
      set({ approval: null });
      resolve(answer);
    };
    const onAbort = () => done("deny");
    signal.addEventListener("abort", onAbort);
    // A newer request replaces an unanswered one (it can only come from a stopped run).
    answerApproval?.("deny");
    answerApproval = done;
    set((st) => ({ approval: request, sidebarTab: st.external ? "activity" : "chat" }));
  });
}

export function answerRuntimeApproval(answer: ApprovalAnswer): void {
  answerApproval?.(answer);
}

async function readJsonFile(projectId: string, path: string): Promise<unknown> {
  const raw = await store.readFile(projectId, path);
  return typeof raw === "string" ? safeJson(raw) : null;
}

export function runtimeController(projectId: string): RuntimeController {
  const client = async () => {
    const c = await hubClient();
    if (typeof c === "string") throw new Error(c);
    return c;
  };

  const finish = async (c: HubClient, job: HubJob): Promise<RuntimeJob> => {
    let assets = importedJobs.get(job.id) ?? [];
    const terminal = job.state === "done" || job.state === "failed" || job.state === "cancelled";
    if (terminal && !importedJobs.has(job.id)) {
      importedJobs.set(job.id, []);
      const files = await Promise.all(job.outputs.map(async (o) => new File([await c.output(job.id, o.name)], o.name)));
      assets = (await addAssetFiles(projectId, files, { attach: false })).names;
      importedJobs.set(job.id, assets);
      if (job.state === "done") await recordLock(projectId, job, jobRecipes.get(job.id));
    }
    return {
      id: job.id,
      outputs: job.outputs.map((o) => o.name),
      state: job.state === "created" ? "queued" : job.state,
      exitCode: job.exit_code,
      error: job.error,
      log: job.log,
      assets,
      resolved: job.resolved,
      seconds: job.seconds,
    };
  };

  return {
    unavailable: async () => {
      const c = await hubClient();
      return typeof c === "string" ? c : null;
    },
    info: async () => {
      const c = await client();
      const [system, runtime] = await Promise.all([c.system(), c.runtime()]);
      return {
        platform: system.platform,
        accelerators: system.accelerators,
        gpus: system.gpus.map((g) => g.name),
        environments: runtime.environments.map((e) => e.packages),
        programs: Object.fromEntries(Object.entries(runtime.programs).map(([name, path]) => [name, Boolean(path)])),
      };
    },
    run: async (request, signal) => {
      const missing = request.inputs.filter((name) => !assetBlobs.has(name));
      if (missing.length) {
        throw new Error(`No asset named ${missing.join(", ")}. Available: ${[...assetBlobs.keys()].join(", ") || "none"}.`);
      }
      const grants = parseGrants(await store.readFile(projectId, PERMISSIONS_FILE));
      // A recipe written and verified on this machine already ran with the person's OK.
      const needed = request.recipe?.trusted ? null : approvalNeeded(grants, request);
      if (needed) {
        const answer = await requestApproval(needed, signal, Math.max(10, request.waitS));
        if (answer === "unanswered") {
          throw new Error(
            `Waiting for the person to approve this in the Siljangnim window (${needed.items.join("; ")}). Nothing ran. Tell them to look at the approval card, then call the tool again.`,
          );
        }
        if (answer === "deny") throw new Error("The person did not allow this. Ask them in your reply, or find a way that runs in the browser.");
        if (answer === "project") await store.writeFile(projectId, PERMISSIONS_FILE, JSON.stringify(grant(grants, request), null, 2));
      }
      const c = await client();
      const job = await c.createJob({ kind: request.kind, packages: request.packages, code: request.code, argv: request.argv, timeout_s: request.timeoutS });
      for (const name of request.inputs) await c.putInput(job.id, name, assetBlobs.get(name)!);
      if (request.params) await c.putInput(job.id, "params.json", new Blob([JSON.stringify(request.params)], { type: "application/json" }));
      if (request.recipe) jobRecipes.set(job.id, `${request.recipe.id}@${request.recipe.version}`);
      await c.start(job.id);
      return finish(c, await c.wait(job.id, request.waitS));
    },
    job: async (id, waitS) => {
      const c = await client();
      return finish(c, await c.wait(id, waitS));
    },
  };
}

/** project.lock.json: what the project's results depend on (exact package versions, programs). */
async function recordLock(projectId: string, job: HubJob, recipe?: string): Promise<void> {
  const lock = ((await readJsonFile(projectId, LOCK_FILE)) ?? {}) as { python?: Array<{ packages: string[]; resolved: string[] }>; programs?: string[]; recipes?: string[] };
  if (recipe) lock.recipes = [...new Set([...(lock.recipes ?? []).filter((r) => !r.startsWith(`${recipe.split("@")[0]}@`)), recipe])].sort();
  if (job.kind === "command") {
    lock.programs = [...new Set([...(lock.programs ?? []), programName(job.argv[0] ?? "")])].sort();
  } else {
    const packages = job.packages;
    const others = (lock.python ?? []).filter((e) => e.packages.join() !== packages.join());
    lock.python = [...others, { packages, resolved: job.resolved }];
  }
  await store.writeFile(projectId, LOCK_FILE, JSON.stringify(lock, null, 2));
}

const recipeController: RecipeController = {
  search: async (query) => {
    const c = await requireHub();
    const { platform, recipes } = await c.recipes(query);
    return { platform, recipes: recipes.map(recipeSummary) };
  },
  read: async (id) => {
    const r = await (await requireHub()).recipe(id);
    return {
      summary: recipeSummary(r.summary),
      code: r.code,
      argv: r.argv,
      text: r.text,
      verify: { params: r.meta.verify?.params ?? {}, expectOutputs: r.meta.verify?.expect_outputs ?? [] },
    };
  },
  save: async (id, fields) => recipeSummary((await (await requireHub()).saveRecipe(id, fields)).summary),
  setStatus: async (id, status, log) => recipeSummary((await (await requireHub()).recipeStatus(id, status, log)).summary),
};

async function requireHub(): Promise<HubClient> {
  const c = await hubClient();
  if (typeof c === "string") throw new Error(c);
  return c;
}

function recipeSummary(r: HubRecipeSummary): RecipeSummary {
  return {
    id: r.id,
    version: r.version,
    title: r.title,
    capability: r.capability,
    tier: r.tier,
    kind: r.kind,
    packages: r.packages,
    program: r.program,
    io: r.io,
    license: r.license,
    origin: r.origin,
    statusHere: r.status_here,
    testedHere: r.tested_here,
  };
}

// --- external agents (MCP bridge) ---

const ACTIVITY_LIMIT = 100;
const VIEWER_READY_TIMEOUT_MS = 15_000;
let activitySerial = 0;

function whenViewerReady(): Promise<boolean> {
  const ready = () => Boolean(get().ready && get().project && host);
  if (ready()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (ready() || Date.now() - started > VIEWER_READY_TIMEOUT_MS) {
        clearInterval(timer);
        resolve(ready());
      }
    }, 100);
  });
}

/** Run a tool an external agent called through the bridge, and log it in the Activity panel. */
export async function runExternalTool(name: string, input: unknown): Promise<ToolOutput> {
  const tool = EXTERNAL_TOOLS.find((t) => t.name === name);
  if (!tool) return { isError: true, content: `Unknown tool "${name}".` };
  if (!(await whenViewerReady()) || !host) return { isError: true, content: "The viewer is still starting. Try again in a moment." };
  const project = get().project!;
  const id = ++activitySerial;
  set((st) => ({ activity: [...st.activity, { id, tool: name, input, at: Date.now(), output: null }].slice(-ACTIVITY_LIMIT) }));
  const env: ToolEnv = { ...projectEnv(project.id, host), user: { ask: async () => null }, signal: new AbortController().signal };
  const output = await runTool(tool, input, env);
  set((st) => ({ activity: st.activity.map((a) => (a.id === id ? { ...a, output } : a)) }));
  if (!tool.readOnly && !output.isError) noteControlChange(`${get().external?.client ?? "Agent"}: ${name.replace("_", " ")}`, "action");
  return output;
}

export function setExternal(external: AppState["external"]): void {
  set((st) => ({ external, sidebarTab: st.sidebarTab === "chat" ? "activity" : st.sidebarTab }));
}

export async function sendPrompt(text: string): Promise<void> {
  const prompt = text.trim();
  const { project, settings, live } = get();
  if (!prompt || !project || live) return;
  if (!host) {
    set({ notice: { kind: "error", text: "The viewport is not ready yet." } });
    return;
  }

  const status = await keys.status();
  set({ keyStatus: status });
  if (settings.provider === "anthropic" && !status.anthropic) {
    set({ settingsOpen: true, notice: { kind: "error", text: "Add an Anthropic API key to start." } });
    return;
  }
  if (settings.provider === "openai" && !status.openai) {
    set({ settingsOpen: true, notice: { kind: "error", text: "Add an OpenAI API key to start." } });
    return;
  }
  const { provider, model } = await createProvider(settings);
  if (!model) {
    set({ settingsOpen: true, notice: { kind: "error", text: "Choose a model in Settings." } });
    return;
  }
  // Control tweaks made before this prompt are their own version.
  await flushControlVersion();

  const projectId = project.id;
  const { scene: controller, history, assets: assetsEnv, runtime, recipes } = projectEnv(projectId, host);

  const user: UserController = {
    ask: (question, options, signal) =>
      new Promise((resolve) => {
        if (signal.aborted || get().project?.id !== projectId) return resolve(null);
        const done = (answer: string | null) => {
          signal.removeEventListener("abort", onAbort);
          if (answerPending === done) answerPending = null;
          set({ question: null });
          resolve(answer);
        };
        const onAbort = () => done(null);
        signal.addEventListener("abort", onAbort);
        answerPending = done;
        set({ question: { question, options }, sidebarTab: "chat" });
      }),
  };
  const note = pendingNotes.get(projectId);
  pendingNotes.delete(projectId);
  const attached = get().attachments;
  set({ attachments: [] });
  const content: ContentBlockParam[] = [
    ...(note ? [studioNote(note)] : []),
    ...(await attachmentBlocks(attached)),
    { type: "text", text: prompt },
  ];
  const messages: MessageParam[] = [...get().messages, { role: "user", content }];
  const abort = new AbortController();
  agentAbort = abort;
  running = abort;
  set({ messages, live: { text: "", thinking: "", tools: [] }, notice: null });
  await store.writeChat(projectId, messages);

  const stillCurrent = () => agentAbort === abort && get().project?.id === projectId;
  let finalMessages = messages;
  try {
    const result = await runAgent({
      provider,
      model,
      effort: settings.effort,
      system: SYSTEM_PROMPT,
      tools: [...SCENE_TOOLS, ...HISTORY_TOOLS, ...ASSET_TOOLS, ...RUNTIME_TOOLS, ...RECIPE_TOOLS, ...USER_TOOLS],
      env: { scene: controller, history, assets: assetsEnv, user, runtime, recipes },
      messages,
      signal: abort.signal,
      onEvent(event) {
        if (!stillCurrent()) return;
        const liveTurn = get().live;
        if (!liveTurn) return;
        switch (event.type) {
          case "text":
            set({ live: { ...liveTurn, text: liveTurn.text + event.delta } });
            break;
          case "thinking":
            set({ live: { ...liveTurn, thinking: liveTurn.thinking + event.delta } });
            break;
          case "tool_start":
            set({ live: { ...liveTurn, tools: [...liveTurn.tools, { id: event.id, name: event.name }] } });
            break;
          case "tool_end":
            set({ live: { ...liveTurn, tools: liveTurn.tools.filter((t) => t.id !== event.id) } });
            break;
          case "messages":
            set({ messages: event.messages, live: { ...liveTurn, text: "", thinking: "" } });
            void store.writeChat(projectId, event.messages);
            break;
          case "turn_end":
            break;
        }
      },
    });
    finalMessages = result.messages;
    if (stillCurrent()) {
      const notices: Partial<Record<typeof result.reason, string>> = {
        error: result.detail ?? "The agent stopped because of an error.",
        refusal: `The model declined this request${result.detail ? `: ${result.detail}` : "."}`,
        max_turns: "The agent reached its step limit. Send another message to continue.",
        max_tokens: result.detail ?? "The reply was cut off (output limit).",
      };
      const notice = notices[result.reason];
      set({ notice: notice ? { kind: "error", text: notice } : null });
    }
  } finally {
    // Persist the final conversation even after a stop: it ends with complete
    // tool results, so the next request stays valid.
    await store.writeChat(projectId, finalMessages);
    if (get().project?.id === projectId) {
      set({ messages: finalMessages });
      await commitVersion(projectId, versionMessage(prompt));
    }
    if (agentAbort === abort) agentAbort = null;
    if (running === abort) {
      running = null;
      set({ live: null });
    }
  }
}

/** Answer the agent's open question with an option label or free text. */
export function answerQuestion(answer: string): void {
  const text = answer.trim();
  if (text) answerPending?.(text);
}

/** Abort the current run. The UI stays busy until it has actually wound down. */
export function stopAgent(): void {
  agentAbort?.abort();
  agentAbort = null;
}

export async function clearChat(): Promise<void> {
  const project = get().project;
  if (!project || get().live) return;
  await store.writeChat(project.id, []);
  set({ messages: [], notice: null });
}

// --- settings ---

export function updateSettings(patch: Partial<Settings>): void {
  for (const value of Object.values(patch)) {
    if (typeof value === "string" && looksLikeApiKey(value)) {
      set({ notice: { kind: "error", text: "That looks like an API key. Paste it into the API key field; it was not saved here." } });
      return;
    }
  }
  const settings = { ...get().settings, ...patch };
  saveSettings(settings);
  set({ settings });
}

export async function setApiKey(provider: "anthropic" | "openai", key: string | null): Promise<void> {
  await keys.set(provider, key);
  set({ keyStatus: await keys.status() });
}

export function setSettingsOpen(open: boolean): void {
  set({ settingsOpen: open });
}

export function dismissNotice(): void {
  set({ notice: null });
}

// --- helpers ---

function assetInfo(name: string, blob: Blob, meta: AssetInfo["meta"]): AssetInfo {
  return { name, kind: assetKind(name, blob.type), size: blob.size, type: blob.type, meta };
}

function versionInfo(v: Version, head: string | undefined): VersionInfo {
  return { id: v.id, parentId: v.parentId, createdAt: v.createdAt, message: v.message, head: v.id === head };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function safeLocal<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}
