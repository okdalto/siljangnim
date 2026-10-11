// Right panel: the agent chat, the version history and the assets, as tabs.
import { setSidebarTab } from "../session";
import { useApp } from "../state";
import { Assets } from "./Assets";
import { Chat, ChatHeaderActions } from "./Chat";
import { History } from "./History";

const TABS = [
  { id: "chat", label: "Chat" },
  { id: "history", label: "History" },
  { id: "assets", label: "Assets" },
] as const;

export function Sidebar() {
  const tab = useApp((s) => s.sidebarTab);
  return (
    <aside className="flex w-[420px] shrink-0 flex-col border-l border-line bg-panel">
      <div className="flex h-10 shrink-0 items-center gap-3 border-b border-line px-2 text-xs">
        <div role="tablist" className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setSidebarTab(t.id)}
              className={`rounded-md px-2.5 py-1 ${tab === t.id ? "bg-raised text-fg" : "text-muted hover:text-fg"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-3 pr-2">{tab === "chat" && <ChatHeaderActions />}</div>
      </div>
      {tab === "chat" ? <Chat /> : tab === "history" ? <History /> : <Assets />}
    </aside>
  );
}
