// Tool definitions shared by the built-in agent and (stage 2) the MCP server.
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import type { CaptureResult, LoadResult, RecordOptions, RuntimeStatus } from "../scene/protocol";
import type { AssetInfo } from "../project/assets";
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
  /** Record the scene to a video (or PNG frames) and save it as a project asset. */
  record(options: RecordOptions): Promise<{ asset: string; bytes: number; width: number; height: number; frames: number }>;
}

export interface VersionInfo {
  id: string;
  parentId: string | null;
  createdAt: number;
  message: string;
  /** The version the current scene descends from. */
  head: boolean;
}

/** The project's version history. Implemented by the app over the project store. */
export interface HistoryController {
  /** Versions oldest first. */
  list(): Promise<VersionInfo[]>;
  /** Load a version (full id or unique prefix) and move HEAD to it. Throws with an actionable message. */
  restore(idOrPrefix: string): Promise<{ version: VersionInfo; load: LoadResult }>;
}

/** The project's uploaded assets. */
export interface AssetController {
  list(): Promise<AssetInfo[]>;
  read(name: string): Promise<Blob | undefined>;
}

export interface QuestionOption {
  label: string;
  description?: string;
}

/** The person at the keyboard. */
export interface UserController {
  /** Show a question and wait for the answer: an option label or free text. Null if stopped. */
  ask(question: string, options: QuestionOption[], signal: AbortSignal): Promise<string | null>;
}

/** A run of open-source code through the hub (docs/runtime.md). */
export interface RuntimeJob {
  id: string;
  state: "queued" | "installing" | "running" | "done" | "failed" | "cancelled";
  exitCode: number | null;
  error: string | null;
  log: string;
  /** Output file names the job wrote to out/. */
  outputs: string[];
  /** Output files, as the project asset names they were saved under. */
  assets: string[];
  /** Of those, the ones that replaced files an earlier job made (a re-run). */
  replaced?: string[];
  /** Exact package versions the environment ended up with. */
  resolved: string[];
  seconds: number;
}

export interface RuntimeRequest {
  kind: "python" | "command";
  packages: string[];
  code: string;
  argv: string[];
  /** Project asset names copied into the job's in/ folder. */
  inputs: string[];
  timeoutS: number;
  /** How long to wait before returning a still-running job. */
  waitS: number;
  /** Written to in/params.json (recipes read their parameters from there). */
  params?: Record<string, unknown>;
  /** Set when running a recipe; a trusted one (local, verified here) needs no approval. */
  recipe?: { id: string; version: number; trusted: boolean };
}

/** Runs C/D-grade open source through the Python hub, after the person approves. */
export interface RuntimeController {
  /** Why the runtime can't be used here, or null when it can. */
  unavailable(): Promise<string | null>;
  info(): Promise<{ platform: string; accelerators: string[]; gpus: string[]; environments: string[][]; programs: Record<string, boolean> }>;
  run(request: RuntimeRequest, signal: AbortSignal): Promise<RuntimeJob>;
  job(id: string, waitS: number): Promise<RuntimeJob>;
}

export interface RecipeSummary {
  id: string;
  version: number;
  title: string;
  capability: string;
  tier: "C" | "D";
  kind: "python" | "command";
  packages: string[];
  program: string | null;
  io: Record<string, unknown>;
  license: string | null;
  /** "local": written by recipe_save on this machine; anything else came from elsewhere. */
  origin: string;
  statusHere: "draft" | "verified" | "broken";
  testedHere: string | null;
}

export interface RecipeDetail {
  summary: RecipeSummary;
  code: string;
  argv: string[];
  /** The whole recipe.md. */
  text: string;
  verify: { params: Record<string, unknown>; expectOutputs: string[] };
}

export interface RecipeFields {
  title: string;
  capability: string;
  kind: "python" | "command";
  packages?: string[];
  code?: string;
  argv?: string[];
  source?: { name?: string; repo?: string; ref?: string; license?: string; weights_license?: string };
  io?: Record<string, unknown>;
  verify?: { params?: Record<string, unknown>; expect_outputs?: string[] };
  setup?: string;
  notes?: string;
}

/** Recipes on this machine (docs/recipes.md), stored by the hub. */
export interface RecipeController {
  search(query: string): Promise<{ platform: string; recipes: RecipeSummary[] }>;
  read(id: string): Promise<RecipeDetail>;
  save(id: string, fields: RecipeFields): Promise<RecipeSummary>;
  setStatus(id: string, status: "verified" | "broken", log: string): Promise<RecipeSummary>;
}

/** Sharing a project as project.md (docs/project-md.md). */
export interface ProjectController {
  /** The open project as project.md. */
  exportMd(): Promise<string>;
  /** A new project from a project.md, opened; returns what to rebuild. */
  importMd(markdown: string): Promise<string>;
}

export interface ToolEnv {
  scene: SceneController;
  history: HistoryController;
  assets: AssetController;
  user: UserController;
  runtime: RuntimeController;
  recipes: RecipeController;
  project: ProjectController;
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
