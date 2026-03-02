import { useEffect, useRef, useCallback } from "react";
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
};

/* ── Bridge script injected into every custom panel iframe ──────── */

const BRIDGE_SCRIPT = `
<script>
window.panel = {
  // Uniforms
  setUniform(name, value) {
    window.parent.postMessage({ type: 'panel:setUniform', uniform: name, value: value }, '*');
  },
  uniforms: {},

  // Timeline
  time: 0,
  frame: 0,
  mouse: [0, 0, 0, 0],
  duration: 30,
  loop: true,

  // Keyframes: { uniformName: [{ time, value, inTangent, outTangent, linear }] }
  keyframes: {},

  // Set keyframes for a uniform track
  setKeyframes(uniform, keyframeArray) {
    window.parent.postMessage({ type: 'panel:setKeyframes', uniform: uniform, keyframes: keyframeArray }, '*');
  },

  // Clear all keyframes for a uniform
  clearKeyframes(uniform) {
    window.parent.postMessage({ type: 'panel:setKeyframes', uniform: uniform, keyframes: [] }, '*');
  },

  // Set timeline duration
  setDuration(d) {
    window.parent.postMessage({ type: 'panel:setDuration', duration: d }, '*');
  },

  // Set timeline loop
  setLoop(l) {
    window.parent.postMessage({ type: 'panel:setLoop', loop: l }, '*');
  },

  onUpdate: null,
};
window.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'panel:state') {
    window.panel.uniforms = e.data.uniforms || window.panel.uniforms;
    window.panel.time = e.data.time !== undefined ? e.data.time : window.panel.time;
    window.panel.frame = e.data.frame !== undefined ? e.data.frame : window.panel.frame;
    window.panel.mouse = e.data.mouse || window.panel.mouse;
    window.panel.duration = e.data.duration !== undefined ? e.data.duration : window.panel.duration;
    window.panel.loop = e.data.loop !== undefined ? e.data.loop : window.panel.loop;
    if (e.data.keyframes !== undefined) window.panel.keyframes = e.data.keyframes;
    if (typeof window.panel.onUpdate === 'function') {
      window.panel.onUpdate(window.panel);
    }
  }
});
<\/script>
`;

function injectBridge(html) {
  // Insert bridge script right before </head> or at the start of <body> or prepend
  if (html.includes("</head>")) {
    return html.replace("</head>", BRIDGE_SCRIPT + "</head>");
  }
  if (html.includes("<body")) {
    return html.replace(/<body([^>]*)>/, `<body$1>${BRIDGE_SCRIPT}`);
  }
  return BRIDGE_SCRIPT + html;
}

/* ── CustomPanelNode ────────────────────────────────────────────── */

export default function CustomPanelNode({ data }) {
  const {
    title, html, controls,
    onUniformChange, engineRef, onClose,
    keyframeManagerRef, onKeyframesChange, onDurationChange, onLoopChange,
    onOpenKeyframeEditor,
    duration, loop,
  } = data;
  const iframeRef = useRef(null);
  const rafRef = useRef(null);
  const isNativeControls = !!controls;

  // Listen for postMessage from iframe (only for HTML panels)
  useEffect(() => {
    if (isNativeControls) return;
    const handler = (e) => {
      const iframe = iframeRef.current;
      if (!iframe || e.source !== iframe.contentWindow) return;
      if (e.data?.type === "panel:setUniform") {
        onUniformChange?.(e.data.uniform, e.data.value);
      } else if (e.data?.type === "panel:setKeyframes") {
        onKeyframesChange?.(e.data.uniform, e.data.keyframes || []);
      } else if (e.data?.type === "panel:setDuration") {
        if (typeof e.data.duration === "number") onDurationChange?.(e.data.duration);
      } else if (e.data?.type === "panel:setLoop") {
        if (typeof e.data.loop === "boolean") onLoopChange?.(e.data.loop);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [isNativeControls, onUniformChange, onKeyframesChange, onDurationChange, onLoopChange]);

  // Send engine state to iframe every frame (only for HTML panels)
  useEffect(() => {
    if (isNativeControls) return;
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
            duration: duration ?? 30,
            loop: loop ?? true,
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
  }, [isNativeControls, engineRef, keyframeManagerRef, duration, loop]);

  const handleClose = useCallback(() => {
    onClose?.();
  }, [onClose]);

  return (
    <div className="w-full h-full bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl flex flex-col overflow-hidden">
      <NodeResizer
        minWidth={200}
        minHeight={150}
        lineStyle={{ borderColor: "transparent" }}
        handleStyle={{ opacity: 0 }}
      />
      <div className="px-4 py-2 bg-zinc-800 border-b border-zinc-700 text-sm font-semibold text-zinc-300 cursor-grab flex items-center justify-between">
        <span>{title || "Custom Panel"}</span>
        <button
          onClick={handleClose}
          className="text-zinc-500 hover:text-zinc-200 transition-colors text-lg leading-none"
          title="Close panel"
        >
          ×
        </button>
      </div>
      <div className="flex-1 nodrag nowheel overflow-auto">
        {isNativeControls ? (
          <div className="p-3 space-y-1">
            {controls.map((ctrl, i) => {
              const Comp = CONTROL_MAP[ctrl.type];
              if (!Comp) return null;
              return (
                <Comp
                  key={ctrl.uniform || `sep_${i}`}
                  ctrl={ctrl}
                  onUniformChange={onUniformChange}
                  keyframeManagerRef={keyframeManagerRef}
                  engineRef={engineRef}
                  onOpenKeyframeEditor={onOpenKeyframeEditor}
                />
              );
            })}
          </div>
        ) : (
          <iframe
            ref={iframeRef}
            srcDoc={injectBridge(html || "")}
            sandbox="allow-scripts"
            className="w-full h-full border-0"
            style={{ background: "#fff" }}
          />
        )}
      </div>
    </div>
  );
}
