import { useState, useRef, useCallback } from "react";
import { saveUpload } from "../engine/storage.js";

/**
 * Warning bar shown above the canvas when assets are missing (excluded).
 * Allows drag-and-drop or file picker replacement of missing assets.
 *
 * @param {object} props
 * @param {Array<{filename: string, category?: string, mime_type?: string, file_size?: number}>} props.missingAssets
 * @param {() => void} props.onAssetsReplaced - called after all replacements to trigger scene reload
 */
export default function MissingAssetsBar({ missingAssets, onAssetsReplaced }) {
  const [expanded, setExpanded] = useState(false);
  const [replaced, setReplaced] = useState(new Set());
  const fileInputRef = useRef(null);
  const [activeAsset, setActiveAsset] = useState(null);
  const [extWarning, setExtWarning] = useState(null);
  const pendingFileRef = useRef(null);

  const remaining = missingAssets.filter((a) => !replaced.has(a.filename));

  const handleFileSelect = useCallback(async (targetAsset, file) => {
    const origExt = targetAsset.filename.split(".").pop()?.toLowerCase();
    const newExt = file.name.split(".").pop()?.toLowerCase();

    if (origExt && newExt && origExt !== newExt) {
      pendingFileRef.current = { targetAsset, file };
      setExtWarning({ original: origExt, selected: newExt, filename: targetAsset.filename });
      return;
    }

    await doReplace(targetAsset, file);
  }, []);

  const doReplace = useCallback(async (targetAsset, file) => {
    const buffer = await file.arrayBuffer();
    await saveUpload(targetAsset.filename, buffer, file.type || targetAsset.mime_type);
    setReplaced((prev) => new Set([...prev, targetAsset.filename]));
    setExtWarning(null);
    pendingFileRef.current = null;

    // Check if all assets are now replaced
    const newReplaced = new Set([...replaced, targetAsset.filename]);
    if (remaining.length <= 1) {
      onAssetsReplaced?.();
    }
  }, [replaced, remaining, onAssetsReplaced]);

  const confirmExtWarning = useCallback(() => {
    if (pendingFileRef.current) {
      doReplace(pendingFileRef.current.targetAsset, pendingFileRef.current.file);
    }
  }, [doReplace]);

  const cancelExtWarning = useCallback(() => {
    setExtWarning(null);
    pendingFileRef.current = null;
  }, []);

  if (remaining.length === 0) return null;

  return (
    <div className="absolute top-0 left-0 right-0 z-10">
      {/* Collapsed bar */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-amber-900/50 transition-colors"
        style={{ background: "rgba(180, 120, 0, 0.85)", color: "#fff", backdropFilter: "blur(4px)" }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <span>{remaining.length} missing asset{remaining.length > 1 ? "s" : ""}. Click to add/replace.</span>
        <svg
          width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className="ml-auto"
          style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s" }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Expanded asset list */}
      {expanded && (
        <div
          className="px-3 py-2 space-y-1 max-h-48 overflow-y-auto"
          style={{ background: "rgba(30, 30, 30, 0.95)", borderBottom: "1px solid rgba(180, 120, 0, 0.5)", backdropFilter: "blur(4px)" }}
        >
          {remaining.map((asset) => (
            <div key={asset.filename} className="flex items-center gap-2 text-xs text-zinc-300">
              <span className="truncate flex-1">{asset.filename}</span>
              <span className="text-[10px] text-zinc-500">
                {asset.mime_type || "unknown"}
              </span>
              <button
                onClick={() => {
                  setActiveAsset(asset);
                  fileInputRef.current?.click();
                }}
                className="px-2 py-0.5 rounded text-[10px] font-medium transition-colors"
                style={{ background: "#238636", color: "#fff" }}
              >
                Replace
              </button>
            </div>
          ))}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file && activeAsset) {
                handleFileSelect(activeAsset, file);
              }
              e.target.value = "";
            }}
          />
        </div>
      )}

      {/* Extension mismatch warning */}
      {extWarning && (
        <div
          className="px-3 py-2 flex items-center gap-2 text-xs"
          style={{ background: "rgba(180, 60, 0, 0.9)", color: "#fff", borderBottom: "1px solid rgba(180, 60, 0, 0.5)" }}
        >
          <span>
            Original is .{extWarning.original} but you selected .{extWarning.selected}. Use anyway?
          </span>
          <button
            onClick={confirmExtWarning}
            className="px-2 py-0.5 rounded font-medium"
            style={{ background: "#238636" }}
          >
            Yes
          </button>
          <button
            onClick={cancelExtWarning}
            className="px-2 py-0.5 rounded font-medium"
            style={{ background: "rgba(255,255,255,0.2)" }}
          >
            No
          </button>
        </div>
      )}
    </div>
  );
}
