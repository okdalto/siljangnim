import { uploadDataTexture, deleteTexture } from "./textureUtils.js";
import BaseManager from "./BaseManager.js";

/**
 * MIDIManager — Real-time MIDI input via Web MIDI API.
 *
 * Provides CC values, note states, and pitch bend as plain JS data
 * and as an RGBA32F texture for shader consumption.
 *
 * Texture layout: 128×3 RGBA32F
 *   Row 0: CC values (128 controllers, R=value 0-1, GBA=0)
 *   Row 1: Note velocities (128 notes, R=velocity 0-1, G=1 if on, BA=0)
 *   Row 2: Global data (pixel 0: R=pitchBend -1..1, G=noteCount, B=lastCC, A=lastNote)
 */
export default class MIDIManager extends BaseManager {
  constructor() {
    super();
    this._midiAccess = null;
    this._selectedInputId = null;
    this._listeners = [];

    // CC values (0-127 → 0.0-1.0)
    this.cc = new Float32Array(128);
    // Note velocities (0-127 → 0.0-1.0), 0 = off
    this.notes = new Float32Array(128);
    // Active note set for quick queries
    this.activeNotes = new Set();
    // Pitch bend (-1.0 to 1.0)
    this.pitchBend = 0;
    // Last received values (for MIDI learn)
    this.lastCC = -1;
    this.lastNote = -1;
    // CC → uniform name mapping
    this.mappings = new Map(); // cc number → { uniform, min, max }
    // Callback for uniform changes (set externally)
    this.onMappedChange = null;

    // GPU texture
    this.texture = null;

    this._devices = []; // [{id, name, manufacturer}]
  }

  async init() {
    await this._guardedInit(async () => {
      if (!navigator.requestMIDIAccess) {
        throw new Error("Web MIDI API not supported in this browser");
      }
      this._midiAccess = await navigator.requestMIDIAccess({ sysex: false });
      this._updateDeviceList();
      // Listen for device changes
      this._midiAccess.onstatechange = () => this._updateDeviceList();
      // Auto-connect to first available input
      if (this._devices.length > 0 && !this._selectedInputId) {
        this.selectInput(this._devices[0].id);
      }
    });
  }

  get devices() { return this._devices; }

  selectInput(inputId) {
    // Disconnect previous
    this._disconnectInput();
    this._selectedInputId = inputId;
    if (!this._midiAccess || !inputId) return;
    const input = this._midiAccess.inputs.get(inputId);
    if (!input) return;
    const handler = (e) => this._onMessage(e);
    input.onmidimessage = handler;
    this._listeners.push({ inputId, handler });
  }

  // Map a CC number to a uniform
  mapCC(ccNumber, uniformName, min = 0, max = 1) {
    this.mappings.set(ccNumber, { uniform: uniformName, min, max });
  }

  unmapCC(ccNumber) {
    this.mappings.delete(ccNumber);
  }

  updateTextures(gl) {
    // 128×3 RGBA32F
    const W = 128, H = 3;
    const data = new Float32Array(W * H * 4);
    // Row 0: CC values
    for (let i = 0; i < 128; i++) {
      data[i * 4] = this.cc[i];
    }
    // Row 1: Notes
    const row1 = W * 4;
    for (let i = 0; i < 128; i++) {
      data[row1 + i * 4] = this.notes[i];
      data[row1 + i * 4 + 1] = this.notes[i] > 0 ? 1 : 0;
    }
    // Row 2: Global
    const row2 = W * 2 * 4;
    data[row2] = this.pitchBend;
    data[row2 + 1] = this.activeNotes.size;
    data[row2 + 2] = this.lastCC;
    data[row2 + 3] = this.lastNote;

    this.texture = uploadDataTexture(gl, this.texture, W, H, data);
  }

  reset() {
    this.cc.fill(0);
    this.notes.fill(0);
    this.activeNotes.clear();
    this.pitchBend = 0;
    this.lastCC = -1;
    this.lastNote = -1;
    this.texture = null;
  }

  deleteTextures(gl) {
    deleteTexture(gl, this.texture); this.texture = null;
  }

  dispose() {
    this._disconnectInput();
    if (this._midiAccess) {
      this._midiAccess.onstatechange = null;
    }
    this._midiAccess = null;
    this._selectedInputId = null;
    this._devices = [];
    this.mappings.clear();
    this.onMappedChange = null;
    this.reset();
    this.initialized = false;
    this._initializing = false;
  }

  // --- Private ---

  _updateDeviceList() {
    if (!this._midiAccess) return;
    this._devices = [];
    for (const [id, input] of this._midiAccess.inputs) {
      this._devices.push({
        id,
        name: input.name || "Unknown",
        manufacturer: input.manufacturer || "",
      });
    }
  }

  _disconnectInput() {
    for (const { inputId, handler } of this._listeners) {
      const input = this._midiAccess?.inputs.get(inputId);
      if (input) input.onmidimessage = null;
    }
    this._listeners = [];
  }

  _onMessage(event) {
    const [status, data1, data2] = event.data;
    if (data1 === undefined || data1 < 0 || data1 > 127) return;
    const command = status & 0xf0;

    switch (command) {
      case 0x90: // Note On
        if (data2 > 0) {
          this.notes[data1] = data2 / 127;
          this.activeNotes.add(data1);
          this.lastNote = data1;
        } else {
          // velocity 0 = note off
          this.notes[data1] = 0;
          this.activeNotes.delete(data1);
        }
        break;
      case 0x80: // Note Off
        this.notes[data1] = 0;
        this.activeNotes.delete(data1);
        break;
      case 0xb0: { // Control Change
        const value = data2 / 127;
        this.cc[data1] = value;
        this.lastCC = data1;
        // Fire mapped uniform change
        const mapping = this.mappings.get(data1);
        if (mapping && this.onMappedChange) {
          const mapped = mapping.min + value * (mapping.max - mapping.min);
          this.onMappedChange(mapping.uniform, mapped);
        }
        break;
      }
      case 0xe0: // Pitch Bend
        this.pitchBend = ((data2 << 7) | data1) / 8192 - 1;
        break;
    }
  }

}
