import { useState, useCallback, useEffect } from "react";
import * as storage from "../../engine/storage.js";
import useExternalUniformChange from "../../hooks/useExternalUniformChange.js";

/**
 * Image picker control — shows a dropdown of uploaded images.
 * The selected image's blob URL is set as the uniform value (string).
 * In scripts, use: ctx.uploads[ctx.uniforms.u_image]
 *
 * ctrl.filter — optional mime prefix filter (e.g. "image/")
 */
export default function ImagePickerControl({ ctrl, onUniformChange }) {
  const [files, setFiles] = useState([]);
  const [selected, setSelected] = useState(ctrl.default || "");
  const [thumbUrl, setThumbUrl] = useState(null);

  useExternalUniformChange(ctrl.uniform, (v) => {
    if (typeof v === "string") setSelected(v);
  });

  // Sync from ctrl.default when the agent updates uniform values
  const ctrlDefault = ctrl.default;
  useEffect(() => { setSelected(ctrlDefault || ""); }, [ctrlDefault]);

  // Load uploaded file list
  useEffect(() => {
    let mounted = true;
    (async () => {
      const list = await storage.listUploads();
      const filtered = [];
      const filter = ctrl.filter || "image/";
      for (const name of list) {
        try {
          const info = await storage.getUploadInfo(name);
          if (info.mime_type.startsWith(filter)) {
            filtered.push({ name, mime_type: info.mime_type, size: info.size });
          }
        } catch { /* skip */ }
      }
      if (mounted) setFiles(filtered);
    })();
    return () => { mounted = false; };
  }, [ctrl.filter]);

  // Listen for new uploads
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.files) {
        // Re-fetch list
        (async () => {
          const list = await storage.listUploads();
          const filtered = [];
          const filter = ctrl.filter || "image/";
          for (const name of list) {
            try {
              const info = await storage.getUploadInfo(name);
              if (info.mime_type.startsWith(filter)) {
                filtered.push({ name, mime_type: info.mime_type, size: info.size });
              }
            } catch { /* skip */ }
          }
          setFiles(filtered);
        })();
      }
    };
    window.addEventListener("files-uploaded", handler);
    return () => window.removeEventListener("files-uploaded", handler);
  }, [ctrl.filter]);

  // Generate thumbnail for selected file
  useEffect(() => {
    if (!selected) { setThumbUrl(null); return; }
    let mounted = true;
    let objectUrl = null;
    (async () => {
      try {
        const blob = await storage.readUpload(selected);
        if (!mounted) return;
        objectUrl = URL.createObjectURL(new Blob([blob.data], { type: blob.mime_type }));
        setThumbUrl(objectUrl);
      } catch { if (mounted) setThumbUrl(null); }
    })();
    return () => {
      mounted = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [selected]);

  const handleChange = useCallback(
    (e) => {
      const name = e.target.value;
      setSelected(name);
      onUniformChange?.(ctrl.uniform, name);
    },
    [ctrl.uniform, onUniformChange]
  );

  return (
    <div className="space-y-1">
      <label className="text-xs text-zinc-400">{ctrl.label}</label>
      <select
        value={selected}
        onChange={handleChange}
        className="w-full bg-zinc-800 text-zinc-200 text-xs rounded px-2 py-1.5 border border-zinc-600 outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
      >
        <option value="">— none —</option>
        {files.map((f) => (
          <option key={f.name} value={f.name}>{f.name}</option>
        ))}
      </select>
      {thumbUrl && (
        <img
          src={thumbUrl}
          alt={selected}
          className="w-full h-16 object-contain rounded bg-zinc-900"
        />
      )}
    </div>
  );
}
