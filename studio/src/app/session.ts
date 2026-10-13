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
  type ProjectController,
  type RecipeController,
  type RecipeSummary,
  type RuntimeController,
  type RuntimeJob,
  type RuntimeRequest,
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
import { PROJECT_TOOLS } from "../agent/projectTools";
import { CATALOG_TOOLS } from "../agent/catalogTools";
import { MOVE_TOOLS } from "../agent/moveTools";
import { MOVES, moveRequest } from "../moves/moves";
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
import { exampleCache } from "../project/exampleCache";
import { EXAMPLES, exampleText, type Example } from "../project/examples";
import { mixRequest, remixRequest, type RemixPiece } from "../project/mix";
import { projectFolderName, sceneCodeFiles } from "../project/sceneFiles";
import {
  PIPELINE_FILE,
  PROJECT_MD,
  addPipelineStep,
  assetSources,
  importNote,
  parseProjectMd,
  renderProjectMd,
  type PipelineStep,
  type ProjectDocument,
  type ProjectRecipeRef,
} from "../project/projectMd";
import { storedZip } from "../scene/runtime/zip";
import { convertV1Project, readZip } from "../project/v1Import";
import { resolveVersionId, sameScene, versionMessage } from "../project/history";
import { ProjectStore, SCENE_FILE, type Version } from "../project/store";
import type { SceneHost } from "../scene/host";
import type { LoadResult, RecordOptions } from "../scene/protocol";
import type { OscMessage } from "../scene/runtime/inputData";
import { evaluateTrack, keyAt, removeKeyAt, upsertKey } from "../scene/gl/keyframes";
import { DEFAULT_SCENE, KEYFRAMABLE, parseScene, type Scene, type Timeline, type UniformValue } from "../scene/schema";
import { bridge, bridgeToken, keys } from "./platform";
import { createProvider, hasSavedSettings, isLocalEngine, looksLikeApiKey, saveSettings, type Settings } from "./settings";
import type { LocalAgentEvent, LocalEngineId } from "../desktop";
import { frameResolution, readFrame, type Frame } from "./frame";
import { resolveLanguage } from "./language";
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
  window.addEventListener("hashchange", openLinkedExample);
  // Desktop: an agent's MCP bridge can attach to this window (docs/mcp.md).
  if (bridge?.agent) {
    let attached = "";
    // The live event and the startup check can both bring the same request.
    const attach = (request: { ws: string; token: string; embedded?: boolean }) => {
      if (request.token === attached) return;
      attached = request.token;
      void import("./bridge").then(({ connectBridge }) => connectBridge(request.token, { url: request.ws, desktop: true, embedded: request.embedded }));
    };
    bridge.agent.onAttach(attach);
    void bridge.agent.pending().then((request) => request && attach(request));
  }
  set({ keyStatus: await keys.status() });
  void pickLocalEngine();
  let projects = await store.listProjects();
  if (!projects.length) {
    await createProject("Untitled");
    projects = await store.listProjects();
  }
  const remembered = safeLocal(() => localStorage.getItem(ACTIVE_PROJECT_KEY));
  const target = projects.find((p) => p.id === remembered) ?? projects[0]!;
  await openProject(target.id);
  set({ ready: true });
  // A shared link to an example opens it after the last project.
  openLinkedExample();
}

export async function openProject(id: string): Promise<void> {
  stopAgent();
  set({ exampleIntro: null });
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
  const frame = readFrame(safeJson(safeLocal(() => localStorage.getItem(FRAME_KEY + id)) ?? "null"));
  set({ frame, project, scene, messages, versions, assets, attachments: [], overrides: [], live: null, notice: null, projects: await store.listProjects() });
  if (host) {
    // Each project gets a clean scene document, so one example's libraries can't break the next.
    void host.restart();
    void loadIntoHost(scene);
  }
}

export async function createProject(name = "Untitled"): Promise<void> {
  const project = await store.createProject(name);
  await store.writeFile(project.id, SCENE_FILE, JSON.stringify(DEFAULT_SCENE, null, 2));
  set({ projects: await store.listProjects() });
  await openProject(project.id);
}

let exampleDownload: AbortController | null = null;

export function cancelExampleDownload(): void { exampleDownload?.abort(); }

export async function clearExampleDownloads(): Promise<void> {
  if (exampleDownload) return;
  try {
    await exampleCache.clear();
    set({ exampleCacheRevision: get().exampleCacheRevision + 1 });
  } catch (err) {
    set({ notice: { kind: "error", text: `Couldn't clear example downloads: ${String(err)}` } });
  }
}

async function prepareExample(example: Example, signal: AbortSignal) {
  return example.load({ signal, onProgress: (loaded, total) => {
    set({ exampleDownload: { slug: example.slug, loaded, total, preparing: false } });
  } });
}

