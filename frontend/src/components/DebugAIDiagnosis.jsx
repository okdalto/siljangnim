import { useState, useCallback } from "react";

const SEVERITY_STYLES = {
  error: "text-red-400 bg-red-900/20 border-red-800/40",
  warning: "text-amber-400 bg-amber-900/20 border-amber-800/40",
  info: "text-blue-400 bg-blue-900/20 border-blue-800/40",
};

const TYPE_LABELS = {
  glsl_compile: "GLSL",
  wgsl_compile: "WGSL",
  uniform_mismatch: "Uniform",
  framebuffer_mismatch: "FBO",
  pipeline_mismatch: "Pipeline",
  missing_asset: "Asset",
  nan_artifact: "NaN",
  performance: "Perf",
  runtime: "Runtime",
};

function HealthBar({ score }) {
  const color = score >= 80 ? "bg-emerald-400" : score >= 50 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-zinc-700 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-[10px] font-mono text-zinc-400">{score}/100</span>
    </div>
  );
}

function DiagnosisEntry({ error, onApplyPatch, patches, safeOnly, simpleMode }) {
  const [expanded, setExpanded] = useState(false);
  const patch = patches?.find((p) => p.errorId === error.id);

  return (
    <div className={`rounded border px-2 py-1.5 text-[11px] ${SEVERITY_STYLES[error.severity] || SEVERITY_STYLES.info}`}>
      <div className="flex items-center gap-1.5 cursor-pointer" onClick={() => setExpanded((v) => !v)}>
        <span className="inline-block transition-transform" style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)", fontSize: 8 }}>
          ▶
        </span>
        <span className="font-mono text-[9px] px-1 rounded bg-black/20">{TYPE_LABELS[error.type] || error.type}</span>
        <span className="flex-1 truncate">{error.title}</span>
        {error.autoFixable && patch && (
          <button
            className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-600/30 text-emerald-300 hover:bg-emerald-600/50 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              if (safeOnly && !patch.safe) return;
              onApplyPatch?.(patch);
            }}
            title={safeOnly && !patch.safe ? "Unsafe fix blocked by Safe Fix Only mode" : "Apply fix"}
            disabled={safeOnly && !patch.safe}
          >
            Fix
          </button>
        )}
      </div>
      {expanded && (
        <div className="mt-1.5 ml-3 space-y-1">
          <p className="text-zinc-300 whitespace-pre-wrap">
            {simpleMode ? (error.detail?.split(".")[0] + ".") : error.detail}
          </p>
          {error.location?.section && (
            <p className="text-zinc-500 text-[10px]">
              Location: {error.location.section}{error.location.line != null ? `:${error.location.line}` : ""}
            </p>
          )}
          {error.suggestions?.length > 0 && (
            <div className="space-y-0.5">
              <p className="text-zinc-500 text-[10px]">Suggestions:</p>
              {error.suggestions.map((s, i) => (
                <p key={i} className="text-zinc-400 text-[10px] ml-2">• {s}</p>
              ))}
            </div>
          )}
          {patch && (
            <div className="mt-1 p-1.5 rounded bg-black/30 font-mono text-[10px]">
              <p className="text-zinc-500 mb-0.5">{patch.description}</p>
              <p className="text-zinc-500">Confidence: {Math.round(patch.confidence * 100)}%{patch.safe ? " (safe)" : " (review recommended)"}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DebugAIDiagnosis({ diagnosis, patches, onApplyPatch, simpleExplanation }) {
  const [safeOnly, setSafeOnly] = useState(true);
  const [simpleMode, setSimpleMode] = useState(false);

  if (!diagnosis) {
    return (
      <div className="p-2 text-[11px] text-zinc-500 italic">
        No diagnosis available. Errors will be analyzed automatically.
      </div>
    );
  }

  return (
    <div className="space-y-2 p-2">
      {/* Health score */}
      <HealthBar score={diagnosis.healthScore} />

      {/* Summary */}
      <p className="text-[11px] text-zinc-300">{simpleMode && simpleExplanation ? simpleExplanation : diagnosis.summary}</p>

      {/* Controls */}
      <div className="flex items-center gap-3 text-[10px]">
        <label className="flex items-center gap-1 text-zinc-400 cursor-pointer">
          <input
            type="checkbox"
            checked={safeOnly}
            onChange={(e) => setSafeOnly(e.target.checked)}
            className="w-3 h-3 accent-emerald-500"
          />
          Safe fix only
        </label>
        <label className="flex items-center gap-1 text-zinc-400 cursor-pointer">
          <input
            type="checkbox"
            checked={simpleMode}
            onChange={(e) => setSimpleMode(e.target.checked)}
            className="w-3 h-3 accent-blue-500"
          />
          Explain simply
        </label>
      </div>

      {/* Error list */}
      <div className="space-y-1.5">
        {diagnosis.errors.map((error) => (
          <DiagnosisEntry
            key={error.id}
            error={error}
            patches={patches}
            onApplyPatch={onApplyPatch}
            safeOnly={safeOnly}
            simpleMode={simpleMode}
          />
        ))}
      </div>

      {diagnosis.errors.length === 0 && (
        <p className="text-[11px] text-emerald-400">All clear — no issues detected.</p>
      )}
    </div>
  );
}
