import { useEffect, useRef } from "react";

const MENU_ITEMS = [
  { id: "continue", label: "Continue from here", icon: "M5 3l14 9-14 9V3z" },
  { id: "reference", label: "Reference in chat", icon: "M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" },
  { id: "branch", label: "Branch", icon: "M6 3v12M18 9a3 3 0 100-6 3 3 0 000 6zM6 21a3 3 0 100-6 3 3 0 000 6zM18 9a9 9 0 01-9 9" },
  { id: "compare", label: "Compare with...", icon: "M16 3h5v5M8 3H3v5M3 16v5h5M21 16v5h-5" },
  { id: "duplicate", label: "Duplicate", icon: "M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1M14 11h-4a2 2 0 00-2 2v4a2 2 0 002 2h8a2 2 0 002-2v-4a2 2 0 00-2-2h-4z" },
  { id: "rename", label: "Rename", icon: "M17 3a2.85 2.85 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" },
  { id: "favorite", label: "Favorite", icon: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" },
  { id: "checkpoint", label: "Pin Checkpoint", icon: "M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" },
  { id: "delete", label: "Delete", icon: "M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2", danger: true },
];

export default function ProjectTreeContextMenu({ x, y, node, onAction, onClose }) {
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };
    const handleEsc = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [onClose]);

  // Adjust position to stay on screen
  const style = {
    position: "fixed",
    left: x,
    top: y,
    zIndex: 9999,
  };

  const isRoot = node?.parentId === null;

  return (
    <div ref={menuRef} style={style}>
      <div
        className="py-1 rounded-md shadow-lg min-w-[180px]"
        style={{
          background: "var(--chrome-bg)",
          border: "1px solid var(--chrome-border)",
        }}
      >
        {MENU_ITEMS.map((item) => {
          // Don't allow deleting root node
          if (item.id === "delete" && isRoot) return null;

          return (
            <button
              key={item.id}
              className="w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 transition-colors hover:bg-white/5"
              style={{
                color: item.danger ? "#ef4444" : "var(--chrome-text)",
              }}
              onClick={() => {
                onAction(item.id, node);
                onClose();
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d={item.icon} />
              </svg>
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
