import { useEffect, useCallback } from "react";

const SHORTCUTS = [
  { key: "Space", desc: "재생 / 일시정지" },
  { key: "T", desc: "버전 트리 토글" },
  { key: "F", desc: "선택 노드에 맞추기" },
  { key: "⌘/Ctrl + Z", desc: "실행 취소" },
  { key: "⌘/Ctrl + Shift + Z", desc: "다시 실행" },
  { key: "?", desc: "이 도움말" },
];

export default function KeyboardShortcutsHelp({ onClose }) {
  const handleKeyDown = useCallback((e) => {
    if (e.key === "Escape" || e.key === "?") {
      e.preventDefault();
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4"
        style={{ background: "var(--chrome-bg)", border: "1px solid var(--chrome-border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold" style={{ color: "var(--chrome-text)" }}>
            키보드 단축키
          </h2>
          <button
            onClick={onClose}
            className="transition-colors"
            style={{ color: "var(--chrome-text-muted)" }}
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>
        <div className="space-y-2">
          {SHORTCUTS.map(({ key, desc }) => (
            <div key={key} className="flex items-center justify-between py-1.5">
              <span className="text-sm" style={{ color: "var(--chrome-text-secondary)" }}>{desc}</span>
              <kbd
                className="text-xs font-mono px-2 py-1 rounded"
                style={{ background: "var(--input-bg)", border: "1px solid var(--input-border)", color: "var(--chrome-text)" }}
              >
                {key}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
