import { describe, expect, it } from "vitest";
import type { LoadResult, RecordOptions } from "../scene/protocol";
import { DEFAULT_SCENE, type Scene } from "../scene/schema";
import { runAgent, type AgentEvent } from "./loop";
import type { ContentBlockParam, LLMProvider, MessageParam, TurnRequest, TurnResult } from "./llm/types";
import { SCENE_TOOLS } from "./sceneTools";
import { USER_TOOLS } from "./userTools";
import { noAssets, noHistory, noRecipes, noRuntime, noUser, stubEnv } from "./testing";
import type { SceneController } from "./tools";

/** Provider that replays scripted turns and records every request. */
function scripted(turns: Array<Partial<TurnResult> & { content: ContentBlockParam[] }>): LLMProvider & { requests: TurnRequest[] } {
  const requests: TurnRequest[] = [];
  let i = 0;
  return {
    id: "anthropic",
    requests,
    async runTurn(request) {
      requests.push({ ...request, messages: structuredClone(request.messages) });
      const turn = turns[i++];
      if (!turn) throw new Error("no more scripted turns");
      return { stopReason: "end_turn", ...turn };
    },
  };
}

function fakeScene(loadResult: LoadResult = { ok: true, errors: [] }): SceneController & { applied: Scene[]; recorded: RecordOptions[] } {
  let current = structuredClone(DEFAULT_SCENE);
  const applied: Scene[] = [];
  const recorded: RecordOptions[] = [];
  return {
    applied,
    recorded,
    get: () => current,
    async apply(scene) {
      current = scene;
      applied.push(scene);
      return loadResult;
    },
    async capture() {
      return { png: new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }), width: 2, height: 2 };
    },
    async status() {
      return { state: "running", time: 1, frame: 60, fps: 60, width: 2, height: 2, errors: [] };
    },
    async record(options) {
      recorded.push(options);
      return { asset: `recording.${options.format === "png" ? "zip" : options.format}`, bytes: 2 * 1024 * 1024, width: 1280, height: 720, frames: options.duration * options.fps };
    },
  };
}

const user = (text: string): MessageParam => ({ role: "user", content: [{ type: "text", text }] });

function run(provider: LLMProvider, scene: SceneController, events: AgentEvent[] = [], signal = new AbortController().signal) {
  return runAgent({
    provider,
    model: "claude-opus-5-5",
    effort: "high",
    system: "test",
    tools: SCENE_TOOLS,
    env: { scene, history: noHistory, assets: noAssets, user: noUser, runtime: noRuntime, recipes: noRecipes },
    messages: [user("make waves")],
    signal,
    onEvent: (e) => events.push(e),
  });
}

