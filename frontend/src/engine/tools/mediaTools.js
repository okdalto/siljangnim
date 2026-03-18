/**
 * Media-related tool handlers: recording, capture, timeline.
 */

import * as storage from "../storage.js";

const CAPTURE_MAX_DIM = 1024;

export async function toolStartRecording(input, broadcast, ctx) {
  const resetTimeline = input.resetTimeline !== false;
  const msg = { type: "start_recording" };
  if (input.duration != null) msg.duration = input.duration;
  if (input.fps != null) msg.fps = input.fps;
  if (resetTimeline) msg.resetTimeline = true;
  broadcast(msg);
  const durationStr = input.duration ? ` for ${input.duration}s` : "";

  // If duration is specified and we have a promise factory, wait for recording to finish
  if (input.duration != null && ctx.recordingDonePromise) {
    const promise = ctx.recordingDonePromise();
    await promise;
    return `ok — recording finished (${input.duration}s)${resetTimeline ? " (timeline was reset to 0)" : ""}.`;
  }
  return `ok — recording started${durationStr}${resetTimeline ? " (timeline reset to 0)" : ""}.`;
}

export async function toolStopRecording(input, broadcast) {
  broadcast({ type: "stop_recording" });
  return "ok — recording stopped. The WebM file will auto-download in the user's browser.";
}

/**
 * Capture viewport tool — returns base64 JPEG image data.
 * Returns an object with { image: base64string } instead of a plain string,
 * so the executor can build image content blocks for vision-capable models.
 */
export async function toolCaptureViewport(input, broadcast, ctx) {
  const engine = ctx.engineRef?.current;
  if (!engine?.canvas) {
    return "Error: No viewport canvas available. Make sure a scene is loaded.";
  }

  // For WebGPU, the render output is on the 2D overlay canvas (or the
  // offscreen backend canvas), not the main canvas which stays idle/black.
  const canvas = engine._blitOverlay || engine.canvas;
  try {
    const maxDim = CAPTURE_MAX_DIM;
    let w = Math.min(input.width || canvas.width, maxDim);
    let h = Math.min(input.height || canvas.height, maxDim);

    // If canvas is larger than requested, downscale via offscreen canvas
    let dataUrl;
    if (w < canvas.width || h < canvas.height) {
      // Maintain aspect ratio if only one dimension specified
      if (!input.width && !input.height) {
        const scale = Math.min(maxDim / canvas.width, maxDim / canvas.height, 1);
        w = Math.round(canvas.width * scale);
        h = Math.round(canvas.height * scale);
      }
      const offscreen = document.createElement("canvas");
      offscreen.width = w;
      offscreen.height = h;
      const octx = offscreen.getContext("2d");
      octx.drawImage(canvas, 0, 0, w, h);
      dataUrl = offscreen.toDataURL("image/jpeg", 0.8);
    } else {
      dataUrl = canvas.toDataURL("image/jpeg", 0.8);
    }

    // Strip the data:image/jpeg;base64, prefix
    const base64 = dataUrl.split(",")[1];
    if (!base64) return "Error: Failed to capture canvas — empty image data.";

    // Return structured result — the executor will handle this specially
    return { __type: "image", media_type: "image/jpeg", base64, width: w, height: h };
  } catch (err) {
    return `Error capturing viewport: ${err.message}`;
  }
}

export async function toolSetTimeline(input, broadcast) {
  const updates = {};
  if (input.duration != null) updates.duration = Number(input.duration);
  if (input.loop != null) updates.loop = Boolean(input.loop);
  if (input.fps != null) {
    const f = Number(input.fps);
    if (f >= 1 && f <= 240) updates.fps = Math.round(f);
    else return "Error: fps must be between 1 and 240.";
  }
  if (Object.keys(updates).length === 0) return "Error: provide at least one of 'duration', 'loop', or 'fps'.";
  broadcast({ type: "set_timeline", ...updates });
  const parts = [];
  if (updates.duration != null) parts.push(`duration=${updates.duration}s`);
  if (updates.loop != null) parts.push(`loop=${updates.loop}`);
  if (updates.fps != null) parts.push(`fps=${updates.fps}`);
  return `ok — timeline updated: ${parts.join(", ")}.`;
}
