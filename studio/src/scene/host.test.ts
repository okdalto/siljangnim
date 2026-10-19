import { afterEach, expect, it, vi } from "vitest";
import { SceneHost } from "./host";
import { CHANNEL } from "./protocol";

// A navigating iframe retains its WindowProxy: old-document messages can arrive after restart.
function fixture() {
  const events = new EventTarget();
  const postMessage = vi.fn();
  const iframe = { src: "", contentWindow: { postMessage }, setAttribute() {}, remove() {} };
  vi.stubGlobal("window", events);
  vi.stubGlobal("document", { createElement: () => iframe });
  const host = new SceneHost({ appendChild() {} } as unknown as HTMLElement, new URL("https://scene.test/scene.html"));
  const ready = (src: string) => {
    const event = new Event("message");
    Object.assign(event, { source: iframe.contentWindow, origin: "https://scene.test", data: {
      channel: CHANNEL, kind: "event", event: "ready", data: { documentId: new URL(src).searchParams.get("documentId") },
    } });
    events.dispatchEvent(event);
  };
  return { host, iframe, postMessage, ready };
}
afterEach(() => vi.unstubAllGlobals());

it("ignores readiness from the document being replaced", async () => {
  const { host, iframe, ready } = fixture();
  const old = iframe.src;
  let resolved = false;
  const restarted = host.restart().then(() => { resolved = true; });
  ready(old);
  await Promise.resolve();
  expect(resolved).toBe(false);
  ready(iframe.src);
  await restarted;
  expect(resolved).toBe(true);
  host.destroy();
});

it("requests waiting before restart wait for the replacement document", async () => {
  const { host, iframe, ready, postMessage } = fixture();
  const old = iframe.src;
  const request = host.request("status", {});
  const rejected = request.catch(() => undefined);
  void host.restart();
  ready(old);
  await Promise.resolve();
  await Promise.resolve();
  expect(postMessage).not.toHaveBeenCalled();
  ready(iframe.src);
  await Promise.resolve();
  await Promise.resolve();
  expect(postMessage).toHaveBeenCalledTimes(1);
  host.destroy();
  await rejected;
});

it("rechecks readiness when restart happens after ready but before the request resumes", async () => {
  const { host, iframe, ready, postMessage } = fixture();
  ready(iframe.src);
  const request = host.request("status", {});
  const rejected = request.catch(() => undefined);
  void host.restart();
  await Promise.resolve();
  await Promise.resolve();
  expect(postMessage).not.toHaveBeenCalled();
  ready(iframe.src);
  await Promise.resolve();
  await Promise.resolve();
  expect(postMessage).toHaveBeenCalledTimes(1);
  host.destroy();
  await rejected;
});
