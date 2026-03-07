import { useRef, useState, useEffect, useCallback } from "react";
import ViewportNode from "../nodes/ViewportNode.jsx";
import ChatNode from "../nodes/ChatNode.jsx";
import DebugLogNode from "../nodes/DebugLogNode.jsx";
import ProjectBrowserNode from "../nodes/ProjectBrowserNode.jsx";
import CustomPanelNode from "../nodes/CustomPanelNode.jsx";
import MobilePiP from "./MobilePiP.jsx";
import MobileChatInput from "./MobileChatInput.jsx";

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
    hideInput: true,
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
  const [mobileInput, setMobileInput] = useState("");

  const viewportSectionRef = useRef(null);
  const chatSectionRef = useRef(null);
  const [viewportVisible, setViewportVisible] = useState(true);
  const [chatBottomVisible, setChatBottomVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const el = viewportSectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setViewportVisible(entry.isIntersecting);
        if (entry.isIntersecting) setDismissed(false);
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Track whether the chat section bottom is visible (sentinel at the end of chat)
  const chatSentinelRef = useRef(null);
  useEffect(() => {
    const el = chatSentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setChatBottomVisible(entry.isIntersecting),
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const scrollToViewport = useCallback(() => {
    viewportSectionRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const showPiP = !viewportVisible && !dismissed;

  return (
    <div className="mobile-scroll-layout">
      <div ref={viewportSectionRef} className="mobile-scroll-section" style={{ height: "55vh", minHeight: 260 }}>
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
      <div ref={chatSectionRef} className="mobile-scroll-section" style={{ height: "55vh", minHeight: 300 }}>
        <ChatNode data={chatData} standalone />
      </div>
      {/* Sentinel to detect chat bottom visibility */}
      <div ref={chatSentinelRef} style={{ height: 1, marginTop: -1 }} />
      {chatBottomVisible && (
        <MobileChatInput
          input={mobileInput}
          onInputChange={setMobileInput}
          onSend={onSend}
          isProcessing={isProcessing}
          pendingQuestion={pendingQuestion}
          onAnswer={onAnswer}
          onCancel={onCancel}
        />
      )}
      <div className="mobile-scroll-section" style={{ height: "40vh", minHeight: 220 }}>
        <DebugLogNode data={debugData} standalone />
      </div>
      <div className="mobile-scroll-section" style={{ height: "40vh", minHeight: 220 }}>
        <ProjectBrowserNode data={projectData} standalone />
      </div>
      {showPiP && (
        <MobilePiP
          engineRef={engineRef}
          onTap={scrollToViewport}
          onClose={() => setDismissed(true)}
        />
      )}
      {/* Fixed input when chat is off-screen */}
      {!chatBottomVisible && (
        <MobileChatInput
          fixed
          input={mobileInput}
          onInputChange={setMobileInput}
          onSend={onSend}
          isProcessing={isProcessing}
          pendingQuestion={pendingQuestion}
          onAnswer={onAnswer}
          onCancel={onCancel}
        />
      )}
    </div>
  );
}
