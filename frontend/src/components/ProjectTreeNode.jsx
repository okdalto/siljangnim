import { useEffect, useRef, useState } from "react";
import { readNodeThumbnailUrl } from "../engine/storage.js";

const TYPE_ICONS = {
  prompt_node: "M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z",
  manual_edit_node: "M17 3a2.85 2.85 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z",
  asset_node: "M14.5 4h-5L7 7H4a2 2 0 00-2 2v9a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2h-3l-2.5-3z",
  timeline_node: "M12 20V10M18 20V4M6 20v-4",
  agent_repair_node: "M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z",
};

export default function ProjectTreeNode({
  node,
  depth,
  isActive,
  isExpanded,
  hasChildren,
  onSelect,
  onDoubleClick,
  onContextMenu,
  onToggleExpand,
  projectName,
  isCompareSource = false,
  isCompareMode = false,
}) {
  const [thumbnailUrl, setThumbnailUrl] = useState(null);
  const thumbRef = useRef(null);
  const nodeRef = useRef(null);

  // Lazy load thumbnail with IntersectionObserver
  useEffect(() => {
    if (!node.thumbnailRef || !nodeRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          readNodeThumbnailUrl(projectName, node.id).then((url) => {
            if (url) setThumbnailUrl(url);
          });
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(nodeRef.current);
    return () => observer.disconnect();
  }, [node.id, node.thumbnailRef, projectName]);

  // Clean up object URL — revoke previous URL when it changes or on unmount
  const prevThumbRef = useRef(null);
  useEffect(() => {
    if (prevThumbRef.current && prevThumbRef.current !== thumbnailUrl) {
      URL.revokeObjectURL(prevThumbRef.current);
    }
    prevThumbRef.current = thumbnailUrl;
    return () => {
      if (thumbnailUrl) URL.revokeObjectURL(thumbnailUrl);
    };
  }, [thumbnailUrl]);

  const isFavorite = node.tags?.includes("favorite");
  const iconPath = TYPE_ICONS[node.type] || TYPE_ICONS.prompt_node;

  return (
    <div
      ref={nodeRef}
      className="flex items-center gap-1.5 py-0.5 pr-2 cursor-pointer select-none group transition-colors"
      style={{
        paddingLeft: `${8 + depth * 14}px`,
        background: isCompareSource ? "rgba(234,179,8,0.15)" : isActive ? "var(--accent-bg, rgba(99,102,241,0.15))" : isCompareMode ? "rgba(99,102,241,0.05)" : "transparent",
        borderLeft: isCompareSource ? "2px solid #eab308" : isActive ? "2px solid var(--accent-color, #6366f1)" : "2px solid transparent",
        cursor: isCompareMode ? "crosshair" : "pointer",
      }}
      onClick={() => onSelect(node.id)}
      onDoubleClick={() => onDoubleClick(node.id)}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e, node);
      }}
    >
      {/* Expand/collapse toggle */}
      <button
        className="w-3 h-3 flex items-center justify-center flex-shrink-0"
        style={{ visibility: hasChildren ? "visible" : "hidden" }}
        onClick={(e) => {
          e.stopPropagation();
          onToggleExpand(node.id);
        }}
      >
        <svg
          width="8"
          height="8"
          viewBox="0 0 8 8"
          fill="currentColor"
          style={{
            color: "var(--chrome-text-muted)",
            transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.15s",
          }}
        >
          <path d="M2 1l4 3-4 3V1z" />
        </svg>
      </button>

      {/* Thumbnail or type icon */}
      {thumbnailUrl ? (
        <img
          ref={thumbRef}
          src={thumbnailUrl}
          alt=""
          className="flex-shrink-0 rounded-sm object-cover"
          style={{ width: 24, height: 18 }}
        />
      ) : (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="flex-shrink-0"
          style={{ color: "var(--chrome-text-muted)" }}
        >
          <path d={iconPath} />
        </svg>
      )}

      {/* Title */}
      <span
        className="text-xs truncate flex-1"
        style={{ color: isActive ? "var(--chrome-text)" : "var(--chrome-text-secondary)" }}
        title={node.title}
      >
        {node.title}
      </span>

      {/* Indicators */}
      {node.isCheckpoint && (
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="flex-shrink-0 opacity-40"
          style={{ color: "var(--chrome-text-muted)" }}
          title="Checkpoint"
        >
          <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
        </svg>
      )}
      {isFavorite && (
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="#f59e0b"
          className="flex-shrink-0"
          title="Favorite"
        >
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      )}
    </div>
  );
}
