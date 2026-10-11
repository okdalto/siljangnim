// Tool definitions shared by the built-in agent and (stage 2) the MCP server.
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import type { CaptureResult, LoadResult, RuntimeStatus } from "../scene/protocol";
import type { Scene } from "../scene/schema";
import type { ToolSpec } from "./llm/types";

export type ToolResultContent = Anthropic.Beta.BetaToolResultBlockParam["content"];

export interface ToolOutput {
  content: ToolResultContent;
  isError?: boolean;
}

/** What tools can touch. The app implements this over the scene host and project store. */
export interface SceneController {
  get(): Scene;
  apply(scene: Scene): Promise<LoadResult>;
  capture(maxSize: number): Promise<CaptureResult>;
  status(): Promise<RuntimeStatus>;
}

export interface ToolEnv {
  scene: SceneController;
  signal: AbortSignal;
}

export interface ToolDefinition<S extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  input: S;
  /** Read-only tools may run in parallel with each other. */
  readOnly: boolean;
  run(input: z.infer<S>, env: ToolEnv): Promise<ToolOutput>;
}

export function defineTool<S extends z.ZodType>(tool: ToolDefinition<S>): ToolDefinition<S> {
  return tool;
}

export function toolSpec(tool: ToolDefinition): ToolSpec {
  const schema = z.toJSONSchema(tool.input, { target: "draft-7" }) as Record<string, unknown>;
  delete schema.$schema;
  return { name: tool.name, description: tool.description, input_schema: { ...schema, type: "object" } };
}

export async function runTool(tool: ToolDefinition, rawInput: unknown, env: ToolEnv): Promise<ToolOutput> {
  // Tool input streams eagerly, so validate it here before running anything.
  const parsed = tool.input.safeParse(rawInput);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `- ${i.path.join(".") || "(input)"}: ${i.message}`).join("\n");
    return { isError: true, content: `Invalid input for ${tool.name}:\n${issues}\nFix the arguments and call the tool again.` };
  }
  try {
    return await tool.run(parsed.data, env);
  } catch (err) {
    return { isError: true, content: `${tool.name} failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}
