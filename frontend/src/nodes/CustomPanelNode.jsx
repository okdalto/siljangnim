import { useState, useEffect, useRef, useCallback, memo } from "react";
import { NodeResizer } from "@xyflow/react";

import SliderControl from "../components/controls/SliderControl.jsx";
import ColorControl from "../components/controls/ColorControl.jsx";
import ToggleControl from "../components/controls/ToggleControl.jsx";
import ButtonControl from "../components/controls/ButtonControl.jsx";
import DropdownControl from "../components/controls/DropdownControl.jsx";
import Pad2dControl from "../components/controls/Pad2dControl.jsx";
import SeparatorControl from "../components/controls/SeparatorControl.jsx";
import TextControl from "../components/controls/TextControl.jsx";
import GraphControl from "../components/controls/GraphControl.jsx";
import HtmlControl from "../components/controls/HtmlControl.jsx";
import BufferPreviewControl from "../components/controls/BufferPreviewControl.jsx";
import Vec3Control from "../components/controls/Vec3Control.jsx";
import MonitorControl from "../components/controls/MonitorControl.jsx";
import ImagePickerControl from "../components/controls/ImagePickerControl.jsx";
import CodeControl from "../components/controls/CodeControl.jsx";
import PresetControl from "../components/controls/PresetControl.jsx";
import CollapsibleGroupControl from "../components/controls/CollapsibleGroupControl.jsx";
import BRIDGE_SCRIPT from "../constants/panelBridge.js";
import PANEL_THEME_CSS from "../constants/panelTheme.js";
import { registerPanelIframe, unregisterPanelIframe, relayBroadcast } from "../engine/panelBroadcast.js";

/* ── Control type → component mapping ───────────────────────────── */

const CONTROL_MAP = {
  slider: SliderControl,
  color: ColorControl,
  toggle: ToggleControl,
  button: ButtonControl,
  dropdown: DropdownControl,
  pad2d: Pad2dControl,
  separator: SeparatorControl,
  text: TextControl,
  graph: GraphControl,
  html: HtmlControl,
  buffer_preview: BufferPreviewControl,
  vec3: Vec3Control,
  monitor: MonitorControl,
  image_picker: ImagePickerControl,
  code: CodeControl,
  preset: PresetControl,
  group: CollapsibleGroupControl,
};

/* ── Inject bridge + theme CSS into HTML panel iframe ─────────── */

const INJECT_PAYLOAD = PANEL_THEME_CSS + BRIDGE_SCRIPT;

function injectBridge(html) {
  if (html.includes("</head>")) {
    return html.replace("</head>", INJECT_PAYLOAD + "</head>");
  }
  if (html.includes("<body")) {
    return html.replace(/<body([^>]*)>/, `<body$1>${INJECT_PAYLOAD}`);
  }
  return INJECT_PAYLOAD + html;
}

/* ── Download helper ──────────────────────────────────────────── */

