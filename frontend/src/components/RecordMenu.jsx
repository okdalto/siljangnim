import { useState, useRef, useCallback } from "react";
import useClickOutside from "../hooks/useClickOutside.js";
import { FORMATS, FPS_PRESETS, QUALITIES, MODES, RESOLUTION_PRESETS } from "../constants/recording.js";
import useRecordSettings from "./recording/useRecordSettings.js";

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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
            className={`text-xs px-2 py-1 rounded transition-colors ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
            style={
              value === val
                ? { background: "var(--accent)", color: "var(--accent-text)" }
                : { background: "var(--input-bg)", color: "var(--chrome-text-secondary)" }
            }
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
  progress,
  completionInfo,
  sceneDuration,
}) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef(null);

  const settings = useRecordSettings({ canvasWidth, canvasHeight, sceneDuration });

  useClickOutside(popoverRef, open, () => setOpen(false));

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
    onStart(settings.buildRecordOptions());
    setOpen(false);
  }, [onStart, settings]);

  const realtimeMp4NoAudio =
    settings.mode === "Realtime" && settings.format === "MP4";

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
        {recording && progress && (
          <span className="text-xs font-mono min-w-[60px]" style={{ color: "var(--chrome-text-secondary)" }}>
            {progress.percent.toFixed(0)}%
            {progress.eta > 0 && ` ~${Math.ceil(progress.eta)}s`}
          </span>
        )}
      </button>
      <style>{`@keyframes rec-blink { 0%,100% { opacity:1 } 50% { opacity:0.3 } }`}</style>

      {/* Completion toast */}
      {completionInfo && !recording && (
        <div
          className="absolute bottom-full left-0 mb-1 px-2 py-1 rounded text-xs shadow-lg max-w-72"
          style={{
            background: completionInfo.success ? "var(--chrome-bg-elevated)" : "#7f1d1d",
            border: "1px solid var(--chrome-border)",
            color: completionInfo.success ? "var(--chrome-text)" : "#fca5a5",
          }}
        >
          <div>
            {completionInfo.success
              ? `${formatFileSize(completionInfo.fileSize)} in ${completionInfo.timeTaken}s`
              : `Error: ${completionInfo.error}`}
          </div>
          {completionInfo.warning && (
            <div className="mt-1 whitespace-normal" style={{ color: "var(--chrome-text-muted)" }}>
              {completionInfo.warning}
            </div>
          )}
        </div>
      )}

      {/* Popover */}
      {open && !recording && (
        <div
          className="absolute bottom-full left-0 mb-2 w-72 max-h-[70vh] overflow-y-auto rounded-lg shadow-xl p-3 text-xs z-50"
          style={{ background: "var(--chrome-bg-elevated)", border: "1px solid var(--chrome-border)", color: "var(--chrome-text)" }}
        >
          {/* Format */}
          <div className="mb-2">
            <div className="mb-1" style={{ color: "var(--chrome-text-muted)" }}>Format</div>
            <BtnGroup items={FORMATS} value={settings.format} onChange={settings.handleFormatChange} />
          </div>

          {/* FPS */}
          <div className="mb-2">
            <div className="mb-1" style={{ color: "var(--chrome-text-muted)" }}>FPS</div>
            {settings.customFps ? (
              <input
                type="text"
                autoFocus
                value={settings.fpsInput}
                onChange={(e) => settings.setFpsInput(e.target.value)}
                onBlur={settings.commitCustomFps}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.target.blur();
                  if (e.key === "Escape") {
                    settings.setCustomFps(false);
                    settings.setFpsInput(String(settings.fps));
                  }
                }}
                className="w-16 text-xs text-center rounded px-1 py-1 outline-none focus:border-blue-500"
                style={{ background: "var(--input-bg)", border: "1px solid var(--input-border)", color: "var(--input-text)" }}
              />
            ) : (
              <div className="flex gap-0.5">
                {FPS_PRESETS.map((f) => (
                  <button
                    key={f}
                    onClick={() => settings.handleFpsPreset(f)}
                    className="text-xs px-2 py-1 rounded transition-colors"
                    style={
                      settings.fps === f && !settings.customFps
                        ? { background: "var(--accent)", color: "var(--accent-text)" }
                        : { background: "var(--input-bg)", color: "var(--chrome-text-secondary)" }
                    }
                  >
                    {f}
                  </button>
                ))}
                <button
                  onClick={() => {
                    settings.setCustomFps(true);
                    settings.setFpsInput(String(settings.fps));
                  }}
                  className="text-xs px-2 py-1 rounded transition-colors"
                  style={
                    !FPS_PRESETS.includes(settings.fps)
                      ? { background: "var(--accent)", color: "var(--accent-text)" }
                      : { background: "var(--input-bg)", color: "var(--chrome-text-secondary)" }
                  }
                >
                  {!FPS_PRESETS.includes(settings.fps) ? settings.fps : "..."}
                </button>
              </div>
            )}
          </div>

          {/* Quality */}
          {settings.format !== "PNG" && (
            <div className="mb-2">
              <div className="mb-1" style={{ color: "var(--chrome-text-muted)" }}>Quality</div>
              <BtnGroup items={QUALITIES} value={settings.quality} onChange={settings.setQuality} />
            </div>
          )}

          {/* Mode */}
          <div className="mb-2">
            <div className="mb-1" style={{ color: "var(--chrome-text-muted)" }}>Mode</div>
            <BtnGroup items={MODES} value={settings.mode} onChange={settings.handleModeChange} disabled={settings.format === "PNG"} />
            {settings.format === "PNG" && (
              <div className="mt-1 text-xs" style={{ color: "var(--chrome-text-muted)" }}>
                PNG requires offline mode for frame-accurate capture
              </div>
            )}
            {realtimeMp4NoAudio && (
              <div
                className="mt-2 rounded px-2 py-1.5 text-xs"
                style={{
                  background: "rgba(245, 158, 11, 0.12)",
                  border: "1px solid rgba(245, 158, 11, 0.35)",
                  color: "#fbbf24",
                }}
              >
                Realtime MP4 currently exports video only.
                Use Realtime WebM or Offline MP4/WebM if you need audio.
              </div>
            )}
          </div>

          {/* Duration (Offline only) */}
          {settings.mode === "Offline" && (
            <div className="mb-2">
              <div className="mb-1" style={{ color: "var(--chrome-text-muted)" }}>Duration</div>
              <div className="flex gap-0.5 items-center">
                <button
                  onClick={() => settings.setRecDurationMode("scene")}
                  className="text-xs px-2 py-1 rounded transition-colors"
                  style={
                    settings.recDurationMode === "scene"
                      ? { background: "var(--accent)", color: "var(--accent-text)" }
                      : { background: "var(--input-bg)", color: "var(--chrome-text-secondary)" }
                  }
                >
                  Scene ({sceneDuration > 0 ? `${sceneDuration}s` : "\u221E"})
                </button>
                <button
                  onClick={() => {
                    settings.setRecDurationMode("custom");
                    if (!settings.customDuration) settings.setCustomDuration(String(sceneDuration > 0 ? sceneDuration : 10));
                  }}
                  className="text-xs px-2 py-1 rounded transition-colors"
                  style={
                    settings.recDurationMode === "custom"
                      ? { background: "var(--accent)", color: "var(--accent-text)" }
                      : { background: "var(--input-bg)", color: "var(--chrome-text-secondary)" }
                  }
                >
                  Custom
                </button>
                {settings.recDurationMode === "custom" && (
                  <input
                    type="text"
                    autoFocus
                    value={settings.customDuration}
                    onChange={(e) => settings.setCustomDuration(e.target.value)}
                    placeholder="sec"
                    className="w-14 text-xs text-center rounded px-1 py-1 outline-none focus:border-blue-500"
                    style={{ background: "var(--input-bg)", border: "1px solid var(--input-border)", color: "var(--input-text)" }}
                  />
                )}
              </div>
            </div>
          )}

          {/* Alpha */}
          {(settings.format === "PNG" || settings.format === "WebM") && (
            <div className="mb-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.alpha}
                  onChange={(e) => settings.setAlpha(e.target.checked)}
                  className="accent-blue-600"
                />
                <span style={{ color: "var(--chrome-text-secondary)" }}>Transparent background (alpha)</span>
              </label>
            </div>
          )}

          {/* Resolution */}
          <div className="mb-3">
            <div className="mb-1" style={{ color: "var(--chrome-text-muted)" }}>Resolution</div>
            {settings.customRes ? (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  autoFocus
                  placeholder="W"
                  value={settings.customW}
                  onChange={(e) => settings.setCustomW(e.target.value)}
                  className="w-16 text-xs text-center rounded px-1 py-1 outline-none focus:border-blue-500"
                  style={{ background: "var(--input-bg)", border: "1px solid var(--input-border)", color: "var(--input-text)" }}
                />
                <span style={{ color: "var(--chrome-text-muted)" }}>{"\u00D7"}</span>
                <input
                  type="text"
                  placeholder="H"
                  value={settings.customH}
                  onChange={(e) => settings.setCustomH(e.target.value)}
                  className="w-16 text-xs text-center rounded px-1 py-1 outline-none focus:border-blue-500"
                  style={{ background: "var(--input-bg)", border: "1px solid var(--input-border)", color: "var(--input-text)" }}
                />
                <button
                  onClick={() => settings.setCustomRes(false)}
                  className="text-xs px-1.5 py-1 rounded"
                  style={{ background: "var(--input-bg)", color: "var(--chrome-text-secondary)" }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-0.5">
                {RESOLUTION_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => settings.handleResolutionChange(p.label)}
                    className="text-xs px-2 py-1 rounded transition-colors"
                    style={
                      settings.resolution === p.label && !settings.customRes
                        ? { background: "var(--accent)", color: "var(--accent-text)" }
                        : { background: "var(--input-bg)", color: "var(--chrome-text-secondary)" }
                    }
                  >
                    {p.label === "Canvas"
                      ? `Canvas (${canvasWidth}\u00D7${canvasHeight})`
                      : p.label}
                  </button>
                ))}
                <button
                  onClick={() => {
                    settings.setCustomRes(true);
                    settings.setCustomW(String(canvasWidth));
                    settings.setCustomH(String(canvasHeight));
                  }}
                  className="text-xs px-2 py-1 rounded transition-colors"
                  style={{ background: "var(--input-bg)", color: "var(--chrome-text-secondary)" }}
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