/** Downloads finish before project creation; failed imports are rolled back. */
export async function openExample(slug: string): Promise<void> {
  const example = EXAMPLES.find((e) => e.slug === slug);
  if (!example || exampleDownload) return;
  const controller = exampleDownload = new AbortController();
  let projectId: string | undefined;
  set({ notice: null, examplesOpen: true, exampleDownload: { slug, loaded: 0, total: example.bytes, preparing: false } });
  try {
    const prepared = await prepareExample(example, controller.signal);
    controller.signal.throwIfAborted();
    set({ exampleDownload: { slug, loaded: example.bytes, total: example.bytes, preparing: true } });
    const project = await store.createProject(exampleText(example, resolveLanguage(get().settings.language) === "ko").title);
    projectId = project.id;
    await store.writeFile(project.id, SCENE_FILE, JSON.stringify(prepared.scene, null, 2));
    for (const asset of prepared.assets) {
      controller.signal.throwIfAborted();
      const typed = new Blob([asset.blob], { type: assetMimeType(asset.name, asset.blob.type) });
      await store.writeFile(project.id, ASSET_DIR + asset.name, typed, await analyzeAsset(asset.name, typed));
    }
    if (prepared.pipeline) await store.writeFile(project.id, PIPELINE_FILE, JSON.stringify(prepared.pipeline, null, 2));
    controller.signal.throwIfAborted();
    await openProject(project.id);
    projectId = undefined;
    set({ examplesOpen: false, exampleIntro: example.slug });
  } catch (err) {
    if (projectId) await store.deleteProject(projectId);
    if (!controller.signal.aborted) set({ notice: { kind: "error", text: `Couldn't open the example: ${err instanceof Error ? err.message : String(err)}` } });
  } finally {
    exampleDownload = null;
    set({ exampleDownload: null, exampleCacheRevision: get().exampleCacheRevision + 1 });
  }
}

/** A new project from a Siljangnim v1 export (.zip). The agent hears what didn't come over. */
export async function importV1Project(file: File): Promise<void> {
  try {
    const imported = convertV1Project(await readZip(await file.arrayBuffer()));
    const project = await store.createProject(imported.name);
    await store.writeFile(project.id, SCENE_FILE, JSON.stringify(imported.scene, null, 2));
    for (const asset of imported.assets) {
      const blob = new Blob([asset.data as BlobPart], { type: assetMimeType(asset.name, "") });
      await store.writeFile(project.id, ASSET_DIR + asset.name, blob, await analyzeAsset(asset.name, blob));
    }
    await openProject(project.id);
    const left = imported.notes.length ? ` ${imported.notes.join(" ")}` : "";
    pendingNotes.set(
      project.id,
      `This project was imported from Siljangnim v1. v1 scripts may use ctx utilities v2 doesn't have; check viewport_status for errors and port them.${left}`,
    );
    set({ notice: { kind: "info", text: `Imported "${imported.name}" from v1.${left}` } });
  } catch (err) {
    set({ notice: { kind: "error", text: `Couldn't import that file: ${err instanceof Error ? err.message : String(err)}` } });
  }
}

export function setExamplesOpen(open: boolean): void {
  if (!open && !get().exampleDownload?.preparing) cancelExampleDownload();
  set({ examplesOpen: open });
}

/** A link that opens an example directly (anyone can share it). */
export function exampleLink(slug: string): string {
  return `${window.location.origin}${window.location.pathname}#example=${encodeURIComponent(slug)}`;
}

