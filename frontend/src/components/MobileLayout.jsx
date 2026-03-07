import ViewportNode from "../nodes/ViewportNode.jsx";
import ChatNode from "../nodes/ChatNode.jsx";
import DebugLogNode from "../nodes/DebugLogNode.jsx";
import ProjectBrowserNode from "../nodes/ProjectBrowserNode.jsx";
import CustomPanelNode from "../nodes/CustomPanelNode.jsx";

export default function MobileLayout({
  // Viewport
  sceneJSON, engineRef, paused, onShaderError,
  // Chat
  messages, onSend, isProcessing, agentStatus, onNewChat, onCancel, pendingQuestion, onAnswer,
  // Debug
  debugLogs,
  // Projects
  projectList, activeProject, onProjectSave, onProjectLoad, onProjectDelete, onProjectRename,
  onProjectImport, onDeleteWorkspaceFile, workspaceFilesVersion,
  // Custom panels
  customPanels, onPanelClose, onUniformChange,
  keyframeManagerRef, onKeyframesChange, onDurationChange, onLoopChange,
  onOpenKeyframeEditor, duration, loop,
}) {
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
    onRename: onProjectRename,
    onImport: onProjectImport,
    onDeleteWorkspaceFile,
    workspaceFilesVersion,
  };

  const panelEntries = customPanels ? [...customPanels.entries()] : [];

  return (
    <div className="mobile-scroll-layout">
      <div className="mobile-scroll-section" style={{ height: "55vh", minHeight: 260 }}>
        <ViewportNode data={viewportData} standalone />
      </div>
      {panelEntries.map(([id, panel]) => (
        <div key={id} className="mobile-scroll-section" style={{ height: "40vh", minHeight: 200 }}>
          <CustomPanelNode
            standalone
            data={{
              title: panel.title,
              html: panel.html,
              controls: panel.controls,
              onUniformChange,
              engineRef,
              onClose: () => onPanelClose?.(id),
              keyframeManagerRef,
              onKeyframesChange,
              onDurationChange,
              onLoopChange,
              onOpenKeyframeEditor,
              duration,
              loop,
            }}
          />
        </div>
      ))}
      <div className="mobile-scroll-section" style={{ height: "55vh", minHeight: 300 }}>
        <ChatNode data={chatData} standalone />
      </div>
      <div className="mobile-scroll-section" style={{ height: "40vh", minHeight: 220 }}>
        <DebugLogNode data={debugData} standalone />
      </div>
      <div className="mobile-scroll-section" style={{ height: "40vh", minHeight: 220 }}>
        <ProjectBrowserNode data={projectData} standalone />
      </div>
    </div>
  );
}
