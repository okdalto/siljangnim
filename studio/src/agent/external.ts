// What external agents (Claude Code, Codex…) get over MCP. The tool
// definitions are the built-in agent's own; mcp/src/spec.json is generated
// from this module (npm --prefix studio run export-mcp) and a test keeps it
// in sync.
import { ASSET_TOOLS } from "./assetTools";
import { HISTORY_TOOLS } from "./historyTools";
import { MCP_INSTRUCTIONS } from "./prompt";
import { RECIPE_TOOLS } from "./recipeTools";
import { PROJECT_TOOLS } from "./projectTools";
import { CATALOG_TOOLS } from "./catalogTools";
import { RUNTIME_TOOLS } from "./runtimeTools";
import { SCENE_TOOLS } from "./sceneTools";
import { toolSpec, type ToolDefinition } from "./tools";

/** ask_user is left out: external agents ask in their own chat. */
export const EXTERNAL_TOOLS: ToolDefinition[] = [...SCENE_TOOLS, ...HISTORY_TOOLS, ...ASSET_TOOLS, ...RUNTIME_TOOLS, ...CATALOG_TOOLS, ...RECIPE_TOOLS, ...PROJECT_TOOLS];

export interface McpSpec {
  instructions: string;
  tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown>; readOnly: boolean }>;
}

export function mcpSpec(): McpSpec {
  return {
    instructions: MCP_INSTRUCTIONS,
    tools: EXTERNAL_TOOLS.map((tool) => {
      const spec = toolSpec(tool);
      return { name: spec.name, description: spec.description, inputSchema: spec.input_schema, readOnly: tool.readOnly };
    }),
  };
}