/** #example=<slug> in the address opens that example (shared links). */
function openLinkedExample(): void {
  const slug = window.location.hash.match(/(?:^#|&)example=([\w.-]+)/)?.[1];
  if (!slug) return;
  history.replaceState(null, "", window.location.pathname + window.location.search);
  if (EXAMPLES.some((e) => e.slug === slug)) void openExample(slug);
  else set({ notice: { kind: "error", text: `No example "${slug}" in this version.` } });
}

/** What the agent is asked when someone picks a tool that has no example yet. */
export function buildRequest(ref: { id: string; name: string; repo: string | null; license: string | null; concept: string; input: string }): string {
  return (
    `Connect the open-source tool ${ref.name}${ref.repo ? ` (${ref.repo})` : ""} to a live scene and make an example of it. ` +
    `It is about: ${ref.concept}; its input: ${ref.input}. Start with catalog_get "${ref.id}", then decide whether it runs in the scene ` +
    "(imported from a CDN) or on this computer (python_run / command_run). Make it good-looking and interactive with a few controls, " +
    `check it with viewport_capture, save a recipe if it ran on this computer, and tell me its license (${ref.license ?? "check the repository"}).`
  );
}

/**
 * A new project where the agent connects a tool from the reference list.
 * The built-in agent gets the request right away; with an external agent, or
 * without an API key, the request is copied for the person to paste.
 */
export async function buildWithAgent(ref: Parameters<typeof buildRequest>[0]): Promise<void> {
  if (exampleDownload) return;
  set({ examplesOpen: false });
  await handToAgent(buildRequest(ref), ref.name, `${ref.name} (new)`);
}

/**
 * Mix an example into the open project: its assets come over, and the agent is asked to combine its scene
 * with the current one.
 */
export async function mixExample(slug: string): Promise<void> {
  const example = EXAMPLES.find((e) => e.slug === slug);
  const project = get().project;
  if (!example || !project || exampleDownload) return;
  const controller = exampleDownload = new AbortController();
  set({ notice: null, exampleDownload: { slug, loaded: 0, total: example.bytes, preparing: false } });
  try {
    const prepared = await prepareExample(example, controller.signal);
    controller.signal.throwIfAborted();
    if (get().project?.id !== project.id) throw new Error("The active project changed. Please try again.");
    set({ exampleDownload: { slug, loaded: example.bytes, total: example.bytes, preparing: true } });
    const files = prepared.assets.map((a) => new File([a.blob], a.name));
    const { names } = await addAssetFiles(project.id, files, { attach: false });
    const renamed = new Map(prepared.assets.map((a, i) => [a.name, names[i] ?? a.name] as const));
    const title = exampleText(example, resolveLanguage(get().settings.language) === "ko").title;
    set({ examplesOpen: false });
    await handToAgent(mixRequest(title, prepared.scene, renamed), title);
  } catch (err) {
    if (!controller.signal.aborted) set({ notice: { kind: "error", text: `Couldn't mix in the example: ${err instanceof Error ? err.message : String(err)}` } });
  } finally {
    exampleDownload = null;
    set({ exampleDownload: null, exampleCacheRevision: get().exampleCacheRevision + 1 });
  }
}

// --- moves (techniques to try next) ---

const movesKey = (projectId: string) => `siljangnim.moves.${projectId}`;

/** Moves picked in this project; they aren't offered again. */
export function appliedMoves(projectId: string): string[] {
  const raw = safeLocal(() => localStorage.getItem(movesKey(projectId)));
  try {
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Hand a move to the agent (or copy it for an external one) and stop offering it here. */
export async function applyMove(id: string): Promise<void> {
  const move = MOVES.find((m) => m.id === id);
  const project = get().project;
  if (!move || !project || get().live) return;
  const list = [...new Set([...appliedMoves(project.id), id])];
  safeLocal(() => localStorage.setItem(movesKey(project.id), JSON.stringify(list)));
  set({ movesRevision: get().movesRevision + 1 });
  await handToAgent(moveRequest(move), `"${move.name}"`);
}

export function setRemixOpen(open: boolean): void {
  set({ remixOpen: open });
}

/**
 * Picks from the remix list: techniques and example pieces together. Examples are downloaded and their assets added
 * to the open project first; then one request goes to the agent (or is copied for an external one).
 */
export async function remix(picks: { moves: string[]; examples: string[]; note?: string }): Promise<void> {
  const project = get().project;
  if (!project || get().live || exampleDownload) return;
  const moves = picks.moves.flatMap((id) => MOVES.filter((m) => m.id === id));
  const examples = picks.examples.flatMap((slug) => EXAMPLES.filter((e) => e.slug === slug));
  if (!moves.length && !examples.length) return;
  const korean = resolveLanguage(get().settings.language) === "ko";
  const controller = (exampleDownload = new AbortController());
  try {
    const pieces: RemixPiece[] = [];
    for (const example of examples) {
      const prepared = await prepareExample(example, controller.signal);
      if (get().project?.id !== project.id) throw new Error("The active project changed. Please try again.");
      const files = prepared.assets.map((a) => new File([a.blob], a.name));
      const { names } = await addAssetFiles(project.id, files, { attach: false });
      pieces.push({ title: exampleText(example, korean).title, scene: prepared.scene, renamed: new Map(prepared.assets.map((a, i) => [a.name, names[i] ?? a.name] as const)) });
    }
    if (moves.length) {
      const list = [...new Set([...appliedMoves(project.id), ...moves.map((m) => m.id)])];
      safeLocal(() => localStorage.setItem(movesKey(project.id), JSON.stringify(list)));
      set({ movesRevision: get().movesRevision + 1 });
    }
    set({ remixOpen: false, examplesOpen: false });
    const request =
      moves.length === 1 && !pieces.length && !picks.note?.trim()
        ? moveRequest(moves[0]!)
        : remixRequest(moves.map((m) => ({ id: m.id, name: m.name, summary: m.summary })), pieces, picks.note);
    await handToAgent(request, [...moves.map((m) => (korean ? m.name_ko : m.name)), ...pieces.map((p) => p.title)].join(" + "));
  } catch (err) {
    if (!controller.signal.aborted) set({ notice: { kind: "error", text: `Couldn't prepare the remix: ${err instanceof Error ? err.message : String(err)}` } });
  } finally {
    exampleDownload = null;
    set({ exampleDownload: null, exampleCacheRevision: get().exampleCacheRevision + 1 });
  }
}

/** Send a request to the built-in agent, or copy it for an external agent (or when no key is set yet). */
async function handToAgent(request: string, what: string, newProject?: string): Promise<void> {
  const { external, settings } = get();
  const status = await keys.status();
  const local = isLocalEngine(settings.provider) ? get().localEngines?.[settings.provider] : null;
  const ready = local
    ? local.installed && local.loggedIn
    : settings.provider === "custom" || (settings.provider === "anthropic" ? status.anthropic : status.openai);
  if (external || !ready) {
    try {
      await navigator.clipboard.writeText(request);
    } catch {
      // clipboard not allowed: the notice still says what to ask
    }
    set({
      notice: {
        kind: "info",
        text: external
          ? `Copied the request for ${what}; paste it into ${external.client ?? "your agent"}'s chat.`
          : `Copied the request for ${what}. Set up an agent in Settings (Claude Code, Codex or an API key), then paste it into the chat.`,
      },
    });
    return;
  }
  if (newProject) await createProject(newProject);
  await sendPrompt(request);
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
  const offRecording = next.on("recording", ({ frame, total }) => set((st) => ({ recording: st.recording && { ...st.recording, frame, total } })));
  const offOsc = next.on("oscListen", ({ port }) => {
    oscRequested = true;
    void startOsc(port);
  });
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
    offRecording();
    offOsc();
    if (host === next) {
      host = null;
      stopOsc();
    }
  };
}

// --- viewport frame (aspect or exact render size) ---

const FRAME_KEY = "siljangnim.frame.";

/** Change the viewport's frame for this project and restart the scene at its new size. */
export function setFrame(frame: Frame): void {
  const project = get().project;
  set({ frame });
  if (project) safeLocal(() => localStorage.setItem(FRAME_KEY + project.id, JSON.stringify(frame)));
  if (host) void loadIntoHost(get().scene);
}

// --- OSC: the hub listens on UDP and streams messages; they go on to the scene ---

let osc: { port: number; abort: AbortController; client: HubClient | null } | null = null;
let oscRequested = false;

function sendOsc(params: { active?: boolean; messages?: OscMessage[]; error?: string }): void {
  host?.request("osc", params).catch(() => undefined);
}

async function startOsc(port: number): Promise<void> {
  if (osc?.port === port) {
    // A reloaded scene: tell it the listener is still there.
    if (osc.client) sendOsc({ active: true });
    return;
  }
  stopOsc();
  const current = { port, abort: new AbortController(), client: null as HubClient | null };
  osc = current;
  const client = await hubClient();
  if (osc !== current) return;
  if (typeof client === "string") {
    sendOsc({ active: false, error: `OSC needs the hub. ${client}` });
    return;
  }
  try {
    const status = await client.oscListen(port);
    if (!status.listening) throw new Error(status.error ?? "the hub could not listen");
  } catch (err) {
    if (osc === current) sendOsc({ active: false, error: err instanceof Error ? err.message : String(err) });
    return;
  }
  if (osc !== current) return;
  current.client = client;
  sendOsc({ active: true });
  // Reconnect if the stream drops (the hub restarted, the machine slept).
  while (!current.abort.signal.aborted) {
    await client.oscStream(current.abort.signal, (messages) => sendOsc({ messages })).catch(() => undefined);
    if (!current.abort.signal.aborted) await new Promise((r) => setTimeout(r, 1000));
  }
}

function stopOsc(): void {
  if (!osc) return;
  osc.abort.abort();
  void osc.client?.oscStop().catch(() => undefined);
  osc = null;
}

async function loadIntoHost(scene: Scene): Promise<LoadResult> {
  if (!host) return { ok: false, errors: [] };
  set((st) => ({ runtime: { ...st.runtime, state: "loading", errors: [] } }));
  oscRequested = false;
  // The scene's setup reads ctx.resolution, so the chosen render size goes in first.
  await host.request("resolution", { size: frameResolution(get().frame) }).catch(() => undefined);
  const result = await host.load(scene, Object.fromEntries(assetBlobs));
  // The OSC listener stays open across reloads of scenes that use it.
  if (!oscRequested) stopOsc();
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

export function setSidebarCollapsed(collapsed: boolean): void {
  set({ sidebarCollapsed: collapsed });
  try {
    localStorage.setItem("siljangnim.sidebarCollapsed", collapsed ? "1" : "0");
  } catch {
    // not remembered
  }
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
/** `replace` names existing assets a file may overwrite (outputs of an earlier job); others get a new name. */
async function addAssetFiles(projectId: string, files: File[], options: { attach: boolean; replace?: Set<string> }): Promise<{ names: string[]; rejected: string[] }> {
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
    const clean = sanitizeAssetName(file.name);
    const name = options.replace?.has(clean) ? clean : uniqueAssetName(clean, assetBlobs.keys());
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

// --- job queue (the Jobs tab) ---

/** Recent hub jobs, or why there are none to show. */
export async function listJobs(): Promise<HubJob[] | string> {
  const c = await hubClient();
  if (typeof c === "string") return c;
  return (await c.jobs()).jobs;
}

export async function cancelJob(id: string): Promise<void> {
  const c = await hubClient();
  if (typeof c !== "string") await c.cancel(id);
}

// --- sharing: project.md ---

async function sha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The open project as a ProjectDocument, plus what a bundle carries besides the md. */
async function projectDocument(
  projectId: string,
  options: { includeAssets: boolean; preview: boolean },
): Promise<{ doc: ProjectDocument; preview: Blob | null; recipeTexts: Map<string, string> }> {
  const { project, scene, messages } = get();
  if (project?.id !== projectId) throw new Error("That project is no longer open.");
  let steps = (((await readJsonFile(projectId, PIPELINE_FILE)) as { steps?: PipelineStep[] } | null)?.steps ?? []);
  const lock = ((await readJsonFile(projectId, LOCK_FILE)) ?? {}) as { recipes?: string[]; programs?: string[] };
  const sources = assetSources(steps);
  const assets = await Promise.all(
    [...assetBlobs].map(async ([name, blob]) => ({
      name,
      kind: assetKind(name, blob.type),
      bytes: blob.size,
      sha256: await sha256(blob),
      source: sources.has(name) ? (`step ${sources.get(name)!}` as const) : ("user-provided" as const),
      included: options.includeAssets,
    })),
  );
  const refs = [...new Set([...(lock.recipes ?? []), ...steps.flatMap((s) => (s.recipe ? [s.recipe] : []))])].sort();
  const recipes: ProjectRecipeRef[] = [];
  const recipeTexts = new Map<string, string>();
  const client = refs.length ? await hubClient() : null;
  for (const ref of refs) {
    const id = ref.split("@")[0]!;
    if (!client || typeof client === "string") {
      recipes.push({ ref });
      continue;
    }
    try {
      const recipe = await client.recipe(id);
      const source = (recipe.meta as { source?: { license?: string; weights_license?: string } }).source;
      recipes.push({ ref, title: recipe.summary.title, license: source?.license ?? null, weightsLicense: source?.weights_license ?? null });
      recipeTexts.set(id, recipe.text);
      // The recipe's code was written by an agent, not taken from the tool, so the md can carry it:
      // a machine without the recipe can still run the step.
      steps = steps.map((s) => (s.recipe?.split("@")[0] === id && s.kind === "python" && !s.code && recipe.code ? { ...s, code: recipe.code } : s));
    } catch {
      recipes.push({ ref });
    }
  }
  const requests = messages.flatMap((m) =>
    m.role === "user" && Array.isArray(m.content)
      ? m.content.flatMap((b) => (b.type === "text" && !b.text.startsWith("[Studio note]") && b.text.trim() ? [b.text.trim()] : []))
      : [],
  );
  const preview = options.preview && host ? (await host.request("capture", { maxSize: 1024 }).catch(() => null))?.png ?? null : null;
  return {
    doc: {
      title: project.name,
      exported: new Date().toISOString().slice(0, 10),
      scene,
      assets,
      pipeline: steps,
      recipes,
      programs: lock.programs ?? [],
      requests,
      preview: Boolean(preview),
    },
    preview,
    recipeTexts,
  };
}

function projectController(projectId: string): ProjectController {
  return {
    exportMd: async () => renderProjectMd((await projectDocument(projectId, { includeAssets: false, preview: false })).doc),
    importMd: async (markdown) => (await importProjectText(markdown, new Map(), [])).note,
  };
}

/** The open project as files: project.md, preview.png, scene code, assets/, recipes/. */
async function projectBundleFiles(projectId: string): Promise<{ files: { name: string; data: Uint8Array }[]; recipes: number }> {
  const { doc, preview, recipeTexts } = await projectDocument(projectId, { includeAssets: true, preview: true });
  const encode = (text: string) => new TextEncoder().encode(text);
  const files = [{ name: PROJECT_MD, data: encode(renderProjectMd(doc)) }];
  if (preview) files.push({ name: "preview.png", data: new Uint8Array(await preview.arrayBuffer()) });
  // Readable copies of the scene; import goes by project.md, so these are for people and editors.
  for (const file of sceneCodeFiles(doc.scene)) files.push({ name: file.path, data: encode(file.text) });
  for (const [name, blob] of assetBlobs) files.push({ name: `assets/${name}`, data: new Uint8Array(await blob.arrayBuffer()) });
  for (const [id, text] of recipeTexts) files.push({ name: `recipes/${id}/recipe.md`, data: encode(text) });
  return { files, recipes: recipeTexts.size };
}

/** Download the open project as a bundle: project.md, preview.png, code/, assets/, recipes/. */
export async function exportProjectBundle(): Promise<void> {
  const project = get().project;
  if (!project) return;
  try {
    const { files, recipes } = await projectBundleFiles(project.id);
    const slug = project.name.trim().replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "") || "project";
    download(storedZip(files), `${slug}.siljangnim.zip`);
    set({ notice: { kind: "info", text: `Exported "${project.name}" with ${assetBlobs.size} asset${assetBlobs.size === 1 ? "" : "s"}${recipes ? ` and ${recipes} recipe${recipes === 1 ? "" : "s"}` : ""}.` } });
  } catch (err) {
    set({ notice: { kind: "error", text: `Couldn't export the project: ${err instanceof Error ? err.message : String(err)}` } });
  }
}

/**
 * The open project as a folder of plain files. On desktop it is written under
 * ~/Siljangnim/projects/ and shown in Finder/Explorer; in a browser it downloads as a zip.
 */
export async function openProjectFolder(): Promise<void> {
  const project = get().project;
  if (!project) return;
  if (!bridge?.project) return exportProjectBundle();
  try {
    const { files } = await projectBundleFiles(project.id);
    const dir = await bridge.project.reveal(
      projectFolderName(project.name, project.id),
      files.map((f) => ({ path: f.name, data: f.data })),
    );
    set({ notice: { kind: "info", text: `Wrote "${project.name}" to ${dir}. It's a copy: edits there don't change the project.` } });
  } catch (err) {
    set({ notice: { kind: "error", text: `Couldn't write the project folder: ${err instanceof Error ? err.message : String(err)}` } });
  }
}

/** A project.md, or a bundle (.zip) with it, as a new project. */
export async function importProjectFile(file: File): Promise<void> {
  try {
    let result: { title: string; note: string };
    if (/\.(md|markdown|txt)$/i.test(file.name)) {
      result = await importProjectText(await file.text(), new Map(), []);
    } else {
      const entries = await readZip(await file.arrayBuffer());
      const mdPath = [...entries.keys()].filter((k) => k === PROJECT_MD || k.endsWith(`/${PROJECT_MD}`)).sort((a, b) => a.length - b.length)[0];
      if (!mdPath) throw new Error("the zip has no project.md");
      const root = mdPath.slice(0, -PROJECT_MD.length);
      const assets = new Map<string, Uint8Array>();
      const recipeTexts: string[] = [];
      for (const [path, data] of entries) {
        if (!path.startsWith(root) || path.endsWith("/")) continue;
        const rest = path.slice(root.length);
        if (rest.startsWith("assets/") && !rest.slice(7).includes("/")) assets.set(rest.slice(7), data);
        else if (/^recipes\/[^/]+\/recipe\.md$/.test(rest)) recipeTexts.push(new TextDecoder().decode(data));
      }
      result = await importProjectText(new TextDecoder().decode(entries.get(mdPath)!), assets, recipeTexts);
    }
    set({ notice: { kind: "info", text: `Imported "${result.title}". ${result.note.replace(/^This project was imported from a project\.md \("[^"]*"\)\. The scene is loaded\. ?/, "")}`.trim() } });
  } catch (err) {
    set({ notice: { kind: "error", text: `Couldn't import that project: ${err instanceof Error ? err.message : String(err)}` } });
  }
}

async function importProjectText(markdown: string, assets: Map<string, Uint8Array>, recipeTexts: string[]): Promise<{ title: string; note: string }> {
  const parsed = parseProjectMd(markdown);
  const project = await store.createProject(parsed.title);
  await store.writeFile(project.id, SCENE_FILE, JSON.stringify(parsed.scene, null, 2));
  for (const [name, data] of assets) {
    const blob = new Blob([data as BlobPart], { type: assetMimeType(name, "") });
    await store.writeFile(project.id, ASSET_DIR + name, blob, await analyzeAsset(name, blob));
  }
  if (parsed.pipeline.length) await store.writeFile(project.id, PIPELINE_FILE, JSON.stringify({ steps: parsed.pipeline }, null, 2));
  const imported: string[] = [];
  let recipeProblem = "";
  if (recipeTexts.length) {
    const client = await hubClient();
    if (typeof client === "string") {
      recipeProblem = ` The bundle's recipes weren't added (${client}).`;
    } else {
      for (const text of recipeTexts) {
        try {
          const result = await client.importRecipe(text);
          if (!result.kept) imported.push(`${result.summary.id}@${result.summary.version}`);
        } catch (err) {
          recipeProblem += ` A recipe couldn't be added: ${err instanceof Error ? err.message : String(err)}.`;
        }
      }
    }
  }
  await openProject(project.id);
  const note = importNote(parsed, new Set(assets.keys()), imported) + recipeProblem;
  pendingNotes.set(project.id, note);
  return { title: parsed.title, note };
}

// --- agent ---

/** What tools act on, bound to one project: a run that outlives a project switch can't touch the new one. */
function projectEnv(
  projectId: string,
  sceneHost: SceneHost,
): { scene: SceneController; history: HistoryController; assets: AssetController; runtime: RuntimeController; recipes: RecipeController; project: ProjectController } {
  return {
    runtime: runtimeController(projectId),
    recipes: recipeController,
    project: projectController(projectId),
    scene: {
      get: () => get().scene,
      apply: (scene) => (get().project?.id === projectId ? applyScene(scene) : Promise.resolve({ ok: false, errors: [] })),
      capture: (maxSize) => sceneHost.request("capture", { maxSize }),
      status: () => sceneHost.request("status", {}),
      record: (options) => recordScene(options, projectId),
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

// --- recording (M3) ---

/**
 * Record the scene in the runtime, save the file as a project asset and hand
 * it to the person as a download.
 */
export async function recordScene(options: RecordOptions, projectId = get().project?.id): Promise<{ asset: string; bytes: number; width: number; height: number; frames: number }> {
  if (!host || !projectId || get().project?.id !== projectId) throw new Error("The viewport is not ready.");
  if (get().recording) throw new Error("A recording is already running.");
  set({ recording: { frame: 0, total: Math.round(options.duration * options.fps), options } });
  try {
    // Offline renders run at whatever speed the machine manages; allow plenty of time.
    const result = await host.request("record", options, 60_000 + options.duration * options.fps * 2_000);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "").replace(/^(\d{8})/, "$1-");
    const name = `recording-${stamp}.${result.extension}`;
    const { names } = await addAssetFiles(projectId, [new File([result.file], name, { type: result.file.type })], { attach: false });
    download(result.file, names[0] ?? name);
    return { asset: names[0] ?? name, bytes: result.file.size, width: result.width, height: result.height, frames: result.frames };
  } finally {
    set({ recording: null });
  }
}

export function cancelRecording(): void {
  if (host) void host.request("recordCancel", {}).catch(() => undefined);
}

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// --- runtime: open-source tools through the hub ---

const LOCK_FILE = "project.lock.json";
/** Output files already saved as assets, by job id, so a second job_status doesn't save them twice. */
const importedJobs = new Map<string, string[]>();
/** Which recipe (id@version) a job ran, for project.lock.json. */
const jobRecipes = new Map<string, string>();
/** What each job was asked to do, for pipeline.json (project.md). */
const jobRequests = new Map<string, RuntimeRequest>();
const replacedByJob = new Map<string, string[]>();
type ApprovalResult = ApprovalAnswer | "unanswered";
const approvalQueue: Array<{ request: ApprovalRequest; finish(answer: ApprovalResult): void }> = [];

/** Each request keeps its own deadline, including time queued behind another card. */
function requestApproval(request: ApprovalRequest, signal: AbortSignal, timeoutS: number): Promise<ApprovalResult> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve("deny");
    let settled = false;
    const entry = { request, finish };
    const timer = setTimeout(() => finish("unanswered"), timeoutS * 1000);
    const onAbort = () => finish("deny");
    function finish(answer: ApprovalResult) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      const index = approvalQueue.indexOf(entry);
      if (index !== -1) approvalQueue.splice(index, 1);
      // A queued timeout/cancellation must not dismiss someone else's card.
      if (index === 0) showNextApproval();
      resolve(answer);
    }
    signal.addEventListener("abort", onAbort);
    approvalQueue.push(entry);
    if (approvalQueue.length === 1) showNextApproval();
  });
}

function showNextApproval(): void {
  const next = approvalQueue[0];
  if (!next) {
    set({ approval: null });
    return;
  }
  set((st) => ({ approval: next.request, sidebarTab: st.external ? "activity" : "chat", sidebarCollapsed: false }));
}

export function answerRuntimeApproval(answer: ApprovalAnswer): void {
  approvalQueue[0]?.finish(answer);
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
      // A re-run (other params, or the real run after recipe_verify) replaces what an earlier job made;
      // files the person added keep theirs and the new ones get another name.
      const generated = assetSources((((await readJsonFile(projectId, PIPELINE_FILE)) as { steps?: PipelineStep[] } | null)?.steps ?? []));
      const replace = new Set([...generated.keys()].filter((name) => assetBlobs.has(name)));
      assets = (await addAssetFiles(projectId, files, { attach: false, replace })).names;
      replacedByJob.set(job.id, assets.filter((name) => replace.has(name)));
      importedJobs.set(job.id, assets);
      if (job.state === "done") {
        await recordLock(projectId, job, jobRecipes.get(job.id));
        const request = jobRequests.get(job.id);
        if (request && assets.length) await recordPipeline(projectId, request, job, assets);
      }
    }
    return {
      id: job.id,
      outputs: job.outputs.map((o) => o.name),
      state: job.state === "created" ? "queued" : job.state,
      exitCode: job.exit_code,
      error: job.error,
      log: job.log,
      assets,
      replaced: replacedByJob.get(job.id) ?? [],
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
            `Waiting for the person to approve this timed out (${needed.items.join("; ")}). Nothing ran. Call the tool again to show a new approval card in the Siljangnim window.`,
          );
        }
        if (answer === "deny") throw new Error("The person did not allow this. Ask them in your reply, or find a way that runs in the browser.");
        if (answer === "project") await store.writeFile(projectId, PERMISSIONS_FILE, JSON.stringify(grant(grants, request), null, 2));
      }
      const c = await client();
      const label = request.recipe ? `recipe ${request.recipe.id}` : request.kind === "python" ? `python${request.packages.length ? `: ${request.packages.map((p) => p.split(/[=<>~![]/)[0]).join(", ")}` : ""}` : programName(request.argv[0] ?? "");
      const job = await c.createJob({ kind: request.kind, packages: request.packages, code: request.code, argv: request.argv, timeout_s: request.timeoutS, label });
      set({ jobsUsed: true });
      for (const name of request.inputs) await c.putInput(job.id, name, assetBlobs.get(name)!);
      if (request.params) await c.putInput(job.id, "params.json", new Blob([JSON.stringify(request.params)], { type: "application/json" }));
      if (request.recipe) jobRecipes.set(job.id, `${request.recipe.id}@${request.recipe.version}`);
      jobRequests.set(job.id, request);
      await c.start(job.id);
      return finish(c, await c.wait(job.id, request.waitS));
    },
    job: async (id, waitS) => {
      const c = await client();
      return finish(c, await c.wait(id, waitS));
    },
  };
}