describe("runAgent", () => {
  it("runs tools, returns results in one user message, and stops on end_turn", async () => {
    const provider = scripted([
      {
        stopReason: "tool_use",
        content: [
          { type: "text", text: "Reading." },
          { type: "tool_use", id: "t1", name: "scene_read", input: {} },
          { type: "tool_use", id: "t2", name: "viewport_status", input: {} },
        ],
      },
      { content: [{ type: "text", text: "Done." }] },
    ]);
    const result = await run(provider, fakeScene());

    expect(result.reason).toBe("done");
    expect(result.messages).toHaveLength(4);
    const toolTurn = result.messages[2]!;
    expect(toolTurn.role).toBe("user");
    expect(Array.isArray(toolTurn.content) && toolTurn.content.map((b) => b.type)).toEqual(["tool_result", "tool_result"]);
    // The second request carries the first assistant turn unchanged.
    expect(provider.requests[1]!.messages[1]).toEqual(result.messages[1]);
  });

  it("reports invalid tool input back to the model instead of running the tool", async () => {
    const scene = fakeScene();
    const provider = scripted([
      { stopReason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "scene_write", input: { nope: 1 } }] },
      { content: [{ type: "text", text: "ok" }] },
    ]);
    const result = await run(provider, scene);
    const results = result.messages[2]!.content as Array<{ type: string; is_error?: boolean; content?: unknown }>;
    expect(results[0]!.is_error).toBe(true);
    expect(String(results[0]!.content)).toContain("Invalid input for scene_write");
    expect(scene.applied).toHaveLength(0);
  });

  it("passes scene load errors back as an error result", async () => {
    const scene = fakeScene({
      ok: false,
      errors: [{ source: "shader", stage: "fragment", message: "fragment shader compile failed", line: 7, at: 0 }],
    });
    const provider = scripted([
      { stopReason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "scene_write", input: { scene: DEFAULT_SCENE } }] },
      { content: [{ type: "text", text: "fixing" }] },
    ]);
    const result = await run(provider, scene);
    const results = result.messages[2]!.content as Array<{ is_error?: boolean; content?: unknown }>;
    expect(results[0]!.is_error).toBe(true);
    expect(String(results[0]!.content)).toContain("[shader/fragment] line 7");
  });

  it("drops a refused turn whole and never runs its tools", async () => {
    const scene = fakeScene();
    const provider = scripted([
      { stopReason: "refusal", detail: "declined", content: [{ type: "tool_use", id: "t1", name: "scene_write", input: {} }] },
    ]);
    const result = await run(provider, scene);
    expect(result.reason).toBe("refusal");
    expect(result.messages).toHaveLength(1);
    expect(scene.applied).toHaveLength(0);
  });

  it("stops without calling the model when already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const provider = scripted([]);
    const result = await run(provider, fakeScene(), [], controller.signal);
    expect(result.reason).toBe("aborted");
    expect(provider.requests).toHaveLength(0);
  });

  it("returns an image block from viewport_capture", async () => {
    const provider = scripted([
      { stopReason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "viewport_capture", input: {} }] },
      { content: [{ type: "text", text: "looks good" }] },
    ]);
    const result = await run(provider, fakeScene());
    const results = result.messages[2]!.content as Array<{ content?: Array<{ type: string }> }>;
    expect(results[0]!.content!.map((c) => c.type)).toEqual(["image", "text"]);
  });
});

describe("scene_edit", () => {
  const edit = SCENE_TOOLS.find((t) => t.name === "scene_edit")!;

  it("applies an exact single-occurrence replacement and uniform changes", async () => {
    const scene = fakeScene();
    const output = await edit.run(
      edit.input.parse({
        edits: [{ phase: "render", find: "drawFullscreen", replace: "drawFullscreen" }],
        uniforms: { u_speed: null, u_glow: { type: "float", value: 0.5 } },
      }),
      { scene, history: noHistory, assets: noAssets, user: noUser, runtime: noRuntime, recipes: noRecipes, signal: new AbortController().signal },
    );
    expect(output.isError).toBeFalsy();
    expect(scene.applied[0]!.uniforms.u_speed).toBeUndefined();
    expect(scene.applied[0]!.uniforms.u_glow?.value).toBe(0.5);
  });

  it("sets a timeline and keyframes, and removes them with the timeline", async () => {
    const scene = fakeScene();
    const env = { scene, history: noHistory, assets: noAssets, user: noUser, runtime: noRuntime, recipes: noRecipes, signal: new AbortController().signal };
    const keyed = await edit.run(
      edit.input.parse({ timeline: { duration: 6 }, keyframes: { u_speed: [{ time: 0, value: 0 }, { time: 6, value: 4, ease: "linear" }] } }),
      env,
    );
    expect(keyed.isError).toBeFalsy();
    expect(scene.applied[0]!.timeline).toEqual({ duration: 6, loop: true, preserveStateOnLoop: false });
    expect(scene.applied[0]!.keyframes.u_speed).toHaveLength(2);

    const invalid = await edit.run(edit.input.parse({ keyframes: { u_tint: [{ time: 0, value: 1 }] } }), env);
    expect(invalid.isError).toBe(true);
    expect(String(invalid.content)).toContain("only float and int");

    await edit.run(edit.input.parse({ timeline: null }), env);
    expect(scene.applied[1]!.timeline).toBeUndefined();
    expect(scene.applied[1]!.keyframes).toEqual({});
  });

  it("sets control groups and drops removed uniforms from them", async () => {
    const scene = fakeScene();
    const env = { scene, history: noHistory, assets: noAssets, user: noUser, runtime: noRuntime, recipes: noRecipes, signal: new AbortController().signal };
    await edit.run(edit.input.parse({ controls: [{ label: "Look", uniforms: ["u_speed", "u_tint"] }] }), env);
    expect(scene.applied[0]!.controls).toEqual([{ label: "Look", uniforms: ["u_speed", "u_tint"] }]);
    await edit.run(edit.input.parse({ uniforms: { u_speed: null } }), env);
    expect(scene.applied[1]!.controls).toEqual([{ label: "Look", uniforms: ["u_tint"] }]);
    await edit.run(edit.input.parse({ controls: null }), env);
    expect(scene.applied[2]!.controls).toBeUndefined();
  });

  it("rejects snippets that are missing or ambiguous without applying anything", async () => {
    const scene = fakeScene();
    const output = await edit.run(edit.input.parse({ edits: [{ phase: "setup", find: "does not exist", replace: "x" }] }), {
      scene,
      history: noHistory, assets: noAssets, user: noUser, runtime: noRuntime, recipes: noRecipes,
      signal: new AbortController().signal,
    });
    expect(output.isError).toBe(true);
    expect(String(output.content)).toContain("occurs 0 times");
    expect(scene.applied).toHaveLength(0);
  });
});

