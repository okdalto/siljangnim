import { useState, useCallback } from "react";

/**
 * SafeModeBanner — shown when a project has trust.safe_mode === true.
 * Blocks script execution until the user explicitly trusts the project.
 */
export default function SafeModeBanner({ manifest, onTrust, onForkRemix }) {
  const [showCode, setShowCode] = useState(false);
  const [codeContent, setCodeContent] = useState(null);
  const [loading, setLoading] = useState(false);

  const provenance = manifest?.provenance || {};
  const sourceLabel =
    provenance.source_type === "github"
      ? `GitHub: ${provenance.github_repo || "unknown"}`
      : provenance.source_type === "zip"
      ? "Imported from ZIP"
      : "External source";

  const handleReviewCode = useCallback(async () => {
    if (showCode) {
      setShowCode(false);
      return;
    }
    setLoading(true);
    try {
      // Try to read scene.json from storage to show script content
      const { readJson } = await import("../engine/storage.js");
      const scene = await readJson("scene.json");
      setCodeContent(scene?.script || null);
    } catch {
      setCodeContent(null);
    }
    setLoading(false);
    setShowCode(true);
  }, [showCode]);

  const handleTrust = useCallback(() => {
    if (window.confirm("This will enable script execution for this project. Are you sure?")) {
      onTrust?.();
    }
  }, [onTrust]);

  return (
    <div style={{
      position: "fixed",
      top: 40,
      left: 0,
      right: 0,
      zIndex: 50,
      background: "linear-gradient(135deg, #b45309 0%, #92400e 100%)",
      borderBottom: "1px solid #d97706",
      color: "#fef3c7",
      fontSize: 13,
    }}>
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-3">
          {/* Shield icon */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <div>
            <span className="font-semibold">Safe Mode</span>
            <span className="ml-2 opacity-80">
              Scripts are blocked. Source: {sourceLabel}
            </span>
            {provenance.original_author && (
              <span className="ml-1 opacity-60">by {provenance.original_author}</span>
            )}
            {provenance.imported_commit_sha ? (
              <span className="ml-1 opacity-50 text-[11px]">
                ({provenance.imported_commit_sha.slice(0, 7)})
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleReviewCode}
            className="px-3 py-1 rounded text-xs font-medium transition-colors"
            style={{
              background: "rgba(255,255,255,0.15)",
              color: "#fef3c7",
              border: "1px solid rgba(255,255,255,0.2)",
            }}
          >
            {showCode ? "Hide Code" : "Review Code"}
          </button>
          <button
            onClick={handleTrust}
            className="px-3 py-1 rounded text-xs font-semibold transition-colors"
            style={{
              background: "#16a34a",
              color: "#fff",
              border: "1px solid #22c55e",
            }}
          >
            Trust & Run
          </button>
          {provenance.source_type === "github" && onForkRemix && (
            <button
              onClick={onForkRemix}
              className="px-3 py-1 rounded text-xs font-medium transition-colors"
              style={{
                background: "rgba(99,102,241,0.8)",
                color: "#fff",
                border: "1px solid rgba(99,102,241,0.6)",
              }}
            >
              Fork & Remix
            </button>
          )}
        </div>
      </div>

      {/* Code review panel */}
      {showCode && (
        <div
          style={{
            background: "rgba(0,0,0,0.4)",
            borderTop: "1px solid rgba(255,255,255,0.1)",
            maxHeight: 300,
            overflow: "auto",
          }}
          className="px-4 py-3"
        >
          {loading ? (
            <div className="text-xs opacity-60">Loading...</div>
          ) : codeContent ? (
            <div className="space-y-3">
              {codeContent.setup && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide opacity-60 mb-1">Setup</div>
                  <pre className="text-[11px] whitespace-pre-wrap opacity-90 font-mono leading-relaxed">{codeContent.setup}</pre>
                </div>
              )}
              {codeContent.render && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide opacity-60 mb-1">Render</div>
                  <pre className="text-[11px] whitespace-pre-wrap opacity-90 font-mono leading-relaxed">{codeContent.render}</pre>
                </div>
              )}
              {codeContent.cleanup && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide opacity-60 mb-1">Cleanup</div>
                  <pre className="text-[11px] whitespace-pre-wrap opacity-90 font-mono leading-relaxed">{codeContent.cleanup}</pre>
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs opacity-60">No script content found.</div>
          )}
        </div>
      )}
    </div>
  );
}
