/**
 * Bridge script injected into every panel iframe.
 * Provides window.panel API for uniform control, timeline state, keyframes,
 * custom messaging, ctx.state binding, file export, canvas capture,
 * and panel-to-panel communication.
 * Shared by CustomPanelNode (full HTML panels) and HtmlControl (inline html blocks).
 */

const BRIDGE_SCRIPT = `
<script>
var _parentOrigin = window.location.origin;
if (!_parentOrigin || _parentOrigin === 'null') _parentOrigin = 'http://localhost';
var _messageHandlers = {};
var _channelListeners = {};

window.panel = {
  // ── Uniforms ──────────────────────────────────────────
  setUniform(name, value) {
    window.parent.postMessage({ type: 'panel:setUniform', uniform: name, value: value }, _parentOrigin);
  },
  uniforms: {},

  // ── Timeline ──────────────────────────────────────────
  time: 0,
  frame: 0,
  mouse: [0, 0, 0, 0],
  duration: 30,
  loop: true,

  // ── Keyframes ─────────────────────────────────────────
  keyframes: {},

  setKeyframes(uniform, keyframeArray) {
    window.parent.postMessage({ type: 'panel:setKeyframes', uniform: uniform, keyframes: keyframeArray }, _parentOrigin);
  },

  clearKeyframes(uniform) {
    window.parent.postMessage({ type: 'panel:setKeyframes', uniform: uniform, keyframes: [] }, _parentOrigin);
  },

  setDuration(d) {
    window.parent.postMessage({ type: 'panel:setDuration', duration: d }, _parentOrigin);
  },

  setLoop(l) {
    window.parent.postMessage({ type: 'panel:setLoop', loop: l }, _parentOrigin);
  },

  // ── ctx.state binding (read-only from engine) ────────
  state: {},

  setState(key, value) {
    window.parent.postMessage({ type: 'panel:setState', key: key, value: value }, _parentOrigin);
  },

  // ── Custom messaging ─────────────────────────────────
  sendMessage(msgType, data) {
    window.parent.postMessage({ type: 'panel:customMessage', msgType: msgType, data: data }, _parentOrigin);
  },

  onMessage(msgType, callback) {
    if (!_messageHandlers[msgType]) _messageHandlers[msgType] = [];
    _messageHandlers[msgType].push(callback);
  },

  offMessage(msgType, callback) {
    if (!_messageHandlers[msgType]) return;
    if (callback) {
      _messageHandlers[msgType] = _messageHandlers[msgType].filter(function(h) { return h !== callback; });
    } else {
      delete _messageHandlers[msgType];
    }
  },

  // ── File export ──────────────────────────────────────
  download(filename, data, mimeType) {
    var payload;
    if (typeof data === 'string') {
      payload = data;
    } else {
      try { payload = JSON.stringify(data, null, 2); } catch(e) { payload = String(data); }
    }
    window.parent.postMessage({
      type: 'panel:download',
      filename: filename || 'export.txt',
      data: payload,
      mimeType: mimeType || 'text/plain'
    }, _parentOrigin);
  },

  // ── Canvas capture ───────────────────────────────────
  captureCanvas(callback) {
    window.panel._captureCallback = callback;
    window.parent.postMessage({ type: 'panel:captureCanvas' }, _parentOrigin);
  },

  // ── Panel-to-panel communication (event bus) ─────────
  broadcast(channel, data) {
    window.parent.postMessage({ type: 'panel:broadcast', channel: channel, data: data }, _parentOrigin);
  },

  listen(channel, callback) {
    if (!_channelListeners[channel]) _channelListeners[channel] = [];
    _channelListeners[channel].push(callback);
  },

  unlisten(channel, callback) {
    if (!_channelListeners[channel]) return;
    if (callback) {
      _channelListeners[channel] = _channelListeners[channel].filter(function(h) { return h !== callback; });
    } else {
      delete _channelListeners[channel];
    }
  },

  // ── Callbacks ────────────────────────────────────────
  onUpdate: null,
  _captureCallback: null,
};

window.addEventListener('message', function(e) {
  if (e.origin !== _parentOrigin) return;
  if (!e.data || !e.data.type) return;

  if (e.data.type === 'panel:state') {
    window.panel.uniforms = e.data.uniforms || window.panel.uniforms;
    window.panel.time = e.data.time !== undefined ? e.data.time : window.panel.time;
    window.panel.frame = e.data.frame !== undefined ? e.data.frame : window.panel.frame;
    window.panel.mouse = e.data.mouse || window.panel.mouse;
    window.panel.duration = e.data.duration !== undefined ? e.data.duration : window.panel.duration;
    window.panel.loop = e.data.loop !== undefined ? e.data.loop : window.panel.loop;
    if (e.data.keyframes !== undefined) window.panel.keyframes = e.data.keyframes;
    if (e.data.state !== undefined) window.panel.state = e.data.state;
    if (typeof window.panel.onUpdate === 'function') {
      window.panel.onUpdate(window.panel);
    }
  }
  else if (e.data.type === 'panel:customMessage') {
    var handlers = _messageHandlers[e.data.msgType];
    if (handlers) {
      for (var i = 0; i < handlers.length; i++) {
        try { handlers[i](e.data.data); } catch(err) { console.error('panel.onMessage handler error:', err); }
      }
    }
  }
  else if (e.data.type === 'panel:captureResult') {
    if (typeof window.panel._captureCallback === 'function') {
      window.panel._captureCallback(e.data.dataUrl);
      window.panel._captureCallback = null;
    }
  }
  else if (e.data.type === 'panel:channelMessage') {
    var listeners = _channelListeners[e.data.channel];
    if (listeners) {
      for (var j = 0; j < listeners.length; j++) {
        try { listeners[j](e.data.data); } catch(err) { console.error('panel.listen handler error:', err); }
      }
    }
  }
});
<\/script>
`;

export default BRIDGE_SCRIPT;
