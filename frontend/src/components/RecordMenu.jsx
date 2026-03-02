import { useState, useRef, useEffect, useCallback } from "react";

const FORMATS = ["MP4", "WebM"];
const FPS_PRESETS = [24, 30, 60];
const QUALITIES = ["Low", "Med", "High", "Ultra"];
const MODES = ["Realtime", "Offline"];

const QUALITY_MULTIPLIER = { Low: 4, Med: 8, High: 12, Ultra: 20 };

const RESOLUTION_PRESETS = [
  { label: "Canvas", w: 0, h: 0 },
  { label: "1920×1080", w: 1920, h: 1080 },
  { label: "1280×720", w: 1280, h: 720 },
  { label: "960×540", w: 960, h: 540 },
  { label: "640×360", w: 640, h: 360 },
];

function BtnGroup({ items, value, onChange, disabled }) {
  return (
    <div className="flex gap-0.5">
      {items.map((item) => {
        const val = typeof item === "string" ? item : item.value;
        const label = typeof item === "string" ? item : item.label;
        return (
          <button
            key={val}
            onClick={() => onChange(val)}
            disabled={disabled}
            className={`text-xs px-2 py-1 rounded transition-colors ${
              value === val
                ? "bg-blue-600 text-white"
                : "bg-zinc-700 text-zinc-400 hover:text-zinc-200"
            } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export default function RecordMenu({
  recording,
  recordingTime,
  onStart,
  onStop,
  canvasWidth,
  canvasHeight,
}) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef(null);

  // Settings state (persists across open/close within session)
  const [format, setFormat] = useState("MP4");
  const [fps, setFps] = useState(30);
  const [customFps, setCustomFps] = useState(false);
  const [fpsInput, setFpsInput] = useState("30");
  const [quality, setQuality] = useState("High");
  const [mode, setMode] = useState("Offline");
  const [resolution, setResolution] = useState("Canvas");
  const [customRes, setCustomRes] = useState(false);
  const [customW, setCustomW] = useState("");
  const [customH, setCustomH] = useState("");

  // Outside click → close
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [open]);

  // Constraint: MP4 → force Offline
  const handleFormatChange = useCallback(
    (f) => {
      setFormat(f);
      if (f === "MP4") setMode("Offline");
    },
    []
  );

  // Constraint: Realtime → force WebM
  const handleModeChange = useCallback(
    (m) => {
      setMode(m);
      if (m === "Realtime") setFormat("WebM");
    },
    []
  );

  const handleFpsPreset = useCallback((f) => {
    setFps(f);
    setCustomFps(false);
    setFpsInput(String(f));
  }, []);

  const commitCustomFps = useCallback(() => {
    const v = parseInt(fpsInput, 10);
    if (!isNaN(v) && v > 0) {
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

  const handleRecordClick = useCallback(
    (e) => {
      e.stopPropagation();
      if (recording) {
        onStop();
      } else {
        setOpen((v) => !v);
      }
    },
    [recording, onStop]
  );

  const handleStart = useCallback(() => {
    // Resolve resolution
    let w = canvasWidth;
    let h = canvasHeight;
    if (customRes) {
      const cw = parseInt(customW, 10);
      const ch = parseInt(customH, 10);
      if (cw > 0 && ch > 0) {
        w = cw;
        h = ch;
      }
    } else {
      const preset = RESOLUTION_PRESETS.find((p) => p.label === resolution);
      if (preset && preset.w > 0) {
        w = preset.w;
        h = preset.h;
      }
    }

    const pixels = w * h;
    const bitrate = pixels * QUALITY_MULTIPLIER[quality];

    onStart({
      format: format.toLowerCase(),
      fps,
      quality,
      bitrate,
      offline: mode === "Offline",
      resolution: { width: w, height: h },
    });
    setOpen(false);
  }, [format, fps, quality, mode, resolution, customRes, customW, customH, canvasWidth, canvasHeight, onStart]);

  return (
    <div ref={popoverRef} className="relative">
      {/* Record button */}
      <button
        onClick={handleRecordClick}
        className={`flex items-center justify-center gap-1 h-6 transition-colors ${
          recording
            ? "text-red-400 hover:text-red-300"
            : "text-zinc-500 hover:text-zinc-300"
        }`}
        title={recording ? "Stop recording" : "Recording settings"}
      >
        <span
          className={`inline-block w-3 h-3 rounded-full ${
            recording
              ? "bg-red-500"
              : "bg-red-800 border border-red-600"
          }`}
          style={
            recording
              ? { animation: "rec-blink 1s ease-in-out infinite" }
              : undefined
          }
        />
        {recording && (
          <span className="text-xs font-mono text-red-400 min-w-[36px]">
            {Math.floor(recordingTime / 60)
              .toString()
              .padStart(2, "0")}
            :
            {Math.floor(recordingTime % 60)
              .toString()
              .padStart(2, "0")}
          </span>
        )}
      </button>
      <style>{`@keyframes rec-blink { 0%,100% { opacity:1 } 50% { opacity:0.3 } }`}</style>

      {/* Popover */}
      {open && !recording && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 bg-zinc-800 border border-zinc-600 rounded-lg shadow-xl p-3 text-xs text-zinc-300 z-50">
          {/* Format */}
          <div className="mb-2">
            <div className="text-zinc-500 mb-1">Format</div>
            <BtnGroup items={FORMATS} value={format} onChange={handleFormatChange} />
          </div>

          {/* FPS */}
          <div className="mb-2">
            <div className="text-zinc-500 mb-1">FPS</div>
            {customFps ? (
              <input
                type="text"
                autoFocus
                value={fpsInput}
                onChange={(e) => setFpsInput(e.target.value)}
                onBlur={commitCustomFps}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.target.blur();
                  if (e.key === "Escape") {
                    setCustomFps(false);
                    setFpsInput(String(fps));
                  }
                }}
                className="w-16 text-xs text-center bg-zinc-700 border border-zinc-600 rounded px-1 py-1 text-zinc-300 outline-none focus:border-blue-500"
              />
            ) : (
              <div className="flex gap-0.5">
                {FPS_PRESETS.map((f) => (
                  <button
                    key={f}
                    onClick={() => handleFpsPreset(f)}
                    className={`text-xs px-2 py-1 rounded transition-colors ${
                      fps === f && !customFps
                        ? "bg-blue-600 text-white"
                        : "bg-zinc-700 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {f}
                  </button>
                ))}
                <button
                  onClick={() => {
                    setCustomFps(true);
                    setFpsInput(String(fps));
                  }}
                  className={`text-xs px-2 py-1 rounded transition-colors ${
                    !FPS_PRESETS.includes(fps)
                      ? "bg-blue-600 text-white"
                      : "bg-zinc-700 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {!FPS_PRESETS.includes(fps) ? fps : "..."}
                </button>
              </div>
            )}
          </div>

          {/* Quality */}
          <div className="mb-2">
            <div className="text-zinc-500 mb-1">Quality</div>
            <BtnGroup items={QUALITIES} value={quality} onChange={setQuality} />
          </div>

          {/* Mode */}
          <div className="mb-2">
            <div className="text-zinc-500 mb-1">Mode</div>
            <BtnGroup items={MODES} value={mode} onChange={handleModeChange} />
          </div>

          {/* Resolution */}
          <div className="mb-3">
            <div className="text-zinc-500 mb-1">Resolution</div>
            {customRes ? (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  autoFocus
                  placeholder="W"
                  value={customW}
                  onChange={(e) => setCustomW(e.target.value)}
                  className="w-16 text-xs text-center bg-zinc-700 border border-zinc-600 rounded px-1 py-1 text-zinc-300 outline-none focus:border-blue-500"
                />
                <span className="text-zinc-500">×</span>
                <input
                  type="text"
                  placeholder="H"
                  value={customH}
                  onChange={(e) => setCustomH(e.target.value)}
                  className="w-16 text-xs text-center bg-zinc-700 border border-zinc-600 rounded px-1 py-1 text-zinc-300 outline-none focus:border-blue-500"
                />
                <button
                  onClick={() => setCustomRes(false)}
                  className="text-xs px-1.5 py-1 rounded bg-zinc-700 text-zinc-400 hover:text-zinc-200"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-0.5">
                {RESOLUTION_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => handleResolutionChange(p.label)}
                    className={`text-xs px-2 py-1 rounded transition-colors ${
                      resolution === p.label && !customRes
                        ? "bg-blue-600 text-white"
                        : "bg-zinc-700 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {p.label === "Canvas"
                      ? `Canvas (${canvasWidth}×${canvasHeight})`
                      : p.label}
                  </button>
                ))}
                <button
                  onClick={() => {
                    setCustomRes(true);
                    setCustomW(String(canvasWidth));
                    setCustomH(String(canvasHeight));
                  }}
                  className="text-xs px-2 py-1 rounded transition-colors bg-zinc-700 text-zinc-400 hover:text-zinc-200"
                >
                  Custom
                </button>
              </div>
            )}
          </div>

          {/* Start button */}
          <button
            onClick={handleStart}
            className="w-full py-1.5 rounded bg-red-600 hover:bg-red-500 text-white text-xs font-medium transition-colors"
          >
            Start Recording
          </button>
        </div>
      )}
    </div>
  );
}
