import { useState, useEffect, useRef } from "react";

export default function SaveProjectForm({ projects, onSave, onCancel }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [overwriteConfirm, setOverwriteConfirm] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const sanitizeName = (n) => {
    let s = n.trim().toLowerCase();
    s = s.replace(/[^a-z0-9]+/g, "-");
    s = s.replace(/^-+|-+$/g, "");
    return s || "untitled";
  };

  const handleSave = (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const sanitized = sanitizeName(trimmed);
    const exists = projects.some((p) => p.name === sanitized);
    if (exists && overwriteConfirm !== sanitized) {
      setOverwriteConfirm(sanitized);
      return;
    }
    onSave?.(trimmed, description.trim() || undefined);
    onCancel?.();
  };

  const handleOverwriteConfirm = () => {
    const trimmed = name.trim();
    onSave?.(trimmed, description.trim() || undefined);
    onCancel?.();
  };

  return (
    <form onSubmit={handleSave} className="p-2 border-b border-zinc-700 flex flex-col gap-1.5 nodrag">
      <input
        ref={inputRef}
        type="text"
        value={name}
        onChange={(e) => { setName(e.target.value); setOverwriteConfirm(null); }}
        onKeyDown={(e) => e.stopPropagation()}
        placeholder="Project name..."
        className="bg-zinc-800 text-zinc-100 text-xs rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-indigo-500"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
        placeholder="Description (optional)"
        rows={2}
        className="bg-zinc-800 text-zinc-100 text-xs rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
      />
      {overwriteConfirm ? (
        <div className="bg-yellow-900/30 border border-yellow-600/50 rounded px-2.5 py-2 flex flex-col gap-1.5">
          <p className="text-[11px] text-yellow-400">
            Project "{overwriteConfirm}" already exists. Overwrite it?
          </p>
          <div className="flex items-center gap-2 self-end">
            <button
              type="button"
              onClick={() => setOverwriteConfirm(null)}
              className="text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleOverwriteConfirm}
              className="bg-yellow-600 hover:bg-yellow-500 text-white text-[11px] px-2.5 py-1 rounded transition-colors"
            >
              Overwrite
            </button>
          </div>
        </div>
      ) : (
        <button
          type="submit"
          className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 py-1.5 rounded transition-colors self-end"
        >
          Save
        </button>
      )}
    </form>
  );
}
