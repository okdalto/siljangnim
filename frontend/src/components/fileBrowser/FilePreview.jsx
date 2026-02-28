import { useState, useEffect } from "react";
import { formatBytes } from "./fileUtils.js";

export default function FilePreview({ file, baseUrl, onClose }) {
  const [textContent, setTextContent] = useState(null);
  const [loading, setLoading] = useState(false);

  const fileUrl = `${baseUrl}/${file.path}`;
  const mime = file.mime_type || "";

  // Fetch text/json content
  useEffect(() => {
    if (mime.startsWith("text/") || mime === "application/json") {
      setLoading(true);
      fetch(fileUrl)
        .then((r) => r.text())
        .then((t) => setTextContent(t))
        .catch(() => setTextContent("(failed to load)"))
        .finally(() => setLoading(false));
    }
  }, [fileUrl, mime]);

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="border-t border-zinc-700 bg-zinc-900/90"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-zinc-800">
        <span className="text-[10px] text-zinc-400 truncate">{file.name || file.path}</span>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[9px] text-zinc-600">{formatBytes(file.size)}</span>
          <a
            href={fileUrl}
            download={file.name}
            className="text-[10px] text-indigo-400 hover:text-indigo-300"
          >
            Download
          </a>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 text-[10px]"
          >
            Close
          </button>
        </div>
      </div>

      {/* Preview body */}
      <div className="max-h-[250px] overflow-auto">
        {mime.startsWith("image/") && (
          <div className="flex items-center justify-center p-2 bg-zinc-950/50">
            <img
              src={fileUrl}
              alt={file.name}
              className="max-w-full max-h-[220px] object-contain rounded"
            />
          </div>
        )}

        {mime.startsWith("audio/") && (
          <div className="p-2">
            <audio controls src={fileUrl} className="w-full h-8" />
          </div>
        )}

        {mime.startsWith("video/") && (
          <div className="p-2 flex justify-center bg-zinc-950/50">
            <video controls src={fileUrl} className="max-w-full max-h-[220px] rounded" />
          </div>
        )}

        {(mime.startsWith("text/") || mime === "application/json") && (
          loading ? (
            <div className="p-2 text-[10px] text-zinc-500">Loading...</div>
          ) : (
            <pre className="p-2 text-[10px] leading-relaxed font-mono text-zinc-400 whitespace-pre-wrap break-all">
              {textContent}
            </pre>
          )
        )}

        {/* Fallback: non-previewable */}
        {!mime.startsWith("image/") &&
         !mime.startsWith("audio/") &&
         !mime.startsWith("video/") &&
         !mime.startsWith("text/") &&
         mime !== "application/json" && (
          <div className="p-3 text-center">
            <p className="text-[10px] text-zinc-500 mb-1">{mime}</p>
            <a
              href={fileUrl}
              download={file.name}
              className="text-[11px] text-indigo-400 hover:text-indigo-300 underline"
            >
              Download file
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
