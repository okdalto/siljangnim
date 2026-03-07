import { useRef, useState, useCallback } from "react";

/**
 * Simple code/text editor control.
 * Outputs the text string as the uniform value.
 * Useful for live GLSL snippet editing or custom expressions.
 *
 * ctrl.language — hint label (e.g. "GLSL", "JS")
 * ctrl.height   — textarea height in px (default 120)
 */
export default function CodeControl({ ctrl, onUniformChange }) {
  const [code, setCode] = useState(ctrl.default || "");
  const textareaRef = useRef(null);
  const height = ctrl.height || 120;

  const handleChange = useCallback(
    (e) => {
      const val = e.target.value;
      setCode(val);
      onUniformChange?.(ctrl.uniform, val);
    },
    [ctrl.uniform, onUniformChange]
  );

  const handleKeyDown = useCallback((e) => {
    // Allow Tab inside textarea
    if (e.key === "Tab") {
      e.preventDefault();
      e.stopPropagation();
      const ta = textareaRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const val = ta.value;
      const next = val.substring(0, start) + "  " + val.substring(end);
      setCode(next);
      onUniformChange?.(ctrl.uniform, next);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 2;
      });
    }
    e.stopPropagation();
  }, [ctrl.uniform, onUniformChange]);

  return (
    <div className="space-y-1">
      <label className="flex justify-between items-center text-xs text-zinc-400">
        <span>{ctrl.label}</span>
        {ctrl.language && (
          <span className="text-[10px] text-zinc-600 uppercase">{ctrl.language}</span>
        )}
      </label>
      <textarea
        ref={textareaRef}
        value={code}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        className="w-full bg-zinc-900 text-zinc-200 text-[11px] font-mono rounded px-2 py-1.5 border border-zinc-700 outline-none focus:ring-1 focus:ring-indigo-500 resize-y leading-relaxed"
        style={{ height, tabSize: 2 }}
      />
    </div>
  );
}
