export default function Toolbar({ onNewProject, activeProject, connected, saveStatus }) {
  return (
    <div className="fixed top-0 left-0 right-0 z-40 h-10 bg-zinc-800 border-b border-zinc-700 flex items-center justify-between px-4 text-sm text-zinc-300">
      {/* Left: actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={onNewProject}
          className="text-xs text-zinc-400 hover:text-zinc-100 bg-zinc-700 hover:bg-zinc-600 px-2.5 py-1 rounded transition-colors"
        >
          New Project
        </button>
      </div>

      {/* Center: project name + save status */}
      <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 text-xs font-medium text-zinc-400 truncate max-w-[40%] text-center">
        {activeProject || "Untitled"}
        {saveStatus === "unsaved" && (
          <div className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" title="Unsaved changes" />
        )}
        {saveStatus === "saving" && (
          <span className="text-zinc-500 flex-shrink-0">Saving...</span>
        )}
      </div>

      {/* Right: connection status */}
      <div className="flex items-center gap-2 text-xs">
        <div
          className={`w-2 h-2 rounded-full ${
            connected ? "bg-emerald-400" : "bg-red-400"
          }`}
        />
        {connected ? "Connected" : "Disconnected"}
      </div>
    </div>
  );
}
