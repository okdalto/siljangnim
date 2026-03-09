/**
 * SAMManager — Segment Anything Model in the browser via ONNX Runtime Web.
 *
 * Runs 100% client-side. Models are cached in IndexedDB after first download.
 * Architecture: encoder runs once per image → embedding cached → decoder runs per prompt (~50ms).
 *
 * Provides segmentation masks as plain arrays and RGBA textures.
 */

const MODEL_URLS = {
  encoder: "https://huggingface.co/vietanhdev/segment-anything-onnx-models/resolve/main/sam_vit_b_encoder.quant.onnx",
  decoder: "https://huggingface.co/vietanhdev/segment-anything-onnx-models/resolve/main/sam_vit_b_decoder.quant.onnx",
};

const CACHE_DB_NAME = "siljangnim-sam-cache";
const CACHE_STORE = "models";
const INPUT_SIZE = 1024; // SAM expects 1024×1024

export default class SAMManager {
  constructor() {
    this._ort = null; // ONNX Runtime
    this._encoderSession = null;
    this._decoderSession = null;

    // Cached image embedding
    this._embedding = null;
    this._embeddingSourceId = null; // track which image was encoded

    // Results
    this.mask = null;         // Float32Array (width × height), values 0 or 1
    this.maskWidth = 0;
    this.maskHeight = 0;
    this.masks = [];          // multiple mask options [{mask, score}]

    // GPU texture
    this.maskTexture = null;  // width×height R32F equivalent packed into RGBA

    // State
    this.initialized = false;
    this._initializing = false;
    this._encoding = false;
    this._modelProgress = 0; // 0-1 download progress

    // Texture dimension tracking
    this._lastTexW = 0;
    this._lastTexH = 0;

    // Callbacks
    this.onProgress = null; // (progress: number) => void
  }

  /**
   * Load ONNX Runtime and SAM models (with IndexedDB caching).
   */
  async init() {
    if (this.initialized || this._initializing) return;
    this._initializing = true;

    try {
      // Load ONNX Runtime Web
      this._ort = await import(
        /* webpackIgnore: true */
        "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.0/dist/ort.all.min.mjs"
      );
      // Configure ONNX Runtime
      this._ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.0/dist/";

      // Load models (from cache or download)
      const [encoderBuf, decoderBuf] = await Promise.all([
        this._loadModel("encoder", MODEL_URLS.encoder, 0.7),
        this._loadModel("decoder", MODEL_URLS.decoder, 0.3),
      ]);

      this._encoderSession = await this._ort.InferenceSession.create(encoderBuf, {
        executionProviders: ["wasm"],
      });
      this._decoderSession = await this._ort.InferenceSession.create(decoderBuf, {
        executionProviders: ["wasm"],
      });

      this.initialized = true;
    } catch (err) {
      console.error("[SAMManager] init failed:", err);
      throw err;
    } finally {
      this._initializing = false;
    }
  }

