import { create } from "zustand";
import type { MessageParam } from "../agent/llm/types";
import type { ProviderKeyId } from "../desktop";
import type { AssetInfo } from "../project/assets";
import type { ProjectMeta, Version } from "../project/store";
import type { RuntimeState, SceneError } from "../scene/protocol";
import { DEFAULT_SCENE, type Scene } from "../scene/schema";
import { loadSettings, type Settings } from "./settings";

export interface LiveTurn {
  text: string;
  thinking: string;
  tools: Array<{ id: string; name: string }>;
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
  sidebarTab: "chat" | "history" | "assets";
  /** The open project's uploaded files, by name. */
  assets: AssetInfo[];
  /** Assets uploaded since the last prompt; the next prompt tells the agent about them. */
  attachments: string[];
  /** Streaming state of the agent's current turn; null when idle. */
  live: LiveTurn | null;
  notice: Notice | null;
  settings: Settings;
  keyStatus: Record<ProviderKeyId, boolean>;
  settingsOpen: boolean;
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
  assets: [],
  attachments: [],
  live: null,
  notice: null,
  settings: loadSettings(),
  keyStatus: { anthropic: false, openai: false },
  settingsOpen: false,
}));
