import { useEffect, useRef } from "react";
import BRIDGE_SCRIPT from "../../constants/panelBridge.js";
import PANEL_THEME_CSS from "../../constants/panelTheme.js";

/**
 * Inline HTML control rendered as a mini-iframe inside a native controls panel.
 * - Theme CSS + bridge script auto-injected
 * - panel.setUniform() → onUniformChange → main undo history
 * - Engine state (uniforms, time, frame) forwarded every frame
 */
export default function HtmlControl({ ctrl, onUniformChange, engineRef, keyframeManagerRef }) {
  const iframeRef = useRef(null);
  const rafRef = useRef(null);
  const height = ctrl.height || 150;

  // Build srcdoc with theme + bridge + user HTML
  const srcDoc = PANEL_THEME_CSS + BRIDGE_SCRIPT + (ctrl.html || "");

  // Listen for postMessage from iframe
  useEffect(() => {
    const handler = (e) => {
      const iframe = iframeRef.current;
      if (!iframe || e.source !== iframe.contentWindow) return;
      if (e.data?.type === "panel:setUniform") {
        onUniformChange?.(e.data.uniform, e.data.value);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onUniformChange]);

  // Send engine state to iframe every frame
  useEffect(() => {
    const tick = () => {
      const iframe = iframeRef.current;
      const engine = engineRef?.current;
      if (iframe?.contentWindow && engine) {
        const ctx = engine.ctx || {};
        const km = keyframeManagerRef?.current;
        iframe.contentWindow.postMessage(
          {
            type: "panel:state",
            uniforms: ctx.uniforms || {},
            time: ctx.time || 0,
            frame: ctx.frame || 0,
            mouse: ctx.mouse || [0, 0, 0, 0],
            keyframes: km ? km.tracks : {},
          },
          "*"
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
