// Bridge exposed to the app UI as `window.siljangnim` (typed in studio/src/desktop.d.ts).
// Sandboxed preloads must be CommonJS. It runs in the top frame only; the
// scene iframe never gets it.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("siljangnim", {
  desktop: true,
  platform: process.platform,
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
});