describe("ask_user", () => {
  const ask = USER_TOOLS[0]!;
  const options = [{ label: "Live" }, { label: "Timeline", description: "10 s sequence" }];
  const env = (answer: string | null, seen: string[] = []) =>
    stubEnv({
      scene: fakeScene(),
      user: {
        ask: async (question: string) => {
          seen.push(question);
          return answer;
        },
      },
    });

  it("returns the chosen option, a typed answer, or an error when stopped", async () => {
    const seen: string[] = [];
    const input = ask.input.parse({ question: "Interactive or timed?", options });
    expect((await ask.run(input, env("Timeline", seen))).content).toBe("The person chose: Timeline");
    expect(seen).toEqual(["Interactive or timed?"]);
    expect((await ask.run(input, env("both, please"))).content).toBe("The person answered in their own words: both, please");
    expect((await ask.run(input, env(null))).isError).toBe(true);
  });

  it("needs two to four options", () => {
    expect(ask.input.safeParse({ question: "q", options: [{ label: "only" }] }).success).toBe(false);
  });
});

describe("viewport_record", () => {
  const record = SCENE_TOOLS.find((t) => t.name === "viewport_record")!;

  it("defaults to the timeline length, and realtime means WebM", async () => {
    const scene = fakeScene();
    const env = stubEnv({ scene });
    const out = await record.run(record.input.parse({}), env);
    expect(String(out.content)).toContain("Recorded 150 frames at 1280x720 (5s, 30 fps) to recording.mp4 (2.0 MB)");
    scene.get().timeline = { duration: 8, loop: true, preserveStateOnLoop: false };
    await record.run(record.input.parse({ mode: "realtime", format: "mp4" }), env);
    expect(scene.recorded.map((r) => [r.format, r.mode, r.duration])).toEqual([
      ["mp4", "offline", 5],
      ["webm", "realtime", 8],
    ]);
  });
});

describe("tool specs", () => {
  it("produce object JSON schemas the APIs accept", async () => {
    const { toolSpec } = await import("./tools");
    for (const tool of SCENE_TOOLS) {
      const spec = toolSpec(tool);
      expect(spec.input_schema.type).toBe("object");
      expect(spec.input_schema).not.toHaveProperty("$schema");
    }
    const edit = toolSpec(SCENE_TOOLS.find((t) => t.name === "scene_edit")!);
    expect(Object.keys(edit.input_schema.properties as object)).toEqual(["edits", "uniforms", "inputs", "controls", "panel", "timeline", "keyframes"]);
  });
});
