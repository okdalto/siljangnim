import { useEffect, useRef, useState, useCallback } from "react";
import { NodeResizer } from "@xyflow/react";
import useStopWheelPropagation from "../hooks/useStopWheelPropagation.js";
import DebugAIDiagnosis from "../components/DebugAIDiagnosis.jsx";

const AGENT_COLORS = {
  "Art Director": "text-purple-400",
  "Tech Agent": "text-cyan-400",
  "TA Agent": "text-amber-400",
  WebGL: "text-rose-400",
  System: "text-zinc-400",
  Debugger: "text-orange-400",
};

const LEVEL_STYLES = {
  thinking: "italic text-zinc-500",
  info: "text-zinc-300",
  result: "text-emerald-400",
  error: "text-red-400",
  warning: "text-amber-400",
  compile: "text-rose-400",
  validation: "text-orange-400",
};

const TABS = [
  { id: "logs", label: "Runtime Logs" },
  { id: "compile", label: "Shader" },
  { id: "validation", label: "Validation" },
  { id: "diagnosis", label: "AI Diagnosis" },
];

const THINKING_PREVIEW_LEN = 120;

function ThinkingEntry({ agent, message }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = message.length > THINKING_PREVIEW_LEN;
  const toggle = useCallback((e) => {
    e.stopPropagation();
    setExpanded((v) => !v);
  }, []);

  return (
    <div className="leading-relaxed">
      <div className="flex gap-2">
        <span
          className={`shrink-0 font-semibold ${AGENT_COLORS[agent] || "text-zinc-400"}`}
        >
          [{agent}]
        </span>
        <span className="italic text-zinc-500 flex-1">
          {isLong ? (
            <>
              <button
                onClick={toggle}
                className="inline-flex items-center gap-1 hover:text-zinc-300 transition-colors cursor-pointer"
              >
                <span
                  className="inline-block transition-transform duration-150"
                  style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}
                >
                  ▶
                </span>
                <span className="text-zinc-600">[Thinking]</span>
              </button>
              {!expanded && (
                <span className="ml-1">
                  {message.slice(0, THINKING_PREVIEW_LEN)}...
                </span>
              )}
            </>
          ) : (
            <>
              <span className="text-zinc-600">[Thinking] </span>
              {message}
            </>
          )}
        </span>
      </div>
      {expanded && isLong && (
        <div className="ml-6 mt-1 mb-1 pl-3 border-l-2 border-zinc-700 text-zinc-500 italic whitespace-pre-wrap break-all">
          {message}
        </div>
      )}
    </div>
  );
}

function LogEntries({ logs, scrollRef }) {
  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto p-3 space-y-1 font-mono text-xs nodrag nowheel nopan select-text cursor-text"
    >
      {logs.length === 0 && (
        <p className="text-zinc-500 italic">
          Agent logs will appear here...
        </p>
      )}
      {logs.map((entry, i) =>
        entry.level === "thinking" ? (
          <ThinkingEntry key={i} agent={entry.agent} message={entry.message} />
        ) : (
          <div key={i} className="flex gap-2 leading-relaxed">
            <span
              className={`shrink-0 font-semibold ${AGENT_COLORS[entry.agent] || "text-zinc-400"}`}
            >
              [{entry.agent}]
            </span>
            <span className={`whitespace-pre-wrap break-all ${LEVEL_STYLES[entry.level] || "text-zinc-300"}`}>
              {entry.message}
            </span>
          </div>
        )
      )}
    </div>
  );
}