/** pipeline.json: how each generated asset was made, so project.md can say how to rebuild it. */
async function recordPipeline(projectId: string, request: RuntimeRequest, job: HubJob, outputs: string[]): Promise<void> {
  const step: PipelineStep = {
    kind: request.kind,
    ...(request.recipe ? { recipe: `${request.recipe.id}@${request.recipe.version}` } : {}),
    packages: request.packages,
    resolved: job.resolved,
    ...(request.kind === "command" ? { argv: [programName(request.argv[0] ?? ""), ...request.argv.slice(1)] } : {}),
    // A recipe's code lives in the recipe; other code was written for this project.
    ...(request.kind === "python" && !request.recipe ? { code: request.code } : {}),
    inputs: request.inputs,
    ...(request.params ? { params: request.params } : {}),
    outputs,
  };
  const steps = (((await readJsonFile(projectId, PIPELINE_FILE)) as { steps?: PipelineStep[] } | null)?.steps ?? []);
  await store.writeFile(projectId, PIPELINE_FILE, JSON.stringify({ steps: addPipelineStep(steps, step) }, null, 2));
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
  registrySearch: async (query) => {
    const { url, recipes } = await (await requireHub()).registry(query);
    return { url, recipes: recipes.map(({ verified_on, ...r }) => ({ ...r, verifiedOn: verified_on })) };
  },
  install: async (id) => {
    const { summary, kept } = await (await requireHub()).installRecipe(id);
    return { summary: recipeSummary(summary), kept };
  },
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
const SCENE_CHANGING_TOOLS = new Set(["scene_write", "scene_edit"]);
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
  // Only scene changes make a version; recordings, runtime jobs and restores don't change the scene itself.
  if (SCENE_CHANGING_TOOLS.has(name) && !output.isError) noteControlChange(`${get().external?.client ?? "Agent"}: ${name.replace("_", " ")}`, "action");
  return output;
}

