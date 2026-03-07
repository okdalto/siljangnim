import { useState, useCallback } from "react";

/**
 * Collapsible group — wraps child controls in a foldable section.
 * Used by CustomPanelNode to render ctrl.type === "group".
 *
 * ctrl.label      — group header text
 * ctrl.collapsed  — initial collapsed state (default false)
 * ctrl.children   — array of child control definitions (rendered by parent)
 *
 * renderChild is passed by CustomPanelNode to render each child control.
 */
export default function CollapsibleGroupControl({ ctrl, renderChild }) {
  const [open, setOpen] = useState(!ctrl.collapsed);

  const toggle = useCallback(() => setOpen((v) => !v), []);

  return (
    <div className="border border-zinc-700 rounded overflow-hidden">
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center justify-between px-2 py-1.5 bg-zinc-800/50 hover:bg-zinc-800 transition-colors text-left"
      >
        <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
          {ctrl.label}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className={`text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <polyline points="4 6 8 10 12 6" />
        </svg>
      </button>
      {open && (
        <div className="p-2 space-y-1 border-t border-zinc-700">
          {(ctrl.children || []).map((child, i) => renderChild(child, i))}
        </div>
      )}
    </div>
  );
}
