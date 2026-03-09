import { uploadDataTexture, deleteTexture } from "./textureUtils.js";

/**
 * OSCManager — Open Sound Control bridge via WebSocket relay.
 *
 * Receives OSC messages relayed from the Python backend (which listens on UDP)
 * and provides values as plain JS data and as an RGBA32F texture for shaders.
 *
 * Browser cannot receive UDP directly, so the backend relays OSC → WebSocket.
 *
 * Texture layout: 128×1 RGBA32F
 *   Each pixel represents one OSC address slot.
 *   R=value (first float arg), G=second arg, B=third arg, A=fourth arg
 */

const MAX_SLOTS = 128;

export default class OSCManager {
  constructor() {
    this._ws = null;
    this._wsUrl = null;

    // Address → slot index mapping
    this._addressMap = new Map();
    this._nextSlot = 0;

    // Slot values (up to 4 floats per slot)
    this.slots = new Float32Array(MAX_SLOTS * 4);

    // Address → latest args (for CPU access)
    this.values = new Map(); // address string → number[]

    // Message log (ring buffer)
    this._logBuffer = [];
    this._logMax = 100;

    // Address → uniform name mappings
    this.mappings = new Map(); // address → { uniform, argIndex, min, max }
    this.onMappedChange = null;

    // GPU texture
    this.texture = null;

    // State
    this.initialized = false;
    this._initializing = false;
    this.connected = false;
    this.port = 9000; // OSC receive port (backend side)
  }

  /**
   * Connect to the backend WebSocket for OSC relay.
   * @param {object} [options]
   * @param {string} [options.wsUrl] — WebSocket URL (auto-detected if omitted)
   * @param {number} [options.port=9000] — OSC UDP port for backend to listen on
   */
  async init(options = {}) {
    if (this.initialized || this._initializing) return;
    this._initializing = true;

    this.port = options.port ?? 9000;

    try {
      // Determine WebSocket URL
      const wsUrl = options.wsUrl || this._autoWsUrl();
      this._wsUrl = wsUrl;

      await this._connect(wsUrl);

      // Tell backend to start OSC listener
      this._send({ type: "osc_start", port: this.port });

      this.initialized = true;
    } catch (err) {
      console.error("[OSCManager] init failed:", err);
      throw err;
    } finally {
      this._initializing = false;
    }
  }

  /**
   * Map an OSC address to a uniform.
   * @param {string} address — e.g. "/slider/1"
   * @param {string} uniformName
   * @param {number} [argIndex=0] — which OSC argument to use
   * @param {number} [min=0]
   * @param {number} [max=1]
   */
  mapAddress(address, uniformName, argIndex = 0, min = 0, max = 1) {
    this.mappings.set(address, { uniform: uniformName, argIndex, min, max });
  }

  unmapAddress(address) {
    this.mappings.delete(address);
  }

  /**
   * Send an OSC message through the backend.
   * @param {string} address
   * @param {number[]} args
   * @param {string} [host="127.0.0.1"]
   * @param {number} [port=8000]
   */
  send(address, args, host = "127.0.0.1", port = 8000) {
    this._send({
      type: "osc_send",
      address,
      args,
      host,
      port,
    });
  }

  /**
   * Get the latest value for an OSC address.
   */
  getValue(address, argIndex = 0) {
    const args = this.values.get(address);
    if (!args) return 0;
    return args[argIndex] ?? 0;
  }

  /**
   * Upload slot values as texture.
   * @param {WebGL2RenderingContext} gl
   */
  updateTextures(gl) {
    this.texture = uploadDataTexture(gl, this.texture, MAX_SLOTS, 1, this.slots);
  }

  get messageLog() { return this._logBuffer; }

  reset() {
    this.slots.fill(0);
    this.values.clear();
    this._addressMap.clear();
    this._nextSlot = 0;
    this._logBuffer = [];
    this.texture = null;
  }

  deleteTextures(gl) {
    deleteTexture(gl, this.texture); this.texture = null;
  }

  dispose() {
    if (this._ws) {
      const ws = this._ws;
      this._ws = null;
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "osc_stop" }));
      }
      setTimeout(() => ws.close(), 50);
    }
    this.mappings.clear();
    this.onMappedChange = null;
    this.reset();
    this.initialized = false;
    this._initializing = false;
    this.connected = false;
  }

  // --- Private ---

  _autoWsUrl() {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.hostname || "localhost";
    return `${proto}//${host}:8000/ws`;
  }

  _connect(url) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error("WebSocket connection timeout"));
      }, 5000);

      ws.onopen = () => {
        clearTimeout(timeout);
        this._ws = ws;
        this.connected = true;
        resolve();
      };

      ws.onerror = (e) => {
        clearTimeout(timeout);
        reject(new Error("WebSocket connection failed"));
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "osc_message") {
            this._handleOscMessage(msg.address, msg.args);
          }
        } catch { /* ignore non-JSON messages */ }
      };

      ws.onclose = () => {
        this.connected = false;
      };
    });
  }

  _send(data) {
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify(data));
    }
  }

  _handleOscMessage(address, args) {
    // Store in values map
    this.values.set(address, args);

    // Assign slot
    if (!this._addressMap.has(address) && this._nextSlot < MAX_SLOTS) {
      this._addressMap.set(address, this._nextSlot++);
    }
    const slot = this._addressMap.get(address);
    if (slot !== undefined) {
      for (let i = 0; i < Math.min(args.length, 4); i++) {
        this.slots[slot * 4 + i] = typeof args[i] === "number" ? args[i] : 0;
      }
    }

    // Log
    this._logBuffer.push({ address, args, time: Date.now() });
    if (this._logBuffer.length > this._logMax) {
      this._logBuffer.shift();
    }

    // Fire mapped uniform change
    const mapping = this.mappings.get(address);
    if (mapping && this.onMappedChange) {
      const raw = args[mapping.argIndex] ?? 0;
      const mapped = mapping.min + raw * (mapping.max - mapping.min);
      this.onMappedChange(mapping.uniform, mapped);
    }
  }

}
