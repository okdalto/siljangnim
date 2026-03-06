import { useState } from "react";
import ViewportNode from "../nodes/ViewportNode.jsx";
import ChatNode from "../nodes/ChatNode.jsx";
import DebugLogNode from "../nodes/DebugLogNode.jsx";
import ProjectBrowserNode from "../nodes/ProjectBrowserNode.jsx";

const TABS = [
  { id: "viewport", label: "Viewport", icon: "\uD83C\uDFAC" },
  { id: "chat", label: "Chat", icon: "\uD83D\uDCAC" },
  { id: "log", label: "Log", icon: "\uD83D\uDCCB" },
  { id: "projects", label: "Projects", icon: "\uD83D\uDCC1" },
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
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`mobile-tab-btn ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="mobile-tab-icon">{tab.icon}</span>
            <span className="mobile-tab-label">{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