  /**
   * Encode an image to generate embeddings (heavy, run once per image).
   * @param {HTMLImageElement|HTMLCanvasElement|HTMLVideoElement} source
   * @param {string} [sourceId] — optional ID to avoid re-encoding the same image
   */
  async encode(source, sourceId) {
    if (!this.initialized) throw new Error("SAMManager not initialized");
    if (sourceId && sourceId === this._embeddingSourceId) return; // already encoded
    this._encoding = true;

    try {
      const canvas = document.createElement("canvas");
      canvas.width = INPUT_SIZE;
      canvas.height = INPUT_SIZE;
      const c = canvas.getContext("2d");

      // Fit source into 1024×1024 maintaining aspect ratio
      const sw = source.videoWidth || source.naturalWidth || source.width;
      const sh = source.videoHeight || source.naturalHeight || source.height;
      const scale = Math.min(INPUT_SIZE / sw, INPUT_SIZE / sh);
      const dw = sw * scale;
      const dh = sh * scale;
      c.fillStyle = "#000";
      c.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE);
      c.drawImage(source, (INPUT_SIZE - dw) / 2, (INPUT_SIZE - dh) / 2, dw, dh);

      // Extract pixel data and normalize to [0, 255] float
      const imageData = c.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);
      const pixels = imageData.data;
      const floatData = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE);

      // SAM expects CHW format with pixel mean subtraction
      const mean = [123.675, 116.28, 103.53];
      const std = [58.395, 57.12, 57.375];
      const hw = INPUT_SIZE * INPUT_SIZE;
      for (let i = 0; i < hw; i++) {
        floatData[i] = (pixels[i * 4] - mean[0]) / std[0];           // R
        floatData[hw + i] = (pixels[i * 4 + 1] - mean[1]) / std[1];  // G
        floatData[2 * hw + i] = (pixels[i * 4 + 2] - mean[2]) / std[2]; // B
      }

      const inputTensor = new this._ort.Tensor("float32", floatData, [1, 3, INPUT_SIZE, INPUT_SIZE]);
      try {
        const results = await this._encoderSession.run({ images: inputTensor });
        this._embedding = results.image_embeddings ?? results[Object.keys(results)[0]];
        this._embeddingSourceId = sourceId || null;
        this._sourceScale = { sw, sh, scale, dw, dh };
      } finally {
        inputTensor.dispose?.();
      }
    } finally {
      this._encoding = false;
    }
  }

  /**
   * Generate mask from point/box prompts (fast, ~50ms).
   * @param {object} prompt
   * @param {Array<{x: number, y: number, label: number}>} [prompt.points] — label: 1=foreground, 0=background
   * @param {object} [prompt.box] — {x1, y1, x2, y2} in normalized coords (0-1)
   */
  async segment(prompt) {
    if (!this.initialized || !this._embedding) {
      throw new Error("Must call encode() before segment()");
    }

    const { sw, sh, scale, dw, dh } = this._sourceScale;
    const offsetX = (INPUT_SIZE - dw) / 2;
    const offsetY = (INPUT_SIZE - dh) / 2;

    // Build point coordinates and labels
    let pointCoords = [];
    let pointLabels = [];

    if (prompt.points) {
      for (const p of prompt.points) {
        // Convert normalized coords to 1024×1024 space
        const px = p.x * sw * scale + offsetX;
        const py = p.y * sh * scale + offsetY;
        pointCoords.push(px, py);
        pointLabels.push(p.label ?? 1);
      }
    }

    if (prompt.box) {
      const { x1, y1, x2, y2 } = prompt.box;
      pointCoords.push(
        x1 * sw * scale + offsetX, y1 * sh * scale + offsetY,
        x2 * sw * scale + offsetX, y2 * sh * scale + offsetY,
      );
      pointLabels.push(2, 3); // box corner labels
    }

    // Pad to at least 1 point if empty
    if (pointCoords.length === 0) {
      pointCoords = [INPUT_SIZE / 2, INPUT_SIZE / 2];
      pointLabels = [1];
    }

    const numPoints = pointLabels.length;
    const coordsTensor = new this._ort.Tensor("float32",
      new Float32Array(pointCoords), [1, numPoints, 2]);
    const labelsTensor = new this._ort.Tensor("float32",
      new Float32Array(pointLabels), [1, numPoints]);
    const maskInput = new this._ort.Tensor("float32",
      new Float32Array(256 * 256), [1, 1, 256, 256]);
    const hasMask = new this._ort.Tensor("float32", new Float32Array([0]), [1]);
    const origSize = new this._ort.Tensor("float32",
      new Float32Array([INPUT_SIZE, INPUT_SIZE]), [2]);

    const feeds = {
      image_embeddings: this._embedding,
      point_coords: coordsTensor,
      point_labels: labelsTensor,
      mask_input: maskInput,
      has_mask_input: hasMask,
      orig_im_size: origSize,
    };

    let masks, scores;
    try {
      const results = await this._decoderSession.run(feeds);
      masks = results.masks ?? results[Object.keys(results)[0]];
      scores = results.iou_predictions ?? results[Object.keys(results)[1]];

      // Process masks — take the best scoring one
      const maskData = masks.data;
      const maskH = masks.dims[2];
      const maskW = masks.dims[3];
      const numMasks = masks.dims[1];
      const scoresData = scores?.data;

      let bestIdx = 0;
      if (scoresData && numMasks > 1) {
        let bestScore = -Infinity;
        for (let i = 0; i < numMasks; i++) {
          if (scoresData[i] > bestScore) {
            bestScore = scoresData[i];
            bestIdx = i;
          }
        }
      }

      // Extract best mask and threshold
      const offset = bestIdx * maskW * maskH;
      const binaryMask = new Float32Array(maskW * maskH);
      for (let i = 0; i < maskW * maskH; i++) {
        binaryMask[i] = maskData[offset + i] > 0 ? 1 : 0;
      }

      this.mask = binaryMask;
      this.maskWidth = maskW;
      this.maskHeight = maskH;

      // Store all mask options
      this.masks = [];
      for (let m = 0; m < numMasks; m++) {
        const mOffset = m * maskW * maskH;
        const mData = new Float32Array(maskW * maskH);
        for (let i = 0; i < maskW * maskH; i++) {
          mData[i] = maskData[mOffset + i] > 0 ? 1 : 0;
        }
        this.masks.push({
          mask: mData,
          score: scoresData ? scoresData[m] : 0,
        });
      }
    } finally {
      coordsTensor.dispose?.();
      labelsTensor.dispose?.();
      maskInput.dispose?.();
      hasMask.dispose?.();
      origSize.dispose?.();
    }
  }

  /**
   * Upload mask as a texture.
   * @param {WebGL2RenderingContext} gl
   */
  updateTextures(gl) {
    if (!this.mask || !this.maskWidth || !this.maskHeight) return;

    // Pack into RGBA (R=mask, GBA=0)
    const w = this.maskWidth;
    const h = this.maskHeight;
    const rgba = new Float32Array(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      rgba[i * 4] = this.mask[i];
    }
    this.maskTexture = this._uploadTexture(gl, this.maskTexture, w, h, rgba);
  }

  reset() {
    this._embedding = null;
    this._embeddingSourceId = null;
    this._sourceScale = null;
    this.mask = null;
    this.maskWidth = 0;
    this.maskHeight = 0;
    this.masks = [];
    this.maskTexture = null;
    this._lastTexW = 0;
    this._lastTexH = 0;
  }

  deleteTextures(gl) {
    if (this.maskTexture && gl) { gl.deleteTexture(this.maskTexture); this.maskTexture = null; }
  }

  dispose() {
    this._encoderSession?.release?.();
    this._decoderSession?.release?.();
    this._encoderSession = null;
    this._decoderSession = null;
    this._ort = null;
    this.reset();
    this.initialized = false;
    this._initializing = false;
  }

  get isEncoding() { return this._encoding; }
  get modelProgress() { return this._modelProgress; }

  // --- Private ---

  async _loadModel(name, url, progressWeight) {
    // Try IndexedDB cache first
    const cached = await this._readCache(name);
    if (cached) {
      this._modelProgress += progressWeight;
      this.onProgress?.(this._modelProgress);
      return cached;
    }

    // Download with progress
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to download ${name}: ${response.status}`);

    const contentLength = parseInt(response.headers.get("content-length") || "0", 10);
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      if (contentLength > 0) {
        const fileProgress = received / contentLength;
        this.onProgress?.(this._modelProgress + fileProgress * progressWeight);
      }
    }

    this._modelProgress += progressWeight;
    this.onProgress?.(this._modelProgress);

    // Combine chunks
    const buffer = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.length;
    }

    // Cache in IndexedDB
    await this._writeCache(name, buffer.buffer);
    return buffer.buffer;
  }

  async _readCache(name) {
    try {
      const db = await this._openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(CACHE_STORE, "readonly");
        const store = tx.objectStore(CACHE_STORE);
        const req = store.get(name);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    } catch {
      return null;
    }
  }

  async _writeCache(name, buffer) {
    try {
      const db = await this._openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(CACHE_STORE, "readwrite");
        const store = tx.objectStore(CACHE_STORE);
        const req = store.put(buffer, name);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {
      // Caching failure is non-fatal
    }
  }

  _openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(CACHE_DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(CACHE_STORE)) {
          db.createObjectStore(CACHE_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  _uploadTexture(gl, existing, width, height, data) {
    let tex = existing;
    if (!tex) {
      tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, data);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    } else {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      // Recreate if dimensions changed
      if (this._lastTexW !== width || this._lastTexH !== height) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, data);
      } else {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.FLOAT, data);
      }
    }
    this._lastTexW = width;
    this._lastTexH = height;
    return tex;
  }
}
