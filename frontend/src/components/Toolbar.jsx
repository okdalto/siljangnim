import SettingsMenu from "./SettingsMenu.jsx";

const PROVIDER_LABELS = { anthropic: "Claude", openai: "OpenAI", gemini: "Gemini", glm: "GLM", custom: "Custom" };

export default function Toolbar({ onNewProject, activeProject, connected, provider, saveStatus, onChangeApiKey }) {
  return (
    <div
      className="fixed top-0 left-0 right-0 z-40 h-10 flex items-center justify-between px-4 text-sm"
      style={{ background: "var(--chrome-bg)", borderBottom: "1px solid var(--chrome-border)", color: "var(--chrome-text)" }}
    >
      {/* Left: actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={onNewProject}
          className="text-xs px-2.5 py-1 rounded transition-colors"
          style={{ color: "var(--chrome-text-secondary)", background: "var(--input-bg)" }}
        >
          New Project
        </button>
      </div>

      {/* Center: project name + save status */}
      <div
        className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 text-xs font-medium truncate max-w-[40%] text-center"
        style={{ color: "var(--chrome-text-secondary)" }}
      >
        {activeProject || "Untitled"}
        {saveStatus === "unsaved" && (
          <div className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" title="Unsaved changes" />
        )}
        {saveStatus === "saving" && (
          <span className="flex-shrink-0" style={{ color: "var(--chrome-text-muted)" }}>Saving...</span>
        )}
      </div>

      {/* Right: connection status + settings */}
      <div className="flex items-center gap-3 text-xs">
        <div className="flex items-center gap-2" style={{ color: "var(--chrome-text)" }}>
          <div
            className={`w-2 h-2 rounded-full ${
              connected ? "bg-emerald-400" : "bg-red-400"
            }`}
          />
          {connected ? (provider ? PROVIDER_LABELS[provider] || provider : "Connected") : "Disconnected"}
        </div>
        <SettingsMenu onChangeApiKey={onChangeApiKey} />
      </div>
    </div>
  );
}
