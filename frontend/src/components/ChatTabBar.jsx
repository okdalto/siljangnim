import { memo } from "react";

function ChatTabBar({ tabs, activeTabId, tabOrder, onSwitch, onCreate, onClose, onReset }) {
  return (
    <div className="flex items-center gap-0.5 overflow-x-auto" style={{ minWidth: 0 }}>
      {tabOrder.map((id) => {
        const tab = tabs.get(id);
        if (!tab) return null;
        const isActive = id === activeTabId;
        return (
          <button
            key={id}
            type="button"
            onClick={() => {
              if (isActive) {
                if (tab.messages?.length > 0 && confirm("채팅을 리셋할까요?")) onReset?.(id);
              } else {
                onSwitch(id);
              }
            }}
            className={`group flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap ${
              isActive
                ? "text-zinc-100"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50"
            }`}
            style={isActive ? { background: "var(--accent)", color: "var(--accent-text)" } : {}}
          >
            {tab.isProcessing && (
              <span
                className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse flex-shrink-0"
              />
            )}
            <span className="truncate max-w-[80px]">{tab.label}</span>
            {(tabOrder.length > 1 || tab.messages?.length > 0) && (
              <span
                role="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (tabOrder.length === 1) {
                    if (tab.messages?.length > 0 && confirm("채팅을 리셋할까요?")) onReset?.(id);
                  } else {
                    if (tab.messages?.length > 0 && !confirm("채팅을 닫을까요?")) return;
                    onClose(id);
                  }
                }}
                className={`ml-0.5 rounded hover:bg-white/20 transition-colors ${
                  isActive ? "opacity-70 hover:opacity-100" : "opacity-0 group-hover:opacity-70 hover:!opacity-100"
                }`}
                style={{ lineHeight: 1, padding: "1px 2px" }}
              >
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </span>
            )}
          </button>
        );
      })}
      <button
        type="button"
        onClick={onCreate}
        className="text-zinc-400 hover:text-zinc-200 transition-colors px-1.5 py-1 rounded hover:bg-zinc-700/50 flex-shrink-0"
        title="New tab"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </div>
  );
}

export default memo(ChatTabBar);
