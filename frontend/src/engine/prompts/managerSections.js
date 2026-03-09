/**
 * Manager-related prompt sections — audio, mediapipe, midi, etc.
 */

export const managerSections = [
  {
    id: "audio",
    core: false,
    keywords: [
      "audio", "sound", "music", "fft", "frequency", "waveform", "bass",
      "treble", "오디오", "소리", "음악", "주파수",
    ],
    content: `\
## AUDIO API

\`ctx.audio\` provides audio playback and real-time FFT analysis.

\`\`\`js
// In setup:
await ctx.audio.load(ctx.uploads["music.mp3"]);
ctx.audio.play();
ctx.audio.setVolume(0.8);

// In render (values updated every frame automatically):
ctx.audio.bass;          // 0.0–1.0 (low frequency energy)
ctx.audio.mid;           // 0.0–1.0 (mid frequency energy)
ctx.audio.treble;        // 0.0–1.0 (high frequency energy)
ctx.audio.energy;        // 0.0–1.0 (overall energy)
ctx.audio.frequencyData; // Uint8Array[1024] — raw FFT bins
ctx.audio.waveformData;  // Uint8Array[1024] — time domain
ctx.audio.fftTexture;    // R8 texture (1024×2: row0=frequency, row1=waveform)
ctx.audio.isPlaying;     // boolean
ctx.audio.currentTime;   // seconds
ctx.audio.duration;      // seconds

// Procedural audio (via Web Audio API):
const ac = ctx.audioContext;  // AudioContext
const dest = ctx.audioDestination;  // connect here for speakers + recording
\`\`\``,
  },
  {
    id: "mediapipe",
    core: false,
    platforms: ["web-desktop"],
    keywords: [
      "mediapipe", "pose", "hand", "face", "landmark", "tracking", "body",
      "포즈", "손", "얼굴", "랜드마크", "트래킹",
    ],
    content: `\
## MEDIAPIPE VISION (Pose / Hands / Face Mesh)

\`ctx.mediapipe\` provides real-time body tracking via MediaPipe Vision Tasks (CDN loaded).

**IMPORTANT: You MUST call \`await ctx.mediapipe.init()\` in setup before using detect().**

\`\`\`js
// In setup — REQUIRED:
await ctx.mediapipe.init({ tasks: ["pose", "hands", "faceMesh"] });
ctx.state.video = (await ctx.utils.initWebcam()).video;

// In render:
ctx.mediapipe.detect(ctx.state.video);

// Pose landmarks (33 points):
if (ctx.mediapipe.pose) {
  for (const p of ctx.mediapipe.pose) {
    // p.x, p.y (0-1 normalized), p.z, p.visibility
  }
}
// Pose texture: 33×1 RGBA32F (R=x, G=y, B=z, A=visibility)
gl.bindTexture(gl.TEXTURE_2D, ctx.mediapipe.poseTexture);

// Hands (up to 2):
if (ctx.mediapipe.hands) {
  // ctx.mediapipe.hands[0] = [{x,y,z}, ...] (21 landmarks)
}
// Hands texture: 21×2 RGBA32F (row per hand)
gl.bindTexture(gl.TEXTURE_2D, ctx.mediapipe.handsTexture);

// Face mesh (478 points):
if (ctx.mediapipe.faceMesh) {
  // ctx.mediapipe.faceMesh[i] = {x, y, z}
}
// Face texture: 478×1 RGBA32F
gl.bindTexture(gl.TEXTURE_2D, ctx.mediapipe.faceMeshTexture);
\`\`\`

**Init options:** \`{ tasks, delegate ("GPU"|"CPU"), maxPoses, maxHands, maxFaces }\``,
  },
  {
    id: "midi",
    core: false,
    platforms: ["web-desktop"],
    keywords: [
      "midi", "controller", "cc", "note", "knob", "fader", "keyboard",
      "미디", "컨트롤러",
    ],
    content: `\
## MIDI INPUT

\`ctx.midi\` provides real-time MIDI controller input via Web MIDI API.

**IMPORTANT: You MUST call \`await ctx.midi.init()\` in setup before reading MIDI data.**

\`\`\`js
// In setup — REQUIRED:
await ctx.midi.init();
// Optionally select a specific device:
// const devices = ctx.midi.devices; // [{id, name, manufacturer}]
// ctx.midi.selectInput(devices[0].id);

// Map CC to uniform:
ctx.midi.mapCC(1, "u_modWheel", 0, 1);

// In render:
const cc1 = ctx.midi.cc[1];          // 0.0–1.0
const noteVel = ctx.midi.notes[60];   // velocity of middle C (0 if off)
const bend = ctx.midi.pitchBend;      // -1.0 to 1.0
const noteCount = ctx.midi.activeNotes.size;

// Texture: 128×3 RGBA32F (row0=CC, row1=notes, row2=globals)
gl.bindTexture(gl.TEXTURE_2D, ctx.midi.texture);
\`\`\``,
  },
  {
    id: "tf_detector",
    core: false,
    platforms: ["web-desktop"],
    keywords: [
      "detect", "object", "recognition", "coco", "tensorflow", "person",
      "객체", "인식", "감지", "사물",
    ],
    content: `\
## OBJECT DETECTION (TensorFlow.js COCO-SSD)

\`ctx.detector\` provides real-time object detection using COCO-SSD (80 classes).
Two modes: **Online** (live detection each frame) and **Offline** (pre-cache all detections in setup, look up in render).

**IMPORTANT: You MUST call \`await ctx.detector.init()\` in setup before using detect(). Without init(), the model is not loaded and detect() silently returns empty results.**

**Choose the right mode:**
- **Online mode**: Use for webcam or when video changes unpredictably. Runs detect() each frame (auto-throttled).
- **Offline mode**: Use for uploaded/fixed videos. Pre-computes all detections in setup — render is instant with no per-frame inference cost. **Prefer this for uploaded videos.**

### Online Mode (webcam / live source)
\`\`\`js
// In setup — REQUIRED:
await ctx.detector.init({ maxDetections: 10, minScore: 0.5 });
ctx.state.video = (await ctx.utils.initWebcam()).video;

// In render:
// detect() is auto-throttled & concurrency-safe — just call it every frame.
// Returns cached detections if called too frequently. Do NOT add your own throttle.
const detections = await ctx.detector.detect(ctx.state.video);
for (const d of detections) {
  // d.class: "person", d.score: 0.95
  // d.bbox: [x, y, w, h] in PIXELS
  // d.bboxNorm: [x, y, w, h] normalized 0-1 (for shader use)
  // d.classIndex: 0 (COCO class index)
}
ctx.detector.count; // number of detections
\`\`\`

### Offline Mode (uploaded video — PREFERRED for non-live sources)
\`\`\`js
// In setup — REQUIRED:
await ctx.detector.init({ maxDetections: 20, minScore: 0.4 });
const video = s.video; // video element already created
await new Promise(r => { video.onloadedmetadata = r; });
// Pre-cache detections at regular intervals across the entire video
const cache = new Map();
const step = 0.2; // seconds between samples (adjust for precision vs speed)
for (let t = 0; t < video.duration; t += step) {
  video.currentTime = t;
  await new Promise(r => video.addEventListener('seeked', r, { once: true }));
  // { immediate: true } bypasses throttle for fast sequential detection
  cache.set(Math.round(t * 1000), await ctx.detector.detect(video, { immediate: true }));
}
s.detectionCache = cache;
video.currentTime = 0;
video.loop = true;
video.play();

// In render — instant lookup, no inference cost:
const timeMs = Math.round((ctx.time % video.duration) * 1000);
// Find nearest cached frame
let best = null, bestDist = Infinity;
for (const [ms, dets] of s.detectionCache) {
  const dist = Math.abs(ms - timeMs);
  if (dist < bestDist) { bestDist = dist; best = dets; }
}
const detections = best || [];
// Use detections same as online mode: d.class, d.bbox, d.bboxNorm, d.score
\`\`\`

GPU Textures (both modes): bboxTexture (centerX,centerY,w,h), classTexture (classIdx,confidence,0,0) — MAX_DETECTIONS×1 RGBA32F`,
  },
  {
    id: "sam",
    core: false,
    platforms: ["web-desktop"],
    keywords: [
      "segment", "sam", "mask", "cutout", "foreground", "background",
      "세그먼트", "분리", "마스크", "배경",
    ],
    content: `\
## SEGMENT ANYTHING (SAM) — Browser Offline

\`ctx.sam\` runs SAM ViT-B entirely in the browser via ONNX Runtime Web. \
Models are cached in IndexedDB after first download (~160MB).

**IMPORTANT: You MUST call \`await ctx.sam.init()\` in setup before using encode()/decode().**

\`\`\`js
// In setup — REQUIRED:
ctx.sam.onProgress = (p) => console.log("SAM loading:", (p*100).toFixed(0)+"%");
await ctx.sam.init();  // downloads model on first use, cached afterwards

// Encode image (heavy, ~2-5s, run once per image):
await ctx.sam.encode(imageElement, "myImage");

// Segment with point prompts (fast, ~50ms):
await ctx.sam.segment({
  points: [
    { x: 0.5, y: 0.5, label: 1 },  // foreground point (normalized 0-1)
    { x: 0.1, y: 0.1, label: 0 },  // background point
  ],
});

// Or with bounding box:
await ctx.sam.segment({ box: { x1: 0.2, y1: 0.2, x2: 0.8, y2: 0.8 } });

// Use mask in shader:
// ctx.sam.maskTexture — RGBA32F, R channel = 0 or 1
gl.bindTexture(gl.TEXTURE_2D, ctx.sam.maskTexture);
// ctx.sam.mask — Float32Array (width × height)
// ctx.sam.masks — all mask options [{mask, score}]
\`\`\``,
  },
  {
    id: "osc",
    core: false,
    platforms: ["web-desktop"],
    keywords: [
      "osc", "ableton", "touchdesigner", "resolume", "live", "音楽",
      "오에스씨", "에이블턴",
    ],
    content: `\
## OSC (Open Sound Control)

\`ctx.osc\` receives OSC messages from external apps (Ableton, TouchDesigner, etc.) \
via the Python backend's UDP relay.

**IMPORTANT: You MUST call \`await ctx.osc.init()\` in setup before reading OSC data.**

\`\`\`js
// In setup — REQUIRED:
await ctx.osc.init({ port: 9000 });  // backend listens on UDP port 9000

// Map OSC address to uniform:
ctx.osc.mapAddress("/slider/1", "u_speed", 0, 0, 1);

// In render:
const val = ctx.osc.getValue("/slider/1");  // latest value
ctx.osc.values; // Map of all addresses → args arrays

// Send OSC back to external app:
ctx.osc.send("/feedback/color", [1.0, 0.5, 0.0], "127.0.0.1", 8000);

// Texture: 128×1 RGBA32F (each slot = one address, up to 4 float args)
gl.bindTexture(gl.TEXTURE_2D, ctx.osc.texture);
\`\`\`

**Note:** OSC requires the Python backend (UDP cannot be received in browsers). \
The backend needs \`python-osc\` installed: \`pip install python-osc\`.`,
  },
  {
    id: "mic",
    core: false,
    platforms: ["web-desktop"],
    keywords: ["mic", "microphone", "audio input", "voice", "sound input"],
    content: `\
## MICROPHONE INPUT

\`ctx.mic\` provides real-time microphone audio input with FFT analysis.

**IMPORTANT: You MUST call \`await ctx.mic.init()\` in setup before reading mic data.**

\`\`\`js
// In setup — REQUIRED:
await ctx.mic.init();  // requests browser microphone permission

// In render:
const bass   = ctx.mic.bass;    // 0.0–1.0
const mid    = ctx.mic.mid;     // 0.0–1.0
const treble = ctx.mic.treble;  // 0.0–1.0
const energy = ctx.mic.energy;  // 0.0–1.0

// Raw FFT arrays (Uint8Array[1024] each):
const freq = ctx.mic.frequencyData;
const wave = ctx.mic.waveformData;

// Texture: 1024×2 R8 (row 0 = frequency, row 1 = waveform)
gl.bindTexture(gl.TEXTURE_2D, ctx.mic.fftTexture);
\`\`\`

**Note:** Microphone requires user permission (browser will prompt). \
Audio is analysed only — it is NOT routed to speakers (no feedback loop).`,
  },
];
