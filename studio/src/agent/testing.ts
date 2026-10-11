// Stubs for tests: a ToolEnv whose parts do nothing unless a test replaces them.
import type { AssetController, HistoryController, RecipeController, RuntimeController, SceneController, ToolEnv, UserController } from "./tools";

export const noHistory: HistoryController = {
  list: async () => [],
  restore: async () => {
    throw new Error("no versions");
  },
};
export const noAssets: AssetController = { list: async () => [], read: async () => undefined };
export const noUser: UserController = { ask: async () => null };
export const noRuntime: RuntimeController = {
  unavailable: async () => "no runtime in tests",
  info: async () => ({ platform: "test", accelerators: [], gpus: [], environments: [], programs: {} }),
  run: async () => {
    throw new Error("no runtime in tests");
  },
  job: async () => {
    throw new Error("no runtime in tests");
  },
};

export const noRecipes: RecipeController = {
  search: async () => ({ platform: "test", recipes: [] }),
  read: async (id) => {
    throw new Error(`no recipe "${id}"`);
  },
  save: async () => {
    throw new Error("no recipes in tests");
  },
  setStatus: async () => {
    throw new Error("no recipes in tests");
  },
};

export function stubEnv(parts: Partial<ToolEnv> & { scene?: SceneController } = {}): ToolEnv {
  return {
    scene: parts.scene ?? ({} as SceneController),
    history: noHistory,
    assets: noAssets,
    user: noUser,
    runtime: noRuntime,
    recipes: noRecipes,
    signal: new AbortController().signal,
    ...parts,
  };
}
