// Bridge exposed to the renderer as `window.siljangnim`.
// Sandboxed preloads must be CommonJS.
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
});
