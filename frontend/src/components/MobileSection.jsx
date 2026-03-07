import { useState } from "react";

export default function MobileSection({ title, defaultOpen = true, children }) {
  const [expanded, setExpanded] = useState(defaultOpen);

  return (
    <div className="mobile-scroll-section" style={expanded ? undefined : { height: "auto", minHeight: 0 }}>
      {/* Collapsible header */}
      <div
        onClick={() => setExpanded((v) => !v)}
        className="px-4 py-2 text-sm font-semibold flex items-center justify-between cursor-pointer select-none shrink-0"
        style={{
          background: "var(--node-header-bg)",
          borderBottom: "1px solid var(--node-border)",
          color: "var(--chrome-text)",
        }}
      >
        <span>{title}</span>
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          className="transition-transform duration-150"
          style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>
      {/* Content */}
      {expanded && (
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {children}
        </div>
      )}
    </div>
  );
}
