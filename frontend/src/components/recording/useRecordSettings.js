import { useState, useCallback } from "react";
import { FPS_PRESETS, FPS_MIN, FPS_MAX, QUALITY_MULTIPLIER, RESOLUTION_PRESETS } from "../../constants/recording.js";

/**
 * Encapsulates all recording settings state (14 useState calls).
 */
export default function useRecordSettings({ canvasWidth, canvasHeight, sceneDuration }) {
  const [format, setFormat] = useState("WebM");
  const [fps, setFps] = useState(30);
  const [customFps, setCustomFps] = useState(false);
  const [fpsInput, setFpsInput] = useState("30");
  const [quality, setQuality] = useState("High");
  const [mode, setMode] = useState("Realtime");
  const [resolution, setResolution] = useState("Canvas");
  const [customRes, setCustomRes] = useState(false);
  const [customW, setCustomW] = useState("");
  const [customH, setCustomH] = useState("");
  const [alpha, setAlpha] = useState(false);
  const [recDurationMode, setRecDurationMode] = useState("scene");
  const [customDuration, setCustomDuration] = useState("");

  const handleFormatChange = useCallback((f) => {
    setFormat(f);
    if (f === "PNG") setMode("Offline");
    if (f !== "PNG" && f !== "WebM") setAlpha(false);
  }, []);

  const handleModeChange = useCallback((m) => {
    setMode(m);
  }, []);

  const handleFpsPreset = useCallback((f) => {
    setFps(f);
    setCustomFps(false);
    setFpsInput(String(f));
  }, []);

  const commitCustomFps = useCallback(() => {
    const v = parseInt(fpsInput, 10);
    if (!isNaN(v) && v >= FPS_MIN && v <= FPS_MAX) {
      setFps(v);
    } else {
      setFpsInput(String(fps));
    }
    setCustomFps(false);
  }, [fpsInput, fps]);

  const handleResolutionChange = useCallback((label) => {
    setResolution(label);
    setCustomRes(false);
  }, []);

  const buildRecordOptions = useCallback(() => {
    let w = canvasWidth;
    let h = canvasHeight;
    if (customRes) {
      const cw = parseInt(customW, 10);
      const ch = parseInt(customH, 10);
      if (cw > 0 && ch > 0) { w = cw; h = ch; }
    } else {
      const preset = RESOLUTION_PRESETS.find((p) => p.label === resolution);
      if (preset && preset.w > 0) { w = preset.w; h = preset.h; }
    }

    const pixels = w * h;
    const bitrate = pixels * QUALITY_MULTIPLIER[quality];

    let parsedDuration;
    if (mode === "Offline") {
      if (recDurationMode === "custom") {
        const v = parseFloat(customDuration);
        parsedDuration = !isNaN(v) && v > 0 ? v : undefined;
      } else {
        parsedDuration = sceneDuration > 0 ? sceneDuration : undefined;
      }
    }

    return {
      format: format.toLowerCase(),
      fps,
      quality,
      bitrate,
      offline: mode === "Offline",
      resolution: { width: w, height: h },
      alpha: (format === "PNG" || format === "WebM") && alpha,
      duration: parsedDuration,
    };
  }, [format, fps, quality, mode, resolution, customRes, customW, customH, canvasWidth, canvasHeight, alpha, recDurationMode, customDuration, sceneDuration]);

  return {
    format, handleFormatChange,
    fps, customFps, setCustomFps, fpsInput, setFpsInput,
    handleFpsPreset, commitCustomFps,
    quality, setQuality,
    mode, handleModeChange,
    resolution, handleResolutionChange,
    customRes, setCustomRes, customW, setCustomW, customH, setCustomH,
    alpha, setAlpha,
    recDurationMode, setRecDurationMode, customDuration, setCustomDuration,
    buildRecordOptions,
  };
}
