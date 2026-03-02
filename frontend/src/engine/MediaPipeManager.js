/**
 * MediaPipeManager — Real-time face, pose, and hand tracking via MediaPipe Vision Tasks.
 *
 * Lazy-loads @mediapipe/tasks-vision from CDN (no bundled WASM).
 * Exposes landmark data as plain arrays and RGBA32F textures for shader consumption.
 */

const CDN_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest";
const WASM_BASE = `${CDN_BASE}/wasm`;

// Model URLs (lite variants for fast loading)
const MODELS = {
  pose: `${CDN_BASE}/pose_landmarker_lite.task`,
  hands: `${CDN_BASE}/hand_landmarker.task`,
  faceMesh: `${CDN_BASE}/face_landmarker.task`,
};

// Landmark counts per task
const LANDMARK_COUNTS = {
  pose: 33,
  hands: 21,
  faceMesh: 478,
};

export default class MediaPipeManager {
  constructor() {
    this._vision = null;          // CDN module reference
    this._filesetResolver = null; // WASM fileset

    // Detectors
    this._poseLandmarker = null;
    this._handLandmarker = null;
    this._faceLandmarker = null;

    // Detection results (plain arrays)
    this.pose = null;       // [{x,y,z,visibility}, ...] length 33
    this.hands = null;      // [hand0, hand1] each [{x,y,z}, ...] length 21
    this.faceMesh = null;   // [{x,y,z}, ...] length 478

    // GPU textures (RGBA32F)
    this.poseTexture = null;      // 33×1
    this.handsTexture = null;     // 21×2
    this.faceMeshTexture = null;  // 478×1

    // State flags
    this.initialized = false;
    this._initializing = false;
    this._tasks = [];             // which tasks were requested
  }

  /**
   * Lazy-load WASM + create requested detectors.
   * @param {WebGL2RenderingContext} gl
   * @param {object} options
   * @param {string[]} options.tasks — subset of ['pose', 'hands', 'faceMesh']
   * @param {string} [options.delegate='GPU'] — 'GPU' or 'CPU'
   * @param {number} [options.maxPoses=1]
   * @param {number} [options.maxHands=2]
   * @param {number} [options.maxFaces=1]
   */
  async init(gl, options = {}) {
    if (this.initialized || this._initializing) return;
    this._initializing = true;

    const {
      tasks = ["pose"],
      delegate = "GPU",
      maxPoses = 1,
      maxHands = 2,
      maxFaces = 1,
    } = options;

    this._tasks = tasks;

    try {
      // Dynamic import from CDN (webpackIgnore keeps bundler away)
      const vision = await import(
        /* webpackIgnore: true */
        `${CDN_BASE}/+esm`
      );
      this._vision = vision;

      this._filesetResolver = await vision.FilesetResolver.forVisionTasks(WASM_BASE);

      // Create requested detectors in parallel
      const promises = [];

      if (tasks.includes("pose")) {
        promises.push(
          vision.PoseLandmarker.createFromOptions(this._filesetResolver, {
            baseOptions: { modelAssetPath: MODELS.pose, delegate },
            runningMode: "VIDEO",
            numPoses: maxPoses,
          }).then((d) => { this._poseLandmarker = d; })
        );
      }

      if (tasks.includes("hands")) {
        promises.push(
          vision.HandLandmarker.createFromOptions(this._filesetResolver, {
            baseOptions: { modelAssetPath: MODELS.hands, delegate },
            runningMode: "VIDEO",
            numHands: maxHands,
          }).then((d) => { this._handLandmarker = d; })
        );
      }

      if (tasks.includes("faceMesh")) {
        promises.push(
          vision.FaceLandmarker.createFromOptions(this._filesetResolver, {
            baseOptions: { modelAssetPath: MODELS.faceMesh, delegate },
            runningMode: "VIDEO",
            numFaces: maxFaces,
            outputFaceBlendshapes: false,
            outputFacialTransformationMatrixes: false,
          }).then((d) => { this._faceLandmarker = d; })
        );
      }

      await Promise.all(promises);
      this.initialized = true;
    } catch (err) {
      console.error("[MediaPipeManager] init failed:", err);
      throw err;
    } finally {
      this._initializing = false;
    }
  }

