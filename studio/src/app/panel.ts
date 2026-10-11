// Custom panels: HTML/JS the agent writes, run in a sandboxed iframe with an
// opaque origin (srcdoc + sandbox="allow-scripts", no allow-same-origin) and
// a CSP with no network. The only things a panel can do are set uniforms and
// receive uniform/monitor values, through window.siljangnim.
//
// Messages use targetOrigin "*" (an opaque origin can't be named) and the
// receiver checks e.source instead (docs/m2.md#4).
import type { MonitorValue } from "../scene/protocol";
import type { Scene, UniformValue } from "../scene/schema";

export const PANEL_CHANNEL = "siljangnim-panel/1";

const PANEL_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:";

/** Runs inside the panel before the agent's HTML. */
const PANEL_API = `(() => {
  const CHANNEL = ${JSON.stringify(PANEL_CHANNEL)};
  const listeners = new Set();
  const api = {
    uniforms: {},
    monitors: {},
    setUniform(name, value) {
      parent.postMessage({ channel: CHANNEL, type: "set", name, value }, "*");
    },
    onValues(callback) {
      listeners.add(callback);
      callback({ uniforms: api.uniforms, monitors: api.monitors });
      return () => listeners.delete(callback);
    },
  };
  addEventListener("message", (e) => {
    if (e.source !== parent || !e.data || e.data.channel !== CHANNEL || e.data.type !== "values") return;
    api.uniforms = e.data.uniforms;
    api.monitors = e.data.monitors;
    for (const cb of listeners) { try { cb({ uniforms: api.uniforms, monitors: api.monitors }); } catch (err) { console.error(err); } }
  });
  window.siljangnim = api;
  parent.postMessage({ channel: CHANNEL, type: "ready" }, "*");
})();`;

/** The srcdoc for a panel: CSP, base styles that match the app, the API, then the agent's HTML. */
export function panelDocument(html: string): string {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${PANEL_CSP}">
<style>html,body{margin:0;background:transparent;color:#ece9e2;font:12px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color-scheme:dark}</style>
<script>${PANEL_API}</script></head><body>${html}</body></html>`;
}

export type PanelMessage = { type: "ready" } | { type: "set"; name: string; value: UniformValue };

/** Validate a message from a panel; returns the uniform to set (clamped to its range) or a reason it was dropped. */
export function readPanelMessage(data: unknown, scene: Scene): PanelMessage | { error: string } | null {
  if (typeof data !== "object" || data === null || (data as { channel?: unknown }).channel !== PANEL_CHANNEL) return null;
  const msg = data as { type?: unknown; name?: unknown; value?: unknown };
  if (msg.type === "ready") return { type: "ready" };
  if (msg.type !== "set" || typeof msg.name !== "string") return { error: "unknown panel message" };
  const def = scene.uniforms[msg.name];
  if (!def) return { error: `panel set unknown uniform "${msg.name}"` };
  const value = msg.value;
  switch (def.type) {
    case "float":
    case "int": {
      if (typeof value !== "number" || !Number.isFinite(value)) return { error: `${msg.name} needs a number` };
      let v = def.type === "int" ? Math.round(value) : value;
      if (def.min !== undefined) v = Math.max(def.min, v);
      if (def.max !== undefined) v = Math.min(def.max, v);
      return { type: "set", name: msg.name, value: v };
    }
    case "bool":
      return typeof value === "boolean" ? { type: "set", name: msg.name, value } : { error: `${msg.name} needs true or false` };
    default: {
      const size = Array.isArray(def.value) ? def.value.length : 0;
      if (!Array.isArray(value) || value.length !== size || !value.every((n) => typeof n === "number" && Number.isFinite(n))) {
        return { error: `${msg.name} needs an array of ${size} numbers` };
      }
      return { type: "set", name: msg.name, value: value as number[] };
    }
  }
}

/** What a panel receives: current uniform values and the latest monitor values. */
export function panelValues(uniforms: Record<string, UniformValue>, monitors: Record<string, { value: MonitorValue }>) {
  return { channel: PANEL_CHANNEL, type: "values" as const, uniforms, monitors: Object.fromEntries(Object.entries(monitors).map(([k, m]) => [k, m.value])) };
}
