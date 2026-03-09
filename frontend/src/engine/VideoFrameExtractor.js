/**
 * VideoFrameExtractor — Demux MP4 with mp4box.js + decode with WebCodecs VideoDecoder.
 *
 * Provides frame-accurate random access without relying on <video>.currentTime seeking.
 * Only one VideoFrame is held at a time; the previous frame is closed automatically.
 */
import MP4Box from "mp4box";

export default class VideoFrameExtractor {
  constructor() {
    this._decoder = null;
    this._chunks = [];      // EncodedVideoChunk[] in decode order
    this._chunkIndex = 0;   // next chunk to decode
    this._currentFrame = null;
    this._pendingFrame = null;
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
        // Close any previously pending frame that wasn't consumed
        if (this._pendingFrame) {
          this._pendingFrame.close();
        }
        this._pendingFrame = frame;
        if (this._frameResolve) {
          this._frameResolve();
          this._frameResolve = null;
        }
      },
      error: (e) => console.error("[VideoFrameExtractor] decode error:", e),
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
    if (!this._configured || this._chunks.length === 0) return null;

    const targetUs = Math.round(time * 1_000_000);

    // If we need to go backwards, reset and start over
    if (this._currentFrame && targetUs < this._currentFrame.timestamp) {
      this._reset();
    }

    // Decode chunks until we pass the target time
    while (this._chunkIndex < this._chunks.length) {
      const chunk = this._chunks[this._chunkIndex];

      // If the next chunk is beyond our target and we already have a frame, stop
      if (this._currentFrame && chunk.timestamp > targetUs) {
        break;
      }

      this._decoder.decode(chunk);
      this._chunkIndex++;

      // Wait for the decoder to produce a frame
      await this._waitForFrame();

      // Close old current frame, promote pending
      if (this._currentFrame) {
        this._currentFrame.close();
      }
      this._currentFrame = this._pendingFrame;
      this._pendingFrame = null;

      // If we've reached or passed the target, stop
      if (this._currentFrame && this._currentFrame.timestamp >= targetUs) {
        break;
      }
    }

    return this._currentFrame;
  }

  /**
   * Reset decoder state to allow re-decoding from the beginning (for loops).
   */
  _reset() {
    if (this._decoder?.state === "configured") {
      this._decoder.reset();
      // Re-configure after reset
      // We stored the config during init via the demux helper
      this._decoder.configure(this._decoderConfig);
    }
    this._chunkIndex = 0;
    if (this._currentFrame) {
      this._currentFrame.close();
      this._currentFrame = null;
    }
    if (this._pendingFrame) {
      this._pendingFrame.close();
      this._pendingFrame = null;
    }
  }

  _waitForFrame() {
    if (this._pendingFrame) return Promise.resolve();
    return new Promise((resolve) => {
      this._frameResolve = resolve;
    });
  }

  dispose() {
    if (this._currentFrame) {
      this._currentFrame.close();
      this._currentFrame = null;
    }
    if (this._pendingFrame) {
      this._pendingFrame.close();
      this._pendingFrame = null;
    }
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
