/**
 * Bridge script injected into every panel iframe.
 * Provides window.panel API for uniform control, timeline state, and keyframes.
 * Shared by CustomPanelNode (full HTML panels) and HtmlControl (inline html blocks).
 */

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

export default BRIDGE_SCRIPT;
