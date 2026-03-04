import { useState, useEffect, useRef } from "react";

export default function SaveProjectForm({ onSave, onCancel }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSave = (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave?.(trimmed, description.trim() || undefined);
    onCancel?.();
  };

  return (
    <form onSubmit={handleSave} className="p-2 border-b border-zinc-700 flex flex-col gap-1.5 nodrag">
      <input
        ref={inputRef}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
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
      <button
        type="submit"
        className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 py-1.5 rounded transition-colors self-end"
      >
        Save
      </button>
    </form>
  );
}
