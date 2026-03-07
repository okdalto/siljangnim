import { useEffect, useRef } from "react";
import BRIDGE_SCRIPT from "../../constants/panelBridge.js";
import PANEL_THEME_CSS from "../../constants/panelTheme.js";
import { registerPanelIframe, unregisterPanelIframe, relayBroadcast } from "../../engine/panelBroadcast.js";

/**
 * Inline HTML control rendered as a mini-iframe inside a native controls panel.
 * - Theme CSS + bridge script auto-injected
 * - panel.setUniform() -> onUniformChange -> main undo history
 * - Engine state (uniforms, time, frame, state) forwarded every frame
 * - Custom messaging, download, capture, panel-to-panel broadcast
 */
export default function HtmlControl({ ctrl, onUniformChange, engineRef, keyframeManagerRef }) {
  const iframeRef = useRef(null);
  const rafRef = useRef(null);
  const height = ctrl.height || 150;

  const srcDoc = PANEL_THEME_CSS + BRIDGE_SCRIPT + (ctrl.html || "");

  // Register for panel-to-panel broadcast
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    registerPanelIframe(iframe);
    return () => unregisterPanelIframe(iframe);
  }, []);

  // Listen for postMessage from iframe
  useEffect(() => {
    const handler = (e) => {
      const iframe = iframeRef.current;
      if (!iframe || e.source !== iframe.contentWindow) return;
      const d = e.data;
      if (!d?.type) return;

      switch (d.type) {
        case "panel:setUniform":
          onUniformChange?.(d.uniform, d.value);
          break;
        case "panel:setState": {
          const engine = engineRef?.current;
          const key = d.key;
          if (engine?.ctx?.state && key
              && typeof key === "string"
              && key !== "__proto__" && key !== "constructor" && key !== "prototype") {
            engine.ctx.state[key] = d.value;
          }
          break;
        }
        case "panel:download": {
          const safeName = (d.filename || "export.txt").replace(/[/\\:*?"<>|]/g, "_").replace(/^\.+/, "_");
          const blob = new Blob([d.data], { type: d.mimeType || "text/plain" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = safeName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          break;
        }
        case "panel:captureCanvas": {
          const engine = engineRef?.current;
          if (engine?.canvas) {
            try {
              const dataUrl = engine.canvas.toDataURL("image/png");
              iframe.contentWindow.postMessage(
                { type: "panel:captureResult", dataUrl },
                window.location.origin
              );
            } catch { /* tainted canvas */ }
          }
          break;
        }
        case "panel:broadcast":
          relayBroadcast(d.channel, d.data, iframe);
          break;
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onUniformChange, engineRef]);

  // Send engine state to iframe every frame (throttled state serialization)
  useEffect(() => {
    let stateCache = {};
    let stateFrame = 0;
    const STATE_INTERVAL = 10;
    const STATE_MAX_SIZE = 100_000;

    const tick = () => {
      const iframe = iframeRef.current;
      const engine = engineRef?.current;
      if (iframe?.contentWindow && engine) {
        const ctx = engine.ctx || {};
        const km = keyframeManagerRef?.current;

        stateFrame++;
        if (stateFrame % STATE_INTERVAL === 0 && ctx.state) {
          try {
            const raw = JSON.stringify(ctx.state, (_k, v) => {
              if (v instanceof WebGLBuffer || v instanceof WebGLTexture ||
                  v instanceof WebGLProgram || v instanceof WebGLFramebuffer) return undefined;
              if (typeof v === "function") return undefined;
              return v;
            });
            if (raw.length <= STATE_MAX_SIZE) {
              stateCache = JSON.parse(raw);
            }
          } catch { /* keep previous cache */ }
        }

        iframe.contentWindow.postMessage(
          {
            type: "panel:state",
            uniforms: ctx.uniforms || {},
            time: ctx.time || 0,
            frame: ctx.frame || 0,
            mouse: ctx.mouse || [0, 0, 0, 0],
            keyframes: km ? km.tracks : {},
            state: stateCache,
          },
          window.location.origin
        );
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [engineRef, keyframeManagerRef]);

  return (
    <iframe
      ref={iframeRef}
      srcDoc={srcDoc}
      sandbox="allow-scripts"
      className="w-full border-0 rounded"
      style={{ height, background: "#18181b" }}
    />
  );
}
