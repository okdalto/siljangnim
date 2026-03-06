import SettingsMenu from "./SettingsMenu.jsx";
import useMobile from "../hooks/useMobile.js";

const PROVIDER_LABELS = { anthropic: "Claude", openai: "OpenAI", gemini: "Gemini", glm: "GLM", custom: "Custom" };

export default function Toolbar({ onNewProject, activeProject, connected, provider, saveStatus, onChangeApiKey }) {
  const { isMobile } = useMobile();

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-40 h-10 flex items-center justify-between px-4 text-sm ${isMobile ? "mobile-toolbar" : ""}`}
      style={{ background: "var(--chrome-bg)", borderBottom: "1px solid var(--chrome-border)", color: "var(--chrome-text)" }}
    >
      {/* Left: actions */}
      <div className="flex items-center gap-2">
        {isMobile ? (
          <button
            onClick={onNewProject}
            className="w-7 h-7 flex items-center justify-center rounded transition-colors"
            style={{ color: "var(--chrome-text-secondary)", background: "var(--input-bg)" }}
            title="New Project"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        ) : (
          <button
            onClick={onNewProject}
            className="text-xs px-2.5 py-1 rounded transition-colors"
            style={{ color: "var(--chrome-text-secondary)", background: "var(--input-bg)" }}
          >
            New Project
          </button>
        )}
      </div>

      {/* Center: project name + save status */}
      <div
        className={`absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 text-xs font-medium truncate text-center ${isMobile ? "max-w-[30%]" : "max-w-[40%]"}`}
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
        <button
          onClick={onChangeApiKey}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity cursor-pointer"
          style={{ color: "var(--chrome-text)" }}
          title="Change provider"
        >
          <div
            className={`w-2 h-2 rounded-full ${
              connected ? "bg-emerald-400" : "bg-red-400"
            }`}
          />
          {!isMobile && (connected ? (provider ? PROVIDER_LABELS[provider] || provider : "Connected") : "Disconnected")}
        </button>
        <SettingsMenu onChangeApiKey={onChangeApiKey} />
      </div>
    </div>
  );
}
