// Entry point of scene.html. Answers RPC requests from the app window only.
import { CHANNEL, isEnvelope, type Envelope, type EventName, type MethodName, type RuntimeMethods } from "../protocol";
import { SceneRunner } from "./runner";

const parentOrigin = new URLSearchParams(location.search).get("parent");
const root = document.getElementById("stage");

if (!parentOrigin || window.parent === window || !root) {
  document.body.textContent = "This page runs inside Siljangnim.";
} else {
  const post = (envelope: Envelope) => window.parent.postMessage(envelope, parentOrigin);
  const emit = (event: EventName, data: unknown) => post({ channel: CHANNEL, kind: "event", event, data });
  const runner = new SceneRunner(root, emit);

  window.addEventListener("error", (e) => runner.reportUncaught(e.error ?? e.message));
  window.addEventListener("unhandledrejection", (e) => runner.reportUncaught(e.reason));

  const handlers: { [M in MethodName]: (params: RuntimeMethods[M]["params"]) => Promise<RuntimeMethods[M]["result"]> | RuntimeMethods[M]["result"] } = {
    load: (p) => runner.load(p.scene, p.assets),
    setUniform: (p) => runner.setUniform(p.name, p.value),
    transport: (p) => runner.transport(p.action, p.time),
    setTimeline: (p) => runner.setTimeline(p.timeline, p.keyframes),
    osc: (p) => runner.osc(p),
    capture: (p) => runner.capture(p.maxSize),
    status: () => runner.status(),
    record: (p) => runner.recordScene(p),
    recordCancel: () => runner.cancelRecording(),
    resolution: (p) => runner.setResolution(p.size),
  };

  window.addEventListener("message", async (e: MessageEvent) => {
    if (e.source !== window.parent || e.origin !== parentOrigin || !isEnvelope(e.data)) return;
    const msg = e.data;
    if (msg.kind !== "request") return;
    const handler = handlers[msg.method] as ((params: unknown) => unknown) | undefined;
    if (!handler) {
      post({ channel: CHANNEL, kind: "response", id: msg.id, ok: false, error: `unknown method ${msg.method}` });
      return;
    }
    try {
      const result = await handler(msg.params);
      post({ channel: CHANNEL, kind: "response", id: msg.id, ok: true, result });
    } catch (err) {
      post({ channel: CHANNEL, kind: "response", id: msg.id, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  emit("ready", {});
}
