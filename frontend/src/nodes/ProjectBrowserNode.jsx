import { useState, useEffect, useRef } from "react";
import { NodeResizer } from "@xyflow/react";

function timeAgo(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function ProjectBrowserNode({ data }) {
  const {
    projects = [],
    activeProject,
    onSave,
    onLoad,
    onDelete,
  } = data;

  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const inputRef = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (saving && inputRef.current) inputRef.current.focus();
  }, [saving]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleWheel = (e) => e.stopPropagation();
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  const handleSave = (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave?.(trimmed);
    setName("");
    setSaving(false);
  };

  return (
    <div className="w-full h-full bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl flex flex-col overflow-hidden">
      <NodeResizer minWidth={240} minHeight={150} lineStyle={{ borderColor: "transparent" }} handleStyle={{ opacity: 0 }} />
      {/* Header */}
      <div className="px-4 py-2 bg-zinc-800 border-b border-zinc-700 text-sm font-semibold text-zinc-300 cursor-grab flex items-center justify-between">
        Projects
        <button
          onClick={() => setSaving((v) => !v)}
          className="nodrag text-xs text-zinc-500 hover:text-zinc-200 bg-zinc-700 hover:bg-zinc-600 px-2 py-0.5 rounded transition-colors"
        >
          {saving ? "Cancel" : "Save"}
        </button>
      </div>

      {/* Save form */}
      {saving && (
        <form onSubmit={handleSave} className="p-2 border-b border-zinc-700 flex gap-2 nodrag">
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="Project name..."
            className="flex-1 bg-zinc-800 text-zinc-100 text-xs rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <button
            type="submit"
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 py-1.5 rounded transition-colors"
          >
            Save
          </button>
        </form>
      )}

      {/* Project list */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto nodrag nowheel nopan"
      >
        {projects.length === 0 && (
          <p className="text-zinc-500 italic text-xs p-3">
            No saved projects yet.
          </p>
        )}
        {projects.map((p) => {
          const isActive = activeProject === p.name;
          return (
            <div
              key={p.name}
              onClick={() => onLoad?.(p.name)}
              className={`group px-3 py-2 cursor-pointer hover:bg-zinc-800 transition-colors border-l-2 ${
                isActive
                  ? "border-indigo-500 bg-zinc-800/50"
                  : "border-transparent"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-200 truncate">
                  {p.display_name || p.name}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete?.(p.name);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 text-xs ml-2 transition-opacity"
                >
                  x
                </button>
              </div>
              {p.description && (
                <p className="text-[10px] text-zinc-500 truncate mt-0.5">
                  {p.description}
                </p>
              )}
              <p className="text-[10px] text-zinc-600 mt-0.5">
                {timeAgo(p.updated_at)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
