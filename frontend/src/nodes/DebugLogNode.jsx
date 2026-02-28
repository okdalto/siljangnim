import { useEffect, useRef, useState, useCallback } from "react";
import { NodeResizer } from "@xyflow/react";

const AGENT_COLORS = {
  "Art Director": "text-purple-400",
  "Tech Agent": "text-cyan-400",
  "TA Agent": "text-amber-400",
  WebGL: "text-rose-400",
  System: "text-zinc-400",
};

const LEVEL_STYLES = {
  thinking: "italic text-zinc-500",
  info: "text-zinc-300",
  result: "text-emerald-400",
  error: "text-red-400",
};

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

export default function DebugLogNode({ data }) {
  const { logs = [] } = data;
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleWheel = (e) => {
      e.stopPropagation();
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  return (
    <div className="w-full h-full bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl flex flex-col overflow-hidden">
      <NodeResizer minWidth={300} minHeight={150} lineStyle={{ borderColor: "transparent" }} handleStyle={{ opacity: 0 }} />
      {/* Header */}
      <div className="px-4 py-2 bg-zinc-800 border-b border-zinc-700 text-sm font-semibold text-zinc-300 cursor-grab">
        Debug Log
      </div>

      {/* Log entries */}
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
    </div>
  );
}