export default function DebugLogNode({ data, standalone = false, hideHeader = false }) {
  const [collapsed, setCollapsedRaw] = useState(() => data.initialCollapsed ?? false);
  const setCollapsed = useCallback((v) => {
    setCollapsedRaw((prev) => {
      const next = typeof v === "function" ? v(prev) : v;
      data.onCollapsedChange?.(next);
      return next;
    });
  }, [data.onCollapsedChange]);
  // Sync collapsed state when project is restored
  const prevInitCollapsed = useRef(data.initialCollapsed);
  useEffect(() => {
    if (data.initialCollapsed !== prevInitCollapsed.current) {
      prevInitCollapsed.current = data.initialCollapsed;
      setCollapsedRaw(data.initialCollapsed ?? false);
    }
  }, [data.initialCollapsed]);
  const [activeTab, setActiveTab] = useState("logs");
  const {
    logs = [],
    compileLogs = [],
    validationLogs = [],
    diagnosis = null,
    patches = [],
    simpleExplanation = null,
    backendName = "WebGL2",
    onApplyPatch,
    onRunDiagnosis,
  } = data;
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current && activeTab !== "diagnosis") {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, compileLogs, validationLogs, activeTab]);

  useStopWheelPropagation(scrollRef);

  // Count errors per tab for badges
  const compileErrorCount = compileLogs.filter((l) => l.level === "error" || l.level === "compile").length;
  const validationErrorCount = validationLogs.filter((l) => l.level === "error" || l.level === "validation").length;
  const diagnosisErrorCount = diagnosis?.errors?.filter((e) => e.severity === "error").length || 0;

  const filteredLogs = activeTab === "logs"
    ? logs.filter((l) => l.level !== "compile" && l.level !== "validation")
    : activeTab === "compile"
      ? compileLogs
      : activeTab === "validation"
        ? validationLogs
        : [];

  return (
    <div
      className={`node-container w-full ${collapsed ? "h-auto" : "h-full"} flex flex-col overflow-hidden ${standalone ? "" : "rounded-xl shadow-2xl"}`}
      style={standalone ? { background: "var(--node-bg)" } : { background: "var(--node-bg)", border: "1px solid var(--node-border)" }}
    >
      {!standalone && <NodeResizer minWidth={300} minHeight={150} lineStyle={{ borderColor: "transparent" }} handleStyle={{ opacity: 0 }} />}
      {/* Header */}
      {!(standalone && hideHeader) && (
      <div
        className={`px-4 py-2 text-sm font-semibold flex items-center justify-between ${standalone ? "" : "cursor-grab"}`}
        style={{ background: "var(--node-header-bg)", borderBottom: "1px solid var(--node-border)", color: "var(--chrome-text)" }}
        onDoubleClick={() => setCollapsed((v) => !v)}
      >
        <span>Debug Panel</span>
        {onRunDiagnosis && (
          <button
            onClick={(e) => { e.stopPropagation(); onRunDiagnosis(); }}
            className="text-[10px] px-2 py-0.5 rounded bg-orange-600/20 text-orange-300 hover:bg-orange-600/40 transition-colors nodrag"
            title="Run AI diagnosis on current scene"
          >
            Diagnose
          </button>
        )}
      </div>
      )}

      {/* Tabs */}
      {!collapsed && (
        <div
          className="flex border-b nodrag"
          style={{ borderColor: "var(--node-border)" }}
        >
          {TABS.map((tab) => {
            const badge =
              tab.id === "compile" ? compileErrorCount :
              tab.id === "validation" ? validationErrorCount :
              tab.id === "diagnosis" ? diagnosisErrorCount : 0;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 text-[10px] py-1.5 transition-colors relative ${
                  activeTab === tab.id
                    ? "text-zinc-200 border-b-2 border-indigo-400"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {tab.label}
                {badge > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-red-500/80 text-white text-[8px] font-bold">
                    {badge > 9 ? "9+" : badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Shader target badge */}
      {!collapsed && activeTab === "compile" && (
        <div className="flex items-center justify-between px-3 py-1.5" style={{ borderBottom: "1px solid var(--chrome-border)" }}>
          <span className="text-[10px]" style={{ color: "var(--chrome-text-muted)" }}>Shader Target</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${backendName === "WebGPU" ? "bg-emerald-900 text-emerald-400" : "bg-indigo-900 text-indigo-400"}`}>
            {backendName === "WebGPU" ? "WGSL / WebGPU" : "GLSL / WebGL2"}
          </span>
        </div>
      )}

      {/* Content */}
      {!collapsed && activeTab !== "diagnosis" && (
        <LogEntries logs={filteredLogs} scrollRef={scrollRef} />
      )}
      {!collapsed && activeTab === "diagnosis" && (
        <div ref={scrollRef} className="flex-1 overflow-y-auto nodrag nowheel nopan">
          <DebugAIDiagnosis
            diagnosis={diagnosis}
            patches={patches}
            onApplyPatch={onApplyPatch}
            simpleExplanation={simpleExplanation}
          />
        </div>
      )}
    </div>
  );
}
