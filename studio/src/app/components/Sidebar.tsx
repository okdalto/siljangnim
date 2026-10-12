// Right panel: the agent chat (or an external agent's activity), the version
// history, the assets and the job queue, as tabs. It folds to a rail of icons
// so the viewport can take the room.
import { setSidebarCollapsed, setSidebarTab } from "../session";
import { useApp, type AppState } from "../state";
import { Activity } from "./Activity";
import { Assets } from "./Assets";
import { Chat, ChatHeaderActions } from "./Chat";
import { History } from "./History";
import { Jobs } from "./Jobs";
import { ChatIcon, ClockIcon, CogsIcon, FolderIcon, PanelIcon, PulseIcon } from "./icons";

type Tab = { id: AppState["sidebarTab"]; label: string; icon: (p: { size?: number }) => React.ReactNode };

const TABS: Tab[] = [
  { id: "chat", label: "Chat", icon: ChatIcon },
  { id: "history", label: "History", icon: ClockIcon },
  { id: "assets", label: "Assets", icon: FolderIcon },
];

// With an external agent the conversation lives in that agent's app.
const EXTERNAL_TABS: Tab[] = [
  { id: "activity", label: "Activity", icon: PulseIcon },
  { id: "history", label: "History", icon: ClockIcon },
  { id: "assets", label: "Assets", icon: FolderIcon },
];

const JOBS_TAB: Tab = { id: "jobs", label: "Jobs", icon: CogsIcon };

export function Sidebar() {
  const external = useApp((s) => Boolean(s.external));
  const selected = useApp((s) => s.sidebarTab);
  const collapsed = useApp((s) => s.sidebarCollapsed);
  const jobsUsed = useApp((s) => s.jobsUsed);
  const busy = useApp((s) => Boolean(s.live) || Boolean(s.question) || Boolean(s.approval));
  // The Jobs tab appears once the agent has run something on this computer.
  const tabs = [...(external ? EXTERNAL_TABS : TABS), ...(jobsUsed ? [JOBS_TAB] : [])];
  const tab = tabs.some((t) => t.id === selected) ? selected : tabs[0]!.id;

  if (collapsed) {
    return (
      <aside className="flex w-11 shrink-0 flex-col items-center gap-1 border-l border-line bg-panel py-2" data-testid="sidebar-rail">
        <button type="button" onClick={() => setSidebarCollapsed(false)} title="Show the side panel" className="mb-1 rounded-md p-1.5 text-faint hover:bg-raised hover:text-fg">
          <PanelIcon size={16} />
        </button>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            title={t.label}
            onClick={() => {
              setSidebarTab(t.id);
              setSidebarCollapsed(false);
            }}
            className={`relative rounded-md p-1.5 ${tab === t.id ? "text-fg" : "text-faint hover:bg-raised hover:text-fg"}`}
          >
            <t.icon size={16} />
            {/* The agent is working or waiting for an answer. */}
            {busy && (t.id === "chat" || t.id === "activity") && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-accent" />}
          </button>
        ))}
      </aside>
    );
  }

  return (
    <aside className="flex w-[380px] shrink-0 flex-col border-l border-line bg-panel">
      <div className="flex h-10 shrink-0 items-center gap-3 border-b border-line px-2 text-xs">
        <div role="tablist" className="flex gap-1">
          {tabs.map((t) => (
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
        <div className="flex min-w-0 flex-1 items-center justify-end gap-3">{tab === "chat" && <ChatHeaderActions />}</div>
        <button type="button" onClick={() => setSidebarCollapsed(true)} title="Fold the side panel" className="shrink-0 rounded-md p-1 text-faint hover:bg-raised hover:text-fg">
          <PanelIcon size={15} />
        </button>
      </div>
      {tab === "chat" ? <Chat /> : tab === "activity" ? <Activity /> : tab === "history" ? <History /> : tab === "jobs" ? <Jobs /> : <Assets />}
    </aside>
  );
}
