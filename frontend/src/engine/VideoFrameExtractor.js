/**
 * VideoFrameExtractor — Demux MP4 with mp4box.js + decode with WebCodecs VideoDecoder.
 *
 * Provides frame-accurate random access without relying on <video>.currentTime seeking.
 * Uses an output queue to correctly handle B-frame reordering and avoid frame loss.
 */
import MP4Box from "mp4box";

export default class VideoFrameExtractor {
  constructor() {
    this._decoder = null;
    this._chunks = [];      // EncodedVideoChunk[] in decode order (DTS)
    this._chunkIndex = 0;   // next chunk to decode
    this._currentFrame = null;
    this._outputQueue = [];  // decoded VideoFrames in display order
    this._frameResolve = null;
    this._configured = false;
    this._duration = 0;     // seconds
  }

  /**
   * Initialise from an ArrayBuffer containing an MP4 file.
   * Demuxes all video samples and configures the decoder.
   */
  async init(arrayBuffer) {
    const { chunks, decoderConfig, duration } = await demux(arrayBuffer);
    this._chunks = chunks;
    this._duration = duration;
    this._decoderConfig = decoderConfig;

    this._decoder = new VideoDecoder({
      output: (frame) => {
        this._outputQueue.push(frame);
        if (this._frameResolve) {
          this._frameResolve();
          this._frameResolve = null;
        }
      },
      error: (e) => {
        console.error("[VideoFrameExtractor] decode error:", e);
        this._decodeError = true;
        if (this._frameResolve) {
          this._frameResolve();
          this._frameResolve = null;
        }
      },
    });

    this._decoder.configure(decoderConfig);
    this._configured = true;
  }

  get duration() {
    return this._duration;
  }

  /**
   * Decode and return the VideoFrame closest to `time` (seconds).
   * Handles loops: if time < last decoded time, resets decoder and re-decodes from start.
   *
   * The returned VideoFrame is valid until the next call to getFrameAtTime() or dispose().
   */
  async getFrameAtTime(time) {
    if (!this._configured || this._chunks.length === 0 || this._decodeError) return null;

    const targetUs = Math.round(time * 1_000_000);

    // If we need to go backwards, reset and start over
    if (this._currentFrame && targetUs < this._currentFrame.timestamp) {
      this._reset();
    }

    // Consume any already-queued frames
    this._consumeUpTo(targetUs);
    if (this._currentFrame && this._currentFrame.timestamp >= targetUs - 1000) {
      return this._currentFrame;
    }

    // Decode chunks and wait for output until we have a frame at the target.
    while (this._chunkIndex < this._chunks.length) {
      this._decoder.decode(this._chunks[this._chunkIndex]);
      this._chunkIndex++;

      // Wait for the decoder to produce at least one frame (50ms timeout for
      // chunks that don't immediately produce output, e.g. reference frames
      // buffered for B-frame reordering)
      await this._waitForOutput();

      this._consumeUpTo(targetUs);
      if (this._currentFrame && this._currentFrame.timestamp >= targetUs - 1000) {
        break;
      }
    }

    return this._currentFrame;
  }

  /**
   * Consume output queue up to the target time (1ms tolerance for rounding).
   * Advances _currentFrame to the best available frame near targetUs.
   * Frames clearly past the target stay in the queue for future calls.
   */
  _consumeUpTo(targetUs) {
    while (this._outputQueue.length > 0) {
      const frame = this._outputQueue[0];

      // If this frame is clearly past target AND we already have a close-enough frame, keep for later
      if (frame.timestamp > targetUs + 1000 && this._currentFrame && this._currentFrame.timestamp >= targetUs - 1000) {
        break;
      }

      this._outputQueue.shift();
      if (this._currentFrame) {
        this._currentFrame.close();
      }
      this._currentFrame = frame;

      if (frame.timestamp >= targetUs - 1000) {
        break;
      }
    }
  }

  /**
   * Reset decoder state to allow re-decoding from the beginning (for loops).
   */
  _reset() {
    if (this._decoder?.state === "configured") {
      this._decoder.reset();
      this._decoder.configure(this._decoderConfig);
    }
    this._chunkIndex = 0;
    if (this._currentFrame) {
      this._currentFrame.close();
      this._currentFrame = null;
    }
    for (const f of this._outputQueue) f.close();
    this._outputQueue = [];
  }

  _waitForOutput() {
    if (this._outputQueue.length > 0) return Promise.resolve();
    return new Promise((resolve) => {
      this._frameResolve = resolve;
      this._waitTimer = setTimeout(() => {
        if (this._frameResolve) {
          this._frameResolve();
          this._frameResolve = null;
        }
      }, 50);
    }).finally(() => {
      clearTimeout(this._waitTimer);
    });
  }

  dispose() {
    if (this._currentFrame) {
      this._currentFrame.close();
      this._currentFrame = null;
    }
    for (const f of this._outputQueue) f.close();
    this._outputQueue = [];
    if (this._decoder && this._decoder.state !== "closed") {
      this._decoder.close();
    }
    this._decoder = null;
    this._chunks = [];
    this._chunkIndex = 0;
    this._configured = false;
  }
}

// ---- MP4 demux helper using mp4box.js ----

function demux(arrayBuffer) {
  return new Promise((resolve, reject) => {
    const mp4 = MP4Box.createFile();
    let decoderConfig = null;
    const chunks = [];
    let duration = 0;

    mp4.onReady = (info) => {
      const videoTrack = info.videoTracks[0];
      if (!videoTrack) {
        reject(new Error("No video track found in MP4"));
        return;
      }

      duration = videoTrack.duration / videoTrack.timescale;

      // Build decoder config from track info
      const codecStr = videoTrack.codec;
      decoderConfig = {
        codec: codecStr,
        codedWidth: videoTrack.video.width,
        codedHeight: videoTrack.video.height,
      };

      // Extract description (avcC / hvcC / av1C box) for the decoder
      const trak = mp4.getTrackById(videoTrack.id);
      const entry = trak?.mdia?.minf?.stbl?.stsd?.entries[0];
      if (entry) {
        const descBox = entry.avcC || entry.hvcC || entry.av1C || entry.vpcC;
        if (descBox) {
          const stream = new MP4Box.DataStream(
            undefined,
            0,
            MP4Box.DataStream.BIG_ENDIAN,
          );
          descBox.write(stream);
          decoderConfig.description = new Uint8Array(stream.buffer, 8); // skip box header
        }
      }

      mp4.setExtractionOptions(videoTrack.id);
      mp4.start();
    };

    mp4.onSamples = (_trackId, _ref, samples) => {
      for (const sample of samples) {
        chunks.push(
          new EncodedVideoChunk({
            type: sample.is_sync ? "key" : "delta",
            timestamp: (sample.cts * 1_000_000) / sample.timescale,
            duration: (sample.duration * 1_000_000) / sample.timescale,
            data: sample.data,
          }),
        );
      }
    };

    mp4.onError = (e) => reject(e);

    // Feed the buffer — mp4box requires fileStart
    arrayBuffer.fileStart = 0;
    mp4.appendBuffer(arrayBuffer);
    mp4.flush();

    // After flush, all samples should have been extracted
    // Use a microtask to ensure onSamples has been called
    setTimeout(() => {
      if (!decoderConfig) {
        reject(new Error("Failed to extract decoder config from MP4"));
        return;
      }
      resolve({ chunks, decoderConfig, duration });
    }, 0);
  });
}
