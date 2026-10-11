// App controller: projects, the scene host, and agent runs. UI components
// read state from useApp and call these functions.
import { studioNote } from "../agent/context";
import { HISTORY_TOOLS } from "../agent/historyTools";
import { repairConversation, runAgent } from "../agent/loop";
import type { ContentBlockParam, MessageParam } from "../agent/llm/types";
import { SYSTEM_PROMPT } from "../agent/prompt";
import { SCENE_TOOLS } from "../agent/sceneTools";
import type { AssetController, HistoryController, SceneController, VersionInfo } from "../agent/tools";
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
import { resolveVersionId, sameScene, versionMessage } from "../project/history";
import { ProjectStore, SCENE_FILE, type Version } from "../project/store";
import type { SceneHost } from "../scene/host";
import type { LoadResult } from "../scene/protocol";
import { DEFAULT_SCENE, parseScene, type Scene, type UniformValue } from "../scene/schema";
import { keys } from "./platform";
import { createProvider, looksLikeApiKey, saveSettings, type Settings } from "./settings";
import { useApp, type AppState } from "./state";

const ACTIVE_PROJECT_KEY = "siljangnim.activeProject";
const SAVE_DELAY_MS = 400;
/** Controls idle this long become a version. */
const CONTROL_VERSION_DELAY_MS = 1500;
const THUMBNAIL_SIZE = 256;
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
const controlChanges = new Set<string>();
/** Blobs of the open project's assets, by name; sent to the runtime with every load. */
let assetBlobs = new Map<string, Blob>();
/** Context for the next prompt, by project (e.g. "the person restored version X"). */
const pendingNotes = new Map<string, string>();

const get = useApp.getState;
const set = useApp.setState;

// --- boot & projects ---

export async function boot(): Promise<void> {
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
  set({ project, scene, messages, versions, assets, attachments: [], live: null, notice: null, projects: await store.listProjects() });
  if (host) void loadIntoHost(scene);
}

export async function createProject(name = "Untitled"): Promise<void> {
  const project = await store.createProject(name);
  await store.writeFile(project.id, SCENE_FILE, JSON.stringify(DEFAULT_SCENE, null, 2));
  set({ projects: await store.listProjects() });
  await openProject(project.id);
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
  void loadIntoHost(get().scene);
  return () => {
    offStats();
    offError();
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
  if (project) void commitVersion(project.id, "Initial scene", { rootOnly: true });
  return result;
}

export async function applyScene(scene: Scene): Promise<LoadResult> {
  set({ scene });
  scheduleSave();
  return loadIntoHost(scene);
}

export function setUniformValue(name: string, value: UniformValue): void {
  const scene = get().scene;
  const def = scene.uniforms[name];
  if (!def) return;
  set({ scene: { ...scene, uniforms: { ...scene.uniforms, [name]: { ...def, value } } } });
  host?.setUniform(name, value);
  scheduleSave();
  controlChanges.add(def.label ?? name);
  clearTimeout(controlTimer);
  controlTimer = setTimeout(() => void flushControlVersion(), CONTROL_VERSION_DELAY_MS);
}

export function transport(action: "play" | "pause"): void {
  if (host) void host.request("transport", { action }).catch(() => undefined);
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
function commitVersion(projectId: string, message: string, options: { rootOnly?: boolean } = {}): Promise<Version | null> {
  return chained(async () => {
    const { project, scene, messages, versions } = get();
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
      thumbnail: await captureThumbnail(),
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
  if (!controlChanges.size || !project) return Promise.resolve();
  const names = [...controlChanges];
  controlChanges.clear();
  return commitVersion(project.id, versionMessage(`Adjusted ${names.join(", ")}`));
}

function discardControlVersion(): void {
  clearTimeout(controlTimer);
  controlTimer = undefined;
  controlChanges.clear();
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
    await store.writeFile(project.id, ASSET_DIR + name, blob, meta);
    if (get().project?.id !== project.id) return;
    assetBlobs.set(name, blob);
    const info = assetInfo(name, blob, meta);
    set((st) => ({
      assets: [...st.assets, info].sort((a, b) => (a.name < b.name ? -1 : 1)),
      attachments: [...st.attachments, name],
    }));
  }
  if (rejected.length) set({ notice: { kind: "error", text: `Not uploaded: ${rejected.join("; ")}.` } });
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
  const sceneHost = host;
  const controller: SceneController = {
    get: () => get().scene,
    // A run winding down after a project switch must not touch the new project.
    apply: (scene) => (get().project?.id === projectId ? applyScene(scene) : Promise.resolve({ ok: false, errors: [] })),
    capture: (maxSize) => sceneHost.request("capture", { maxSize }),
    status: () => sceneHost.request("status", {}),
  };
  const history: HistoryController = {
    list: async () => {
      const { project: current, versions } = get();
      return current?.id === projectId ? versions.map((v) => versionInfo(v, current.head)) : [];
    },
    restore: async (id) => {
      const { version, load } = await restore(projectId, id);
      return { version: versionInfo(version, version.id), load };
    },
  };

  const assetsEnv: AssetController = {
    list: async () => (get().project?.id === projectId ? get().assets : []),
    read: async (name) => (get().project?.id === projectId ? assetBlobs.get(name) : undefined),
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
      tools: [...SCENE_TOOLS, ...HISTORY_TOOLS, ...ASSET_TOOLS],
      env: { scene: controller, history, assets: assetsEnv },
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