export function setExternal(external: AppState["external"]): void {
  // An agent that just attached: show what it does.
  set((st) => ({ external, sidebarTab: external && (!st.external || st.sidebarTab === "chat") ? "activity" : st.sidebarTab }));
}

// --- chat on the person's own Claude Code / Codex (desktop) ---

const localSessionKey = (projectId: string, engine: LocalEngineId) => `siljangnim.localSession.${engine}.${projectId}`;

/** Checks the CLIs (Settings shows the result) and, on a first launch without an API key, picks one that is ready. */
export async function refreshLocalEngines(): Promise<void> {
  const status = await bridge?.localAgent?.detect().catch(() => null);
  if (status) set({ localEngines: status });
}

async function pickLocalEngine(): Promise<void> {
  if (!bridge?.localAgent) return;
  const firstRun = !hasSavedSettings();
  await refreshLocalEngines();
  const engines = get().localEngines;
  const { keyStatus } = get();
  if (!firstRun || !engines || keyStatus.anthropic || keyStatus.openai) return;
  const ready = (["claude-code", "codex"] as const).find((id) => engines[id]?.installed && engines[id]?.loggedIn);
  if (ready) updateSettings({ provider: ready });
}

/** Add an event's blocks to the chat, merging into the last message of the same role so turns keep alternating. */
function appendBlocks(messages: MessageParam[], role: "user" | "assistant", blocks: ContentBlockParam[]): MessageParam[] {
  const last = messages[messages.length - 1];
  if (last?.role === role && Array.isArray(last.content)) return [...messages.slice(0, -1), { role, content: [...last.content, ...blocks] }];
  return [...messages, { role, content: blocks }];
}

