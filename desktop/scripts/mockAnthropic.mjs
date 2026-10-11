// A scripted stand-in for the Anthropic Messages API, used by the smoke test
// to drive the real agent loop end to end without a key or network access.
//
// Script: broken scene → (shader error comes back) → fixed scene →
// viewport_capture → (image comes back) → history_list → final text.
import { createServer } from "node:http";

export const FINAL_TEXT = "E2E done: a calm blue field.";
export const EXPECTED_REQUESTS = 5;

const VERTEX = "ctx.utils.FULLSCREEN_VERTEX_SHADER";
const fragment = (body) => `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec3 u_color;
void main() {
  ${body}
}`;
const scene = (fragBody) => ({
  version: 2,
  backend: "webgl2",
  script: {
    setup: `ctx.state.p = ctx.utils.createProgram(${VERTEX}, ${JSON.stringify(fragment(fragBody))});`,
    render: "ctx.utils.drawFullscreen(ctx.state.p);",
    cleanup: "",
  },
  uniforms: { u_color: { type: "color", value: [0.1, 0.35, 1.0], label: "Color" } },
  inputs: [],
});

const BROKEN = scene("outColor = vec4(u_colour, 1.0);");
const FIXED = scene("outColor = vec4(u_color, 1.0);");

function lastToolResult(body) {
  const last = body.messages.at(-1);
  if (last?.role !== "user" || !Array.isArray(last.content)) return null;
  return last.content.find((b) => b.type === "tool_result") ?? null;
}

function resultText(result) {
  if (!result) return "";
  return typeof result.content === "string" ? result.content : result.content.map((c) => c.text ?? `[${c.type}]`).join("\n");
}

/** Which scripted turn to play, plus checks on what the client sent. */
function plan(body, step, checks) {
  if (step === 0) {
    checks.systemCached = Array.isArray(body.system) && body.system[0]?.cache_control?.type === "ephemeral";
    checks.toolsEager = body.tools?.length > 0 && body.tools.every((t) => t.eager_input_streaming === true);
    checks.adaptiveThinking = body.thinking?.type === "adaptive";
    checks.stream = body.stream === true;
    return { tool: { name: "scene_write", input: { scene: BROKEN } } };
  }
  const result = lastToolResult(body);
  if (step === 1) {
    checks.shaderErrorReturned = result?.is_error === true && /\[shader\/fragment\] line \d+/.test(resultText(result));
    return { text: "Fixing the typo.", tool: { name: "scene_write", input: { scene: FIXED } } };
  }
  if (step === 2) {
    checks.fixedSceneLoaded = !result?.is_error && /without errors/.test(resultText(result));
    return { tool: { name: "viewport_capture", input: { max_size: 256 } } };
  }
  if (step === 3) {
    checks.captureReturnedImage = Array.isArray(result?.content) && result.content.some((c) => c.type === "image");
    return { tool: { name: "history_list", input: {} } };
  }
  // Only the project's first scene is saved while the run is still going.
  checks.historyListed = !result?.is_error && /"Initial scene"\s+<- HEAD/.test(resultText(result));
  // Assistant turns must come back unchanged (thinking blocks included).
  checks.thinkingEchoed = body.messages.filter((m) => m.role === "assistant").every((m) => m.content[0]?.type === "thinking");
  return { text: FINAL_TEXT };
}

function sse(res, events) {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  for (const [event, data] of events) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  res.end();
}

function turnEvents(step, { text, tool }, model) {
  const events = [
    ["message_start", { type: "message_start", message: { id: `msg_mock_${step}`, type: "message", role: "assistant", model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } }],
  ];
  let index = 0;
  // A summarized thinking block first, like the real API with display: "summarized".
  events.push(["content_block_start", { type: "content_block_start", index, content_block: { type: "thinking", thinking: "", signature: "" } }]);
  events.push(["content_block_delta", { type: "content_block_delta", index, delta: { type: "thinking_delta", thinking: "Planning the scene." } }]);
  events.push(["content_block_delta", { type: "content_block_delta", index, delta: { type: "signature_delta", signature: `sig${step}` } }]);
  events.push(["content_block_stop", { type: "content_block_stop", index }]);
  index++;
  if (text) {
    events.push(["content_block_start", { type: "content_block_start", index, content_block: { type: "text", text: "" } }]);
    events.push(["content_block_delta", { type: "content_block_delta", index, delta: { type: "text_delta", text } }]);
    events.push(["content_block_stop", { type: "content_block_stop", index }]);
    index++;
  }
  if (tool) {
    const json = JSON.stringify(tool.input);
    events.push(["content_block_start", { type: "content_block_start", index, content_block: { type: "tool_use", id: `toolu_mock_${step}`, name: tool.name, input: {} } }]);
    // Stream the input in pieces, as eager input streaming does.
    for (let i = 0; i < json.length; i += 200) {
      events.push(["content_block_delta", { type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: json.slice(i, i + 200) } }]);
    }
    events.push(["content_block_stop", { type: "content_block_stop", index }]);
  }
  events.push(["message_delta", { type: "message_delta", delta: { stop_reason: tool ? "tool_use" : "end_turn", stop_sequence: null }, usage: { output_tokens: 42 } }]);
  events.push(["message_stop", { type: "message_stop" }]);
  return events;
}

export async function startMockAnthropic(expectedKey) {
  const checks = { requests: 0 };
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      if (req.method !== "POST" || !req.url.startsWith("/v1/messages")) {
        res.writeHead(404).end();
        return;
      }
      checks.keyForwarded = req.headers["x-api-key"] === expectedKey;
      checks.tokenNotForwarded = !("x-siljangnim-token" in req.headers);
      const body = JSON.parse(raw);
      const step = checks.requests++;
      sse(res, turnEvents(step, plan(body, step, checks), body.model));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    checks,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
