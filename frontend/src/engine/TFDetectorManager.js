import { uploadDataTexture, deleteTexture } from "./textureUtils.js";
import BaseManager from "./BaseManager.js";

/**
 * TFDetectorManager — Real-time object detection via TensorFlow.js COCO-SSD.
 *
 * Lazy-loads @tensorflow/tfjs and @tensorflow-models/coco-ssd from CDN.
 * Provides detection results as plain JS arrays and as an RGBA32F texture.
 *
 * Texture layout: MAX_DETECTIONS×1 RGBA32F
 *   Each pixel: R=centerX (0-1), G=centerY (0-1), B=width (0-1), A=height (0-1)
 *   A separate classTexture: MAX_DETECTIONS×1
 *   Each pixel: R=classIndex (0-79), G=confidence (0-1), B=0, A=0
 */

const MAX_DETECTIONS = 20;

// COCO-SSD class names (80 classes)
const COCO_CLASSES = [
  "person","bicycle","car","motorcycle","airplane","bus","train","truck","boat",
  "traffic light","fire hydrant","stop sign","parking meter","bench","bird","cat",
  "dog","horse","sheep","cow","elephant","bear","zebra","giraffe","backpack",
  "umbrella","handbag","tie","suitcase","frisbee","skis","snowboard","sports ball",
  "kite","baseball bat","baseball glove","skateboard","surfboard","tennis racket",
  "bottle","wine glass","cup","fork","knife","spoon","bowl","banana","apple",
  "sandwich","orange","broccoli","carrot","hot dog","pizza","donut","cake","chair",
  "couch","potted plant","bed","dining table","toilet","tv","laptop","mouse",
  "remote","keyboard","cell phone","microwave","oven","toaster","sink",
  "refrigerator","book","clock","vase","scissors","teddy bear","hair drier","toothbrush",
];

const COCO_CLASS_INDEX = new Map(COCO_CLASSES.map((c, i) => [c, i]));

export default class TFDetectorManager extends BaseManager {
  constructor() {
    super();
    this._model = null;

    // Detection results
    this.detections = []; // [{class, classIndex, score, bbox: [x,y,w,h]}]
    this.count = 0;

    // GPU textures
    this.bboxTexture = null;    // MAX_DETECTIONS×1: centerX, centerY, w, h
    this.classTexture = null;   // MAX_DETECTIONS×1: classIndex, confidence, 0, 0

    // Config
    this.maxDetections = MAX_DETECTIONS;
    this.minScore = 0.5;
  }

  /**
   * Lazy-load TensorFlow.js + COCO-SSD from CDN.
   * @param {object} [options]
   * @param {number} [options.maxDetections=20]
   * @param {number} [options.minScore=0.5]
   */
  async init(options = {}) {
    this.maxDetections = options.maxDetections ?? MAX_DETECTIONS;
    this.minScore = options.minScore ?? 0.5;

    await this._guardedInit(async () => {
      // tf.min.js is a UMD script — must be loaded via <script> tag so it
      // registers window.tf.  ESM dynamic import() does NOT work for it.
      if (!window.tf) {
        await new Promise((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js";
          s.onload = resolve;
          s.onerror = () => reject(new Error("Failed to load TensorFlow.js from CDN"));
          document.head.appendChild(s);
        });
      }
      const cocoSsd = await import(/* webpackIgnore: true */ "https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/+esm");
      this._model = await cocoSsd.load({ base: "lite_mobilenet_v2" });
    });
  }

  /**
   * Run detection on a source element.
   * @param {HTMLVideoElement|HTMLImageElement|HTMLCanvasElement} source
   */
  async detect(source) {
    if (!this.initialized || !this._model) return;
    try {
      const predictions = await this._model.detect(source, this.maxDetections, this.minScore);
      this.detections = predictions.map((p) => {
        const classIndex = COCO_CLASS_INDEX.get(p.class) ?? -1;
        // bbox from coco-ssd: [x, y, width, height] in pixels
        const sw = source.videoWidth || source.width || source.naturalWidth || 1;
        const sh = source.videoHeight || source.height || source.naturalHeight || 1;
        if (sw === 0 || sh === 0) return null;
        return {
          class: p.class,
          classIndex,
          score: p.score,
          bbox: [p.bbox[0] / sw, p.bbox[1] / sh, p.bbox[2] / sw, p.bbox[3] / sh],
        };
      }).filter(Boolean);
      this.count = this.detections.length;
    } catch (err) {
      console.warn("[TFDetectorManager] detect error:", err);
    }
  }

  /**
   * Upload detection results as RGBA32F textures.
   * @param {WebGL2RenderingContext} gl
   */
  updateTextures(gl) {
    const N = this.maxDetections;

    // Bbox texture: centerX, centerY, w, h
    const bboxData = new Float32Array(N * 4);
    for (let i = 0; i < Math.min(this.detections.length, N); i++) {
      const d = this.detections[i];
      const [x, y, w, h] = d.bbox;
      bboxData[i * 4] = x + w / 2; // centerX
      bboxData[i * 4 + 1] = y + h / 2; // centerY
      bboxData[i * 4 + 2] = w;
      bboxData[i * 4 + 3] = h;
    }
    this.bboxTexture = uploadDataTexture(gl, this.bboxTexture, N, 1, bboxData);

    // Class texture: classIndex, confidence, 0, 0
    const classData = new Float32Array(N * 4);
    for (let i = 0; i < Math.min(this.detections.length, N); i++) {
      const d = this.detections[i];
      classData[i * 4] = d.classIndex;
      classData[i * 4 + 1] = d.score;
    }
    this.classTexture = uploadDataTexture(gl, this.classTexture, N, 1, classData);
  }

  reset() {
    this.detections = [];
    this.count = 0;
    this.bboxTexture = null;
    this.classTexture = null;
  }

  deleteTextures(gl) {
    deleteTexture(gl, this.bboxTexture); this.bboxTexture = null;
    deleteTexture(gl, this.classTexture); this.classTexture = null;
  }

  dispose() {
    this._model?.dispose?.();
    this._model = null;
    this.reset();
    this.initialized = false;
    this._initializing = false;
  }

}

export { COCO_CLASSES };
