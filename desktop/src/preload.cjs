// Bridge exposed to the app UI as `window.siljangnim` (typed in studio/src/desktop.d.ts).
// Sandboxed preloads must be CommonJS. It runs in the top frame only; the
// scene iframe never gets it.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("siljangnim", {
  desktop: true,
  platform: process.platform,
  updates: {
    info: () => ipcRenderer.invoke("updates:info"),
    check: () => ipcRenderer.invoke("updates:check"),
    download: () => ipcRenderer.invoke("updates:download"),
    releases: () => ipcRenderer.invoke("updates:releases"),
  },
  hub: {
    info: () => ipcRenderer.invoke("hub:info"),
    onStatus(callback) {
      const listener = (_event, info) => callback(info);
      ipcRenderer.on("hub:status", listener);
      return () => ipcRenderer.removeListener("hub:status", listener);
    },
  },
  llm: {
    /** Per-launch token the app sends with LLM requests (see desktop/src/protocol.js). */
    token: () => ipcRenderer.invoke("llm:token"),
  },
  keys: {
    status: () => ipcRenderer.invoke("keys:status"),
    set: (provider, key) => ipcRenderer.invoke("keys:set", provider, key),
  },
  project: {
    /** Write the open project to ~/Siljangnim/projects/<folder>/ and open it in Finder/Explorer. */
    reveal: (folder, files) => ipcRenderer.invoke("project:reveal", folder, files),
  },
  agent: {
    /** An agent's MCP bridge asked to use this window as its viewer. */
    onAttach(callback) {
      const listener = (_event, request) => callback(request);
      ipcRenderer.on("agent:attach", listener);
      return () => ipcRenderer.removeListener("agent:attach", listener);
    },
    /** A request that arrived before the UI was listening. */
    pending: () => ipcRenderer.invoke("agent:pending"),
  },
  localAgent: {
    /** Whether Claude Code / Codex are installed and signed in. */
    detect: () => ipcRenderer.invoke("localAgent:detect"),
    /** Run the official installer ("install") or the CLI's sign-in ("login"). */
    setup: (engine, action) => ipcRenderer.invoke("localAgent:setup", engine, action),
    /** Start a chat run; resolves with its id. Events arrive through onEvent. */
    run: (engine, prompt, sessionId) => ipcRenderer.invoke("localAgent:run", engine, prompt, sessionId),
    stop: (id) => ipcRenderer.invoke("localAgent:stop", id),
    onEvent(callback) {
      const listener = (_event, id, payload) => callback(id, payload);
      ipcRenderer.on("localAgent:event", listener);
      return () => ipcRenderer.removeListener("localAgent:event", listener);
    },
  },
});
