import { create } from "zustand";
import type { MessageParam } from "../agent/llm/types";
import type { ToolOutput } from "../agent/tools";
import type { ApprovalRequest } from "../project/permissions";
import type { LocalEngineId, LocalEngineStatus, ProviderKeyId } from "../desktop";
import type { AssetInfo } from "../project/assets";
import type { ProjectMeta, Version } from "../project/store";
import type { MonitorValue, RecordOptions, RuntimeState, SceneError } from "../scene/protocol";
import { DEFAULT_SCENE, type Scene } from "../scene/schema";
import { FIT, type Frame } from "./frame";
import { resolveLanguage, type Language } from "./language";
import { loadSettings, type Settings } from "./settings";

export interface LiveTurn {
  text: string;
  thinking: string;
  tools: Array<{ id: string; name: string }>;
}

export interface PendingQuestion {
  question: string;
  options: Array<{ label: string; description?: string }>;
}

export interface ActivityEntry {
  id: number;
  tool: string;
  input: unknown;
  at: number;
  /** Null while the tool runs. */
  output: ToolOutput | null;
}

/** An external agent driving this viewer through the MCP bridge. */
export interface ExternalAgent {
  status: "connecting" | "connected" | "reconnecting" | "ended" | "replaced";
  client: string | null;
}

export interface Notice {
  kind: "error" | "info";
  text: string;
}

export interface AppState {
  ready: boolean;
  projects: ProjectMeta[];
  project: ProjectMeta | null;
  scene: Scene;
  runtime: { state: RuntimeState; fps: number; time: number; errors: SceneError[] };
  messages: MessageParam[];
  /** The open project's versions, oldest first. */
  versions: Version[];
  sidebarTab: "chat" | "activity" | "history" | "assets" | "jobs";
  /** Whether this session ran runtime jobs (shows the Jobs tab). */
  jobsUsed: boolean;
  /** The example just opened, introduced over the viewport until dismissed. */
  exampleIntro: string | null;
  /** The viewport's frame (aspect or exact size), remembered per project in this browser. */
  frame: Frame;
  /** The sidebar folded to a rail of icons, leaving the viewport the room. */
  sidebarCollapsed: boolean;
  /** Set when the viewer was opened by the MCP bridge: chat is replaced by the agent's activity. */
  external: ExternalAgent | null;
  activity: ActivityEntry[];
  /** The open project's uploaded files, by name. */
  assets: AssetInfo[];
  /** Assets uploaded since the last prompt; the next prompt tells the agent about them. */
  attachments: string[];
  /** Values the scene publishes (ctx.publish), with recent numeric history for sparklines. */
  monitors: Record<string, { value: MonitorValue; history: number[] }>;
  /** Keyed uniforms the person moved directly; the runtime holds them off their keyframes. */
  overrides: string[];
  /** Whether undo/redo have anything (the stacks themselves live in the session controller). */
  canUndo: boolean;
  canRedo: boolean;
  /** A recording in progress. */
  recording: { frame: number; total: number; options: RecordOptions } | null;
  /** A runtime action (running code, installing packages) waiting for the person's OK. */
  approval: ApprovalRequest | null;
  /** A question from the agent waiting for the person's answer. */
  question: PendingQuestion | null;
  /** Streaming state of the agent's current turn; null when idle. */
  live: LiveTurn | null;
  notice: Notice | null;
  settings: Settings;
  keyStatus: Record<ProviderKeyId, boolean>;
  /** Desktop: whether Claude Code / Codex are installed and signed in (null until checked). */
  localEngines: Record<LocalEngineId, LocalEngineStatus> | null;
  /** Bumped when a move is picked, so the "Try next" cards refresh. */
  movesRevision: number;
  settingsOpen: boolean;
  examplesOpen: boolean;
  exampleDownload: { slug: string; loaded: number; total: number; preparing: boolean } | null;
  exampleCacheRevision: number;
}

export const useApp = create<AppState>(() => ({
  ready: false,
  projects: [],
  project: null,
  scene: DEFAULT_SCENE,
  runtime: { state: "idle", fps: 0, time: 0, errors: [] },
  messages: [],
  versions: [],
  sidebarTab: "chat",
  jobsUsed: false,
  exampleIntro: null,
  frame: FIT,
  sidebarCollapsed: (() => {
    try {
      return localStorage.getItem("siljangnim.sidebarCollapsed") === "1";
    } catch {
      return false;
    }
  })(),
  external: null,
  activity: [],
  assets: [],
  attachments: [],
  monitors: {},
  overrides: [],
  canUndo: false,
  canRedo: false,
  question: null,
  approval: null,
  recording: null,
  live: null,
  notice: null,
  settings: loadSettings(),
  keyStatus: { anthropic: false, openai: false },
  localEngines: null,
  movesRevision: 0,
  settingsOpen: false,
  examplesOpen: false,
  exampleDownload: null,
  exampleCacheRevision: 0,
}));

/** The language descriptions are shown in (Settings → Language, else the system's). */
export function useLanguage(): Language {
  return useApp((s) => resolveLanguage(s.settings.language));
}
