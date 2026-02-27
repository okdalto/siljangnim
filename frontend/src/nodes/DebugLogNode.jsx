import { useEffect, useRef } from "react";

const AGENT_COLORS = {
  "Art Director": "text-purple-400",
  "Tech Agent": "text-cyan-400",
  "TA Agent": "text-amber-400",
  System: "text-zinc-400",
};

const LEVEL_STYLES = {
  thinking: "italic text-zinc-500",
  info: "text-zinc-300",
  result: "text-emerald-400",
  error: "text-red-400",
};

export default function DebugLogNode({ data }) {
  const { logs = [] } = data;
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="w-96 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2 bg-zinc-800 border-b border-zinc-700 text-sm font-semibold text-zinc-300 cursor-grab">
        Debug Log
      </div>

      {/* Log entries */}
      <div
        ref={scrollRef}
        className="min-h-48 max-h-72 overflow-y-auto p-3 space-y-1 font-mono text-xs nodrag nowheel"
      >
        {logs.length === 0 && (
          <p className="text-zinc-500 italic">
            Agent logs will appear here...
          </p>
        )}
        {logs.map((entry, i) => (
          <div key={i} className="flex gap-2 leading-relaxed">
            <span
              className={`shrink-0 font-semibold ${AGENT_COLORS[entry.agent] || "text-zinc-400"}`}
            >
              [{entry.agent}]
            </span>
            <span className={LEVEL_STYLES[entry.level] || "text-zinc-300"}>
              {entry.message}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