  /**
   * Run detection on a video/image/canvas source.
   * @param {HTMLVideoElement|HTMLImageElement|HTMLCanvasElement} source
   * @param {number} [timestamp] — milliseconds (defaults to performance.now())
   */
  detect(source, timestamp) {
    if (!this.initialized) {
      console.warn("[MediaPipeManager] detect() called before init()");
      return;
    }

    const ts = timestamp ?? performance.now();

    // Pose
    if (this._poseLandmarker) {
      try {
        const result = this._poseLandmarker.detectForVideo(source, ts);
        if (result.landmarks && result.landmarks.length > 0) {
          const lm = result.landmarks[0];
          const wlm = result.worldLandmarks?.[0];
          this.pose = lm.map((p, i) => ({
            x: p.x,
            y: p.y,
            z: wlm ? wlm[i].z : (p.z || 0),
            visibility: p.visibility ?? 1,
          }));
        } else {
          this.pose = null;
        }
      } catch (err) {
        console.warn("[MediaPipeManager] pose detect error:", err);
      }
    }

    // Hands
    if (this._handLandmarker) {
      try {
        const result = this._handLandmarker.detectForVideo(source, ts);
        if (result.landmarks && result.landmarks.length > 0) {
          this.hands = result.landmarks.slice(0, 2).map((hand) =>
            hand.map((p) => ({ x: p.x, y: p.y, z: p.z || 0 }))
          );
        } else {
          this.hands = null;
        }
      } catch (err) {
        console.warn("[MediaPipeManager] hands detect error:", err);
      }
    }

    // Face mesh
    if (this._faceLandmarker) {
      try {
        const result = this._faceLandmarker.detectForVideo(source, ts);
        if (result.faceLandmarks && result.faceLandmarks.length > 0) {
          this.faceMesh = result.faceLandmarks[0].map((p) => ({
            x: p.x,
            y: p.y,
            z: p.z || 0,
          }));
        } else {
          this.faceMesh = null;
        }
      } catch (err) {
        console.warn("[MediaPipeManager] faceMesh detect error:", err);
      }
    }
  }

  /**
   * Upload detection results as RGBA32F textures.
   * @param {WebGL2RenderingContext} gl
   */
  updateTextures(gl) {
    // Pose: 33×1 RGBA32F
    if (this._tasks.includes("pose")) {
      const count = LANDMARK_COUNTS.pose;
      const data = new Float32Array(count * 4);
      if (this.pose) {
        for (let i = 0; i < count; i++) {
          const p = this.pose[i];
          if (p) {
            data[i * 4] = p.x;
            data[i * 4 + 1] = p.y;
            data[i * 4 + 2] = p.z;
            data[i * 4 + 3] = p.visibility;
          }
        }
      }
      this.poseTexture = this._uploadFloat32Texture(
        gl, this.poseTexture, count, 1, data
      );
    }

    // Hands: 21×2 RGBA32F (row 0 = hand 0, row 1 = hand 1)
    if (this._tasks.includes("hands")) {
      const count = LANDMARK_COUNTS.hands;
      const data = new Float32Array(count * 2 * 4);
      if (this.hands) {
        for (let h = 0; h < Math.min(this.hands.length, 2); h++) {
          const hand = this.hands[h];
          const rowOffset = h * count * 4;
          for (let i = 0; i < count; i++) {
            const p = hand[i];
            if (p) {
              data[rowOffset + i * 4] = p.x;
              data[rowOffset + i * 4 + 1] = p.y;
              data[rowOffset + i * 4 + 2] = p.z;
              data[rowOffset + i * 4 + 3] = 1.0;
            }
          }
        }
      }
      this.handsTexture = this._uploadFloat32Texture(
        gl, this.handsTexture, count, 2, data
      );
    }

    // Face mesh: 478×1 RGBA32F
    if (this._tasks.includes("faceMesh")) {
      const count = LANDMARK_COUNTS.faceMesh;
      const data = new Float32Array(count * 4);
      if (this.faceMesh) {
        for (let i = 0; i < count; i++) {
          const p = this.faceMesh[i];
          if (p) {
            data[i * 4] = p.x;
            data[i * 4 + 1] = p.y;
            data[i * 4 + 2] = p.z;
            data[i * 4 + 3] = 1.0;
          }
        }
      }
      this.faceMeshTexture = this._uploadFloat32Texture(
        gl, this.faceMeshTexture, count, 1, data
      );
    }
  }

  /**
   * Reset results and textures (detectors stay alive for hot-reload).
   */
  reset() {
    this.pose = null;
    this.hands = null;
    this.faceMesh = null;
    this.poseTexture = null;
    this.handsTexture = null;
    this.faceMeshTexture = null;
  }

  /**
   * Full cleanup — close detectors and delete textures.
   */
  dispose() {
    this._poseLandmarker?.close();
    this._handLandmarker?.close();
    this._faceLandmarker?.close();
    this._poseLandmarker = null;
    this._handLandmarker = null;
    this._faceLandmarker = null;

    this.pose = null;
    this.hands = null;
    this.faceMesh = null;
    this.poseTexture = null;
    this.handsTexture = null;
    this.faceMeshTexture = null;

    this.initialized = false;
    this._initializing = false;
    this._tasks = [];
    this._vision = null;
    this._filesetResolver = null;
  }

  // ---- Private helpers ----

  /**
   * Create or update an RGBA32F texture with NEAREST filtering.
   */
  _uploadFloat32Texture(gl, existing, width, height, data) {
    let tex = existing;
    if (!tex) {
      tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(
        gl.TEXTURE_2D, 0, gl.RGBA32F,
        width, height, 0,
        gl.RGBA, gl.FLOAT, data
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    } else {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texSubImage2D(
        gl.TEXTURE_2D, 0, 0, 0,
        width, height,
        gl.RGBA, gl.FLOAT, data
      );
    }
    return tex;
  }
}
