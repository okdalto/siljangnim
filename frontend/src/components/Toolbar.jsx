import { useState, useRef, useEffect, useCallback } from "react";
import SettingsMenu from "./SettingsMenu.jsx";
import PromptModeSelector from "./PromptModeSelector.jsx";
import useMobile from "../hooks/useMobile.js";

const PROVIDER_LABELS = { anthropic: "Claude", openai: "OpenAI", gemini: "Gemini", glm: "GLM", custom: "Custom" };

const PROVIDER_MODELS = {
  anthropic: [
    { id: "claude-sonnet-4-6", label: "Sonnet 4.6" },
    { id: "claude-opus-4-6", label: "Opus 4.6" },
    { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
  ],
  openai: [
    { id: "gpt-5.4", label: "GPT-5.4" },
    { id: "gpt-5.4-pro", label: "GPT-5.4 Pro" },
    { id: "gpt-5-mini", label: "GPT-5 Mini" },
    { id: "gpt-4o", label: "GPT-4o" },
    { id: "o3", label: "o3" },
  ],
  gemini: [
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
  ],
  glm: [
    { id: "glm-4-plus", label: "GLM-4 Plus" },
  ],
};

function ModelSelector({ provider, selectedModel, onModelChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const models = PROVIDER_MODELS[provider];
  if (!models || models.length <= 1) return null;

  const current = models.find((m) => m.id === selectedModel) || models[0];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded transition-colors"
        style={{ color: "var(--chrome-text-secondary)", background: "var(--input-bg)" }}
      >
        {current.label}
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 rounded-lg shadow-xl py-1 z-50 min-w-[140px]"
          style={{ background: "var(--chrome-bg-elevated)", border: "1px solid var(--chrome-border)" }}
        >
          {models.map((m) => (
            <button
              key={m.id}
              onClick={() => { onModelChange(m.id); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-xs transition-colors hover:bg-white/10 flex items-center justify-between"
              style={{ color: m.id === selectedModel ? "var(--chrome-text)" : "var(--chrome-text-secondary)" }}
            >
              {m.label}
              {m.id === selectedModel && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Toolbar({ onNewProject, activeProject, connected, provider, saveStatus, onChangeApiKey, onToggleTree, treeOpen, promptMode, onPromptModeChange, projectManifest, backendTarget, onBackendTargetChange, selectedModel, onModelChange, onProjectRename, githubAuth }) {
  const { isMobile } = useMobile();
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const editRef = useRef(null);

  const startEditing = useCallback(() => {
    if (!activeProject) return;
    setEditValue(activeProject);
    setEditing(true);
  }, [activeProject]);

  const commitRename = useCallback(() => {
    setEditing(false);
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== activeProject && onProjectRename) {
      onProjectRename(activeProject, trimmed);
    }
  }, [editValue, activeProject, onProjectRename]);

  useEffect(() => {
    if (editing && editRef.current) {
      editRef.current.focus();
      editRef.current.select();
    }
  }, [editing]);

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-50 h-10 flex items-center justify-between px-4 text-sm ${isMobile ? "mobile-toolbar" : ""}`}
      style={{ background: "var(--chrome-bg)", borderBottom: "1px solid var(--chrome-border)", color: "var(--chrome-text)" }}
    >
      {/* Left: actions */}
      <div className="flex items-center gap-2">
        {onToggleTree && (
          <button
            onClick={onToggleTree}
            className="w-7 h-7 flex items-center justify-center rounded transition-colors"
            style={{
              color: treeOpen ? "var(--chrome-text)" : "var(--chrome-text-secondary)",
              background: treeOpen ? "var(--accent-bg, rgba(99,102,241,0.15))" : "var(--input-bg)",
            }}
            title="Toggle Version Tree"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 3v12" />
              <circle cx="18" cy="6" r="3" />
              <circle cx="6" cy="18" r="3" />
              <path d="M18 9a9 9 0 01-9 9" />
            </svg>
          </button>
        )}
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
        {editing ? (
          <input
            ref={editRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setEditing(false);
            }}
            className="bg-transparent border-b text-xs font-medium text-center outline-none"
            style={{ color: "var(--chrome-text)", borderColor: "var(--accent-color, #6366f1)", width: Math.max(60, editValue.length * 7 + 16) }}
          />
        ) : (
          <span
            onDoubleClick={startEditing}
            className="cursor-default select-none"
            title={activeProject ? "Double-click to rename" : ""}
          >
            {activeProject || "Untitled"}
          </span>
        )}
        {projectManifest?.provenance?.source_type === "github" && projectManifest.provenance.github_repo && (
          <span className="flex items-center gap-1 flex-shrink-0" style={{ color: "var(--chrome-text-muted)" }} title={`From GitHub: ${projectManifest.provenance.github_repo}`}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            <span className="text-[10px]">from {projectManifest.provenance.github_repo}</span>
          </span>
        )}
        {saveStatus === "saving" && (
          <span className="flex-shrink-0 text-[10px]" style={{ color: "var(--chrome-text-muted)" }}>Saving...</span>
        )}
        {saveStatus === "saved" && activeProject && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0" style={{ color: "var(--chrome-text-muted)" }}>
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </div>

      {/* Right: prompt mode + connection status + settings */}
      <div className="flex items-center gap-3 text-xs">
        {!isMobile && onBackendTargetChange && (
          <div className="flex items-center gap-0.5 rounded overflow-hidden text-[10px]" style={{ border: "1px solid var(--chrome-border)" }}>
            {["auto", "webgl", "webgpu"].map((target) => (
              <button
                key={target}
                onClick={() => onBackendTargetChange(target)}
                className="px-2 py-0.5 transition-colors"
                style={{
                  background: backendTarget === target ? "var(--accent-color, #6366f1)" : "transparent",
                  color: backendTarget === target ? "#fff" : "var(--chrome-text-muted)",
                }}
              >
                {target === "auto" ? "Auto" : target === "webgl" ? "WebGL2" : "WebGPU"}
              </button>
            ))}
          </div>
        )}
        {!isMobile && onPromptModeChange && (
          <PromptModeSelector mode={promptMode || "hybrid"} onModeChange={onPromptModeChange} compact />
        )}
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
        {!isMobile && connected && provider && (
          <ModelSelector provider={provider} selectedModel={selectedModel} onModelChange={onModelChange} />
        )}
        <SettingsMenu
          onChangeApiKey={onChangeApiKey}
          {...(isMobile ? {
            backendTarget,
            onBackendTargetChange,
            promptMode,
            onPromptModeChange,
            selectedModel,
            onModelChange,
            provider,
            githubAuth,
          } : {})}
        />
      </div>
    </div>
  );
}
