import { useState, useCallback } from "react";

/** Simple regex-based JS syntax highlighting — returns array of React spans */
function highlightJS(code) {
  if (!code) return null;
  const TOKEN_RE =
    /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b(?:const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|this|class|extends|import|export|from|default|try|catch|finally|throw|typeof|instanceof|in|of|async|await|yield|void|null|undefined|true|false)\b)|(\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b)|(\b[a-zA-Z_$][\w$]*(?=\s*\())/g;

  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = TOKEN_RE.exec(code)) !== null) {
    if (match.index > lastIndex) {
      parts.push(code.slice(lastIndex, match.index));
    }
    const [full, comment, string, keyword, number, funcCall] = match;
    if (comment) {
      parts.push(<span key={match.index} style={{ color: "#6b7280" }}>{full}</span>);
    } else if (string) {
      parts.push(<span key={match.index} style={{ color: "#4ade80" }}>{full}</span>);
    } else if (keyword) {
      parts.push(<span key={match.index} style={{ color: "#c084fc" }}>{full}</span>);
    } else if (number) {
      parts.push(<span key={match.index} style={{ color: "#fb923c" }}>{full}</span>);
    } else if (funcCall) {
      parts.push(<span key={match.index} style={{ color: "#60a5fa" }}>{full}</span>);
    }
    lastIndex = match.index + full.length;
  }
  if (lastIndex < code.length) {
    parts.push(code.slice(lastIndex));
  }
  return parts;
}

export default function CodePreviewPanel({ script, onClose }) {
  const tabs = ["setup", "render", "cleanup"].filter((t) => script?.[t]);
  const [activeTab, setActiveTab] = useState(() => {
    if (script?.render) return "render";
    return tabs[0] || "render";
  });
  const [copied, setCopied] = useState(false);

  const code = script?.[activeTab] || "";

  const handleCopy = useCallback(async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  }, [code]);

  if (tabs.length === 0) {
    return (
      <div
        onClick={(e) => e.stopPropagation()}
        className="px-3 py-3 border-b border-zinc-700 bg-zinc-900/80"
      >
        <p className="text-[10px] text-zinc-500 italic">No script code in this project.</p>
      </div>
    );
  }

  return (
    <div onClick={(e) => e.stopPropagation()} className="border-b border-zinc-700 bg-zinc-900/80">
      <div className="flex items-center gap-0 px-2 pt-1.5 border-b border-zinc-800">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={(e) => { e.stopPropagation(); setActiveTab(t); setCopied(false); }}
            className={`text-[10px] px-2 py-1 rounded-t transition-colors ${
              activeTab === t
                ? "bg-zinc-800 text-zinc-200 font-medium"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {t}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={handleCopy}
          className="text-[10px] text-zinc-500 hover:text-zinc-300 px-1.5 py-0.5 transition-colors"
          title="Copy code"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <div className="max-h-[300px] overflow-auto">
        <pre className="p-2 text-[11px] leading-relaxed font-mono text-zinc-300 whitespace-pre-wrap break-all">
          <code>{highlightJS(code)}</code>
        </pre>
      </div>
    </div>
  );
}
