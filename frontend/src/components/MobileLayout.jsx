import { useState } from "react";
import ViewportNode from "../nodes/ViewportNode.jsx";
import ChatNode from "../nodes/ChatNode.jsx";
import DebugLogNode from "../nodes/DebugLogNode.jsx";
import ProjectBrowserNode from "../nodes/ProjectBrowserNode.jsx";

const ViewportIcon = ({ active }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? "var(--accent)" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <line x1="8" y1="21" x2="16" y2="21" />
    <line x1="12" y1="17" x2="12" y2="21" />
  </svg>
);

const ChatIcon = ({ active }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? "var(--accent)" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const LogIcon = ({ active }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? "var(--accent)" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);

const ProjectsIcon = ({ active }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? "var(--accent)" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);

const TABS = [
  { id: "viewport", label: "Viewport", Icon: ViewportIcon },
  { id: "chat", label: "Chat", Icon: ChatIcon },
  { id: "log", label: "Log", Icon: LogIcon },
  { id: "projects", label: "Projects", Icon: ProjectsIcon },
];

export default function MobileLayout({
  // Viewport
  sceneJSON, engineRef, paused, onShaderError,
  // Chat
  messages, onSend, isProcessing, agentStatus, onNewChat, onCancel, pendingQuestion, onAnswer,
  // Debug
  debugLogs,
  // Projects
  projectList, activeProject, onProjectSave, onProjectLoad, onProjectDelete,
  onProjectImport, onDeleteWorkspaceFile, workspaceFilesVersion,
}) {
  const [activeTab, setActiveTab] = useState("viewport");

  const viewportData = { sceneJSON, engineRef, paused, onError: onShaderError };
  const chatData = {
    messages, onSend, isProcessing, agentStatus,
    onNewChat, onCancel, pendingQuestion, onAnswer,
  };
  const debugData = { logs: debugLogs };
  const projectData = {
    projects: projectList,
    activeProject,
    onSave: onProjectSave,
    onLoad: onProjectLoad,
    onDelete: onProjectDelete,
    onImport: onProjectImport,
    onDeleteWorkspaceFile,
    workspaceFilesVersion,
  };

  return (
    <div className="mobile-layout">
      {/* Tab panels — use display:none to preserve state */}
      <div className="mobile-panel" style={{ display: activeTab === "viewport" ? "flex" : "none" }}>
        <ViewportNode data={viewportData} standalone />
      </div>
      <div className="mobile-panel" style={{ display: activeTab === "chat" ? "flex" : "none" }}>
        <ChatNode data={chatData} standalone />
      </div>
      <div className="mobile-panel" style={{ display: activeTab === "log" ? "flex" : "none" }}>
        <DebugLogNode data={debugData} standalone />
      </div>
      <div className="mobile-panel" style={{ display: activeTab === "projects" ? "flex" : "none" }}>
        <ProjectBrowserNode data={projectData} standalone />
      </div>

      {/* Bottom tab bar */}
      <nav className="mobile-tab-bar">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              className={`mobile-tab-btn ${isActive ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {isActive && <div className="mobile-tab-indicator" />}
              <span className="mobile-tab-icon">
                <tab.Icon active={isActive} />
              </span>
              <span className="mobile-tab-label">{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