async function sendLocalPrompt(engine: LocalEngineId, prompt: string): Promise<void> {
  const local = bridge?.localAgent;
  const project = get().project;
  if (!local || !project) return;
  const status = get().localEngines?.[engine] ?? (await local.detect().catch(() => null))?.[engine];
  const label = engine === "claude-code" ? "Claude Code" : "Codex";
  if (!status?.installed || !status.loggedIn) {
    await refreshLocalEngines();
    set({ settingsOpen: true, notice: { kind: "error", text: `${label} ${status?.installed ? "needs you to sign in" : "is not installed"}. Settings shows how.` } });
    return;
  }
  await flushControlVersion();
  const projectId = project.id;
  const note = pendingNotes.get(projectId);
  pendingNotes.delete(projectId);
  const attached = get().attachments;
  set({ attachments: [] });
  // The CLI gets text only; attached images stay project assets it can read with asset_read.
  const extra = [...(note ? [studioNote(note)] : []), ...(await attachmentBlocks(attached)).filter((b) => b.type === "text")];
  const content: ContentBlockParam[] = [...extra, { type: "text", text: prompt }];
  let messages: MessageParam[] = [...get().messages, { role: "user", content }];
  const abort = new AbortController();
  agentAbort = abort;
  running = abort;
  set({ messages, live: { text: "", thinking: "", tools: [] }, notice: null });
  await store.writeChat(projectId, messages);

  const stillCurrent = () => get().project?.id === projectId;
  const sessionKey = localSessionKey(projectId, engine);
  const input = extra.map((b) => (b.type === "text" ? b.text : "")).concat(prompt).join("\n\n");
  let runId: string | null = null;
  const queued: [string, LocalAgentEvent][] = [];
  let finish: () => void = () => undefined;
  const finished = new Promise<void>((resolve) => (finish = resolve));
  let error: string | null = null;
  const handle = (event: LocalAgentEvent) => {
    const liveTurn = get().live;
    switch (event.type) {
      case "session":
        safeLocal(() => localStorage.setItem(sessionKey, event.id));
        break;
      case "text":
        if (stillCurrent() && liveTurn) set({ live: { ...liveTurn, text: liveTurn.text + event.delta } });
        break;
      case "assistant":
        messages = appendBlocks(messages, "assistant", event.content);
        if (stillCurrent()) {
          const started = event.content.flatMap((b) => (b.type === "tool_use" ? [{ id: b.id, name: b.name }] : []));
          set({ messages, live: liveTurn ? { ...liveTurn, text: "", tools: [...liveTurn.tools, ...started] } : null });
        }
        void store.writeChat(projectId, messages);
        break;
      case "tool_result":
        messages = appendBlocks(messages, "user", [{ type: "tool_result", tool_use_id: event.id, content: event.text || "(no output)", ...(event.isError ? { is_error: true } : {}) }]);
        if (stillCurrent()) set({ messages, live: liveTurn ? { ...liveTurn, tools: liveTurn.tools.filter((t) => t.id !== event.id) } : null });
        void store.writeChat(projectId, messages);
        break;
      case "error":
        error = event.auth ? `${label} is signed out. Sign in again from Settings.` : event.message;
        if (event.auth) void refreshLocalEngines();
        break;
      case "done":
        finish();
        break;
    }
  };
  const off = local.onEvent((id, event) => {
    if (runId === null) queued.push([id, event]);
    else if (id === runId) handle(event);
  });
  const onAbort = () => runId && void local.stop(runId);
  abort.signal.addEventListener("abort", onAbort);
  try {
    runId = await local.run(engine, input, safeLocal(() => localStorage.getItem(sessionKey)));
    for (const [id, event] of queued.splice(0)) if (id === runId) handle(event);
    if (abort.signal.aborted) onAbort();
    await finished;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  } finally {
    off();
    abort.signal.removeEventListener("abort", onAbort);
    await store.writeChat(projectId, messages);
    if (stillCurrent()) {
      set({ messages, ...(error ? { notice: { kind: "error" as const, text: error } } : {}) });
      await commitVersion(projectId, versionMessage(prompt));
    }
    if (agentAbort === abort) agentAbort = null;
    if (running === abort) {
      running = null;
      set({ live: null });
    }
  }
}

export async function sendPrompt(text: string): Promise<void> {
  const prompt = text.trim();
  const { project, settings, live } = get();
  if (!prompt || !project || live) return;
  if (!host) {
    set({ notice: { kind: "error", text: "The viewport is not ready yet." } });
    return;
  }
  if (isLocalEngine(settings.provider)) return sendLocalPrompt(settings.provider, prompt);

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
  const { scene: controller, history, assets: assetsEnv, runtime, recipes, project: projectEnvPart } = projectEnv(projectId, host);

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
        set({ question: { question, options }, sidebarTab: "chat", sidebarCollapsed: false });
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
      tools: [...SCENE_TOOLS, ...HISTORY_TOOLS, ...ASSET_TOOLS, ...RUNTIME_TOOLS, ...CATALOG_TOOLS, ...MOVE_TOOLS, ...RECIPE_TOOLS, ...PROJECT_TOOLS, ...USER_TOOLS],
      env: { scene: controller, history, assets: assetsEnv, user, runtime, recipes, project: projectEnvPart },
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
  // A new chat starts a new CLI session too.
  for (const engine of ["claude-code", "codex"] as const) safeLocal(() => localStorage.removeItem(localSessionKey(project.id, engine)));
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