function triggerDownload(filename, data, mimeType) {
  // Sanitize filename: strip path separators and dangerous chars
  const safeName = (filename || "export.txt").replace(/[/\\:*?"<>|]/g, "_").replace(/^\.+/, "_");
  const blob = new Blob([data], { type: mimeType || "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = safeName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ── Panel-to-panel broadcast relay ───────────────────────────── */


/* ── CustomPanelNode ────────────────────────────────────────────── */

function CustomPanelNode({ data, standalone = false, hideHeader = false }) {
  const {
    title, html, url, controls,
    onUniformChange, engineRef, onClose,
    keyframeManagerRef, onKeyframesChange, onDurationChange, onLoopChange,
    onOpenKeyframeEditor,
    duration, loop,
    onCustomMessage,
  } = data;
  const [collapsed, setCollapsed] = useState(false);
  const iframeRef = useRef(null);
  const rafRef = useRef(null);
  const isNativeControls = !!controls;
  const isUrl = !!url && !html;

  // Register/unregister iframe for panel-to-panel broadcast
  useEffect(() => {
    if (isNativeControls) return;
    const iframe = iframeRef.current;
    if (!iframe) return;
    registerPanelIframe(iframe);
    return () => unregisterPanelIframe(iframe);
  }, [isNativeControls]);

  // Listen for postMessage from iframe (HTML + URL panels)
  useEffect(() => {
    if (isNativeControls) return;
    const handler = (e) => {
      const iframe = iframeRef.current;
      if (!iframe || e.source !== iframe.contentWindow) return;
      const d = e.data;
      if (!d?.type) return;

      switch (d.type) {
        case "panel:setUniform":
          onUniformChange?.(d.uniform, d.value);
          break;
        case "panel:setKeyframes":
          onKeyframesChange?.(d.uniform, d.keyframes || []);
          break;
        case "panel:setDuration":
          if (typeof d.duration === "number") onDurationChange?.(d.duration);
          break;
        case "panel:setLoop":
          if (typeof d.loop === "boolean") onLoopChange?.(d.loop);
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
        case "panel:customMessage":
          onCustomMessage?.(d.msgType, d.data);
          break;
        case "panel:download":
          triggerDownload(d.filename, d.data, d.mimeType);
          break;
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
  }, [isNativeControls, onUniformChange, onKeyframesChange, onDurationChange, onLoopChange, onCustomMessage, engineRef]);

  // Send engine state to iframe every frame (HTML + URL panels)
  useEffect(() => {
    if (isNativeControls) return;
    let stateCache = {};
    let stateFrame = 0;
    const STATE_INTERVAL = 10; // serialize ctx.state every N frames to limit perf cost
    const STATE_MAX_SIZE = 100_000; // skip if serialized state > 100KB

    const tick = () => {
      const iframe = iframeRef.current;
      const engine = engineRef?.current;
      if (iframe?.contentWindow && engine) {
        const ctx = engine.ctx || {};
        const km = keyframeManagerRef?.current;

        // Throttled state serialization
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
            duration: duration ?? 30,
            loop: loop ?? true,
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
  }, [isNativeControls, engineRef, keyframeManagerRef, duration, loop]);

  const handleClose = useCallback(() => {
    onClose?.();
  }, [onClose]);

  // Render a single control (used for both top-level and nested group children)
  const renderControl = useCallback((ctrl, i) => {
    if (ctrl.type === "group") {
      return (
        <CollapsibleGroupControl
          key={ctrl.label || `group_${i}`}
          ctrl={ctrl}
          renderChild={renderControl}
        />
      );
    }
    const Comp = CONTROL_MAP[ctrl.type];
    if (!Comp) return null;
    return (
      <Comp
        key={ctrl.uniform || `ctrl_${i}`}
        ctrl={ctrl}
        onUniformChange={onUniformChange}
        keyframeManagerRef={keyframeManagerRef}
        engineRef={engineRef}
        onOpenKeyframeEditor={onOpenKeyframeEditor}
      />
    );
  }, [onUniformChange, keyframeManagerRef, engineRef, onOpenKeyframeEditor]);

  return (
    <div
      className={`node-container w-full ${collapsed ? "h-auto" : "h-full"} flex flex-col overflow-hidden ${standalone ? "" : "rounded-xl shadow-2xl"}`}
      style={standalone ? { background: "var(--node-bg)" } : { background: "var(--node-bg)", border: "1px solid var(--node-border)" }}
    >
      {!standalone && (
        <NodeResizer
          minWidth={200}
          minHeight={150}
          lineStyle={{ borderColor: "transparent" }}
          handleStyle={{ opacity: 0 }}
        />
      )}
      {!(standalone && hideHeader) && (
      <div
        className={`px-4 py-2 text-sm font-semibold flex items-center justify-between ${standalone ? "" : "cursor-grab"}`}
        style={{ background: "var(--node-header-bg)", borderBottom: "1px solid var(--node-border)", color: "var(--chrome-text)" }}
        onDoubleClick={() => setCollapsed((v) => !v)}
      >
        <span>{title || "Custom Panel"}</span>
        <button
          onClick={handleClose}
          className="transition-colors text-lg leading-none"
          style={{ color: "var(--chrome-text-muted)" }}
          title="Close panel"
        >
          ×
        </button>
      </div>
      )}
      {!collapsed && <div className="flex-1 nodrag nowheel overflow-auto">
        {isNativeControls ? (
          <div className="p-3 space-y-1">
            {controls.map((ctrl, i) => renderControl(ctrl, i))}
          </div>
        ) : isUrl ? (
          <iframe
            ref={iframeRef}
            src={url}
            sandbox="allow-scripts"
            className="w-full h-full border-0"
            style={{ background: "var(--node-bg)" }}
          />
        ) : (
          <iframe
            ref={iframeRef}
            srcDoc={injectBridge(html || "")}
            sandbox="allow-scripts"
            className="w-full h-full border-0"
            style={{ background: "var(--node-bg)" }}
          />
        )}
      </div>}
    </div>
  );
}

export default memo(CustomPanelNode);
