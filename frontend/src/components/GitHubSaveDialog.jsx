import useSaveFlow from "./github/useSaveFlow.js";
import RepoChooser from "./github/RepoChooser.jsx";
import SaveConfigurator from "./github/SaveConfigurator.jsx";

export default function GitHubSaveDialog({ token, user, projectName, captureThumbnail, onClose, onSaved }) {
  const flow = useSaveFlow({ token, user, projectName, captureThumbnail });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }}>
      <div
        className="rounded-lg shadow-2xl w-[480px] max-h-[80vh] overflow-y-auto"
        style={{ background: "var(--chrome-bg)", border: "1px solid var(--chrome-border)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--chrome-border)" }}>
          <div className="flex items-center gap-2">
            <GitHubIcon />
            <span className="text-sm font-semibold" style={{ color: "var(--chrome-text)" }}>
              Save to GitHub
            </span>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-4">
          {flow.error && (
            <div className="text-xs text-red-400 bg-red-900/30 px-3 py-2 rounded">{flow.error}</div>
          )}

          {flow.step === 1 && (
            <RepoChooser
              onChooseNew={() => { flow.setMode("new"); flow.setStep(2); }}
              onChooseExisting={() => { flow.setMode("existing"); flow.setStep(2); }}
            />
          )}

          {flow.step === 2 && (
            <SaveConfigurator
              flow={flow}
              onBack={() => flow.setStep(1)}
              onPush={() => flow.handleCreateAndPush(onSaved)}
            />
          )}

          {flow.step === 3 && flow.saving && (
            <div className="flex flex-col items-center py-6 gap-3">
              <div className="w-6 h-6 border-2 border-zinc-500 border-t-zinc-300 rounded-full animate-spin" />
              <span className="text-xs" style={{ color: "var(--chrome-text-muted)" }}>
                Pushing to GitHub...
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GitHubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style={{ color: "var(--chrome-text)" }}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}
