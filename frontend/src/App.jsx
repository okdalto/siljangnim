import { useCallback, useEffect, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import useWebSocket from "./hooks/useWebSocket.js";
import useNodeSnapping from "./hooks/useNodeSnapping.js";
import useNodeLayoutHistory from "./hooks/useNodeLayoutHistory.js";
import useRecorder from "./hooks/useRecorder.js";
import useApiKey from "./hooks/useApiKey.js";
import useChat from "./hooks/useChat.js";
import useCustomPanels from "./hooks/useCustomPanels.js";
import useKeyframes from "./hooks/useKeyframes.js";
import useProjectManager from "./hooks/useProjectManager.js";
import EngineContext from "./contexts/EngineContext.js";
import ChatNode from "./nodes/ChatNode.jsx";
import InspectorNode from "./nodes/InspectorNode.jsx";
import CustomPanelNode from "./nodes/CustomPanelNode.jsx";
import ViewportNode from "./nodes/ViewportNode.jsx";
import DebugLogNode from "./nodes/DebugLogNode.jsx";
import ProjectBrowserNode from "./nodes/ProjectBrowserNode.jsx";
import ApiKeyModal from "./components/ApiKeyModal.jsx";
import Toolbar from "./components/Toolbar.jsx";
import Timeline from "./components/Timeline.jsx";
import SnapGuides from "./components/SnapGuides.jsx";
import KeyframeEditor from "./components/KeyframeEditor.jsx";

const nodeTypes = {
  chat: ChatNode,
  inspector: InspectorNode,
  viewport: ViewportNode,
  debugLog: DebugLogNode,
  projectBrowser: ProjectBrowserNode,
  customPanel: CustomPanelNode,
};

const WS_URL = import.meta.env.DEV
  ? `ws://${window.location.hostname}:8000/ws`
  : `ws://${window.location.hostname}:${window.location.port}/ws`;

const initialNodes = [
  {
    id: "chat",
    type: "chat",
    position: { x: 50, y: 550 },
    style: { width: 320, height: 380 },
    data: { messages: [], onSend: () => { } },
  },
  {
    id: "inspector",
    type: "inspector",
    position: { x: 400, y: 550 },
    style: { width: 320, height: 380 },
    data: { controls: [], onUniformChange: () => { } },
  },
  {
    id: "viewport",
    type: "viewport",
    position: { x: 50, y: 50 },
    style: { width: 670, height: 480 },
    data: { sceneJSON: null, engineRef: null, paused: false },
  },
  {
    id: "debugLog",
    type: "debugLog",
    position: { x: 750, y: 50 },
    style: { width: 320, height: 300 },
    data: { logs: [] },
  },
  {
    id: "projectBrowser",
    type: "projectBrowser",
    position: { x: 1080, y: 50 },
    style: { width: 320, height: 400 },
    data: { projects: [], activeProject: null, onSave: () => { }, onLoad: () => { }, onDelete: () => { } },
  },
];

export default function App() {
  const [nodes, setNodes, rawOnNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState([]);
  const { onNodesChange: onNodesChangeSnapped, guides } = useNodeSnapping(nodes, rawOnNodesChange, setNodes);
  const { onNodesChange, undo, redo } = useNodeLayoutHistory(nodes, onNodesChangeSnapped, setNodes);

  // Scene state
  const [sceneJSON, setSceneJSON] = useState(null);
  const [uiConfig, setUiConfig] = useState({ controls: [], inspectable_buffers: [] });
  const dirtyRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const [duration, setDuration] = useState(30);
  const [loop, setLoop] = useState(true);
  const [offlineRecord, setOfflineRecord] = useState(false);

  // Workspace files version counter
  const [workspaceFilesVersion, setWorkspaceFilesVersion] = useState(0);

  // Engine ref (shared via EngineContext and node data)
  const engineRef = useRef(null);
  const sendRef = useRef(null);

  // --- Custom hooks ---
  const apiKey = useApiKey(sendRef);
  const chat = useChat(sendRef);
  const panels = useCustomPanels(sendRef);
  const kf = useKeyframes(engineRef);

  const captureThumbnail = useCallback(() => {
    if (engineRef.current?.canvas) {
      try {
        return engineRef.current.canvas.toDataURL("image/jpeg", 0.8);
      } catch { /* canvas may be tainted */ }
    }
    return null;
  }, []);

  const getWorkspaceState = useCallback(() => {
    return {
      version: 1,
      keyframes: kf.getKeyframeTracks(),
      duration,
      loop,
    };
  }, [duration, loop, kf.getKeyframeTracks]);

  const project = useProjectManager(sendRef, captureThumbnail, getWorkspaceState);

  // Recording
  const { recording, elapsedTime: recordingTime, startRecording, stopRecording } = useRecorder(engineRef);
  const recorderFnsRef = useRef({ startRecording, stopRecording });
  recorderFnsRef.current = { startRecording, stopRecording };

  // Spacebar toggle pause
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code !== "Space") return;
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target.isContentEditable) return;
      e.preventDefault();
      setPaused((p) => !p);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // --- Uniform change undo/redo ---
  const uniformHistoryRef = useRef({ past: [], future: [] });
  const uniformCoalesceRef = useRef({ uniform: null, timer: null });
  const uniformValuesRef = useRef({});

  // Initialize uniform tracking from sceneJSON (live engine values = ground truth).
  // Controls now receive these merged values via ctrl.default, so both are in sync.
  useEffect(() => {
    if (sceneJSON?.uniforms) {
      const vals = uniformValuesRef.current;
      for (const [name, def] of Object.entries(sceneJSON.uniforms)) {
        if (def.value !== undefined && !(name in vals)) {
          vals[name] = def.value;
        }
      }
    }
  }, [sceneJSON]);

  // Fallback: controls whose uniform isn't in sceneJSON
  useEffect(() => {
    const vals = uniformValuesRef.current;
    for (const ctrl of uiConfig.controls || []) {
      if (ctrl.uniform && ctrl.default !== undefined && !(ctrl.uniform in vals)) {
        vals[ctrl.uniform] = ctrl.default;
      }
    }
  }, [uiConfig]);

  const resetUniformHistory = useCallback(() => {
    uniformHistoryRef.current = { past: [], future: [] };
    uniformValuesRef.current = {};
    if (uniformCoalesceRef.current.timer) clearTimeout(uniformCoalesceRef.current.timer);
    uniformCoalesceRef.current = { uniform: null, timer: null };
  }, []);
  const resetUniformHistoryRef = useRef(resetUniformHistory);
  resetUniformHistoryRef.current = resetUniformHistory;

  const _applyUniformExternal = useCallback((uniform, value) => {
    uniformValuesRef.current[uniform] = value;
    if (engineRef.current) engineRef.current.updateUniform(uniform, value);
    sendRef.current?.({ type: "set_uniform", uniform, value });
    window.dispatchEvent(new CustomEvent("uniform-external-change", { detail: { uniform, value } }));
  }, []);

  const undoUniform = useCallback(() => {
    const h = uniformHistoryRef.current;
    if (h.past.length === 0) return false;
    const entry = h.past.pop();
    h.future.push(entry);
    _applyUniformExternal(entry.uniform, entry.oldValue);
    return true;
  }, [_applyUniformExternal]);

  const redoUniform = useCallback(() => {
    const h = uniformHistoryRef.current;
    if (h.future.length === 0) return false;
    const entry = h.future.pop();
    h.past.push(entry);
    _applyUniformExternal(entry.uniform, entry.newValue);
    return true;
  }, [_applyUniformExternal]);

  // Undo/Redo shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
      const tag = e.target.tagName;
      const isTextEntry = tag === "TEXTAREA" || tag === "SELECT" || e.target.isContentEditable ||
        (tag === "INPUT" && ["text", "number", "search", "url", "email", "password"].includes(e.target.type));
      if (isTextEntry) return;
      e.preventDefault();
      if (kf.isEditorOpen.current) {
        if (e.shiftKey) kf.redoKeyframes();
        else kf.undoKeyframes();
      } else {
        if (e.shiftKey) {
          if (!redoUniform()) redo();
        } else {
          if (!undoUniform()) undo();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo, kf.undoKeyframes, kf.redoKeyframes, kf.isEditorOpen, undoUniform, redoUniform]);

  // Debounced send workspace state to backend
  const wsStateTimerRef = useRef(null);
  const sendWorkspaceState = useCallback(() => {
    if (wsStateTimerRef.current) clearTimeout(wsStateTimerRef.current);
    wsStateTimerRef.current = setTimeout(() => {
      sendRef.current?.({ type: "update_workspace_state", workspace_state: getWorkspaceState() });
    }, 2000);
  }, [getWorkspaceState]);

  // Send workspace state when keyframes change
  useEffect(() => {
    if (kf.keyframeVersion > 0) {
      sendWorkspaceState();
      project.markUnsaved();
    }
  }, [kf.keyframeVersion, sendWorkspaceState, project.markUnsaved]);

  const durationLoopMountedRef = useRef(false);
  useEffect(() => {
    if (!durationLoopMountedRef.current) {
      durationLoopMountedRef.current = true;
      return;
    }
    sendWorkspaceState();
    project.markUnsaved();
  }, [duration, loop, sendWorkspaceState, project.markUnsaved]);

  // Handle incoming WebSocket messages (dispatcher)
  const handleMessage = useCallback((msg) => {
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case "init":
        resetUniformHistoryRef.current();
        if (msg.scene_json) setSceneJSON(msg.scene_json);
        if (msg.ui_config) setUiConfig(msg.ui_config);
        if (msg.projects) project.setProjectList(msg.projects);
        if (msg.chat_history?.length) chat.restoreMessages(msg.chat_history);
        chat.setProcessing(!!msg.is_processing);
        if (msg.workspace_state) {
          kf.restoreKeyframes(msg.workspace_state.keyframes);
          if (typeof msg.workspace_state.duration === "number") setDuration(msg.workspace_state.duration);
          if (typeof msg.workspace_state.loop === "boolean") setLoop(msg.workspace_state.loop);
        } else {
          kf.restoreKeyframes(null);
          setDuration(30);
          setLoop(true);
        }
        project.markSaved();
        break;

      case "assistant_text":
        chat.addAssistantText(msg.text);
        break;

      case "chat_done":
        chat.setProcessing(false);
        chat.setAgentStatus(null);
        chat.setPendingQuestion(null);
        setWorkspaceFilesVersion((v) => v + 1);
        dirtyRef.current = true;
        project.markUnsaved();
        break;

      case "agent_status":
        chat.setAgentStatus({ status: msg.status, detail: msg.detail });
        break;

      case "scene_update":
        if (msg.scene_json) setSceneJSON(msg.scene_json);
        if (msg.ui_config) setUiConfig(msg.ui_config);
        setWorkspaceFilesVersion((v) => v + 1);
        dirtyRef.current = true;
        project.markUnsaved();
        break;

      case "api_key_required":
        apiKey.setRequired();
        break;

      case "api_key_valid":
        apiKey.setValid();
        break;

      case "api_key_invalid":
        apiKey.setInvalid(msg.error);
        break;

      case "agent_log":
        chat.addLog({ agent: msg.agent, message: msg.message, level: msg.level });
        break;

      case "agent_question":
        chat.setPendingQuestion({ question: msg.question, options: msg.options || [] });
        break;

      case "project_list":
        project.setProjectList(msg.projects || []);
        break;

      case "project_saved":
        if (msg.meta) project.setActiveProject(msg.meta.name);
        dirtyRef.current = false;
        project.markSaved();
        break;

      case "project_loaded":
        resetUniformHistoryRef.current();
        if (msg.meta) project.setActiveProject(msg.meta.name);
        if (msg.chat_history) chat.restoreMessages(msg.chat_history);
        if (msg.scene_json) setSceneJSON(msg.scene_json);
        if (msg.ui_config) setUiConfig(msg.ui_config);
        if (msg.workspace_state) {
          kf.restoreKeyframes(msg.workspace_state.keyframes);
          if (typeof msg.workspace_state.duration === "number") setDuration(msg.workspace_state.duration);
          if (typeof msg.workspace_state.loop === "boolean") setLoop(msg.workspace_state.loop);
        } else {
          kf.restoreKeyframes(null);
          setDuration(30);
          setLoop(true);
        }
        chat.setDebugLogs([]);
        setWorkspaceFilesVersion((v) => v + 1);
        dirtyRef.current = false;
        project.markSaved();
        break;

      case "open_panel":
        panels.openPanel(msg.id, msg);
        break;

      case "close_panel":
        panels.closePanel(msg.id);
        break;

      case "start_recording":
        setPaused(false);
        recorderFnsRef.current.startRecording({
          fps: msg.fps || 30,
          duration: msg.duration,
          filename: msg.filename,
        });
        break;

      case "stop_recording":
        recorderFnsRef.current.stopRecording();
        break;

      case "workspace_state_update":
        if (msg.workspace_state) {
          kf.restoreKeyframes(msg.workspace_state.keyframes);
          if (typeof msg.workspace_state.duration === "number") setDuration(msg.workspace_state.duration);
          if (typeof msg.workspace_state.loop === "boolean") setLoop(msg.workspace_state.loop);
        }
        break;

      case "project_save_error":
      case "project_load_error":
      case "project_delete_error":
        chat.addErrorLog(msg.error);
        break;
    }
  }, []);

  const { connected, send } = useWebSocket(WS_URL, handleMessage);
  sendRef.current = send;

  // Warn before closing tab with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (project.saveStatusRef.current === "unsaved") {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [project.saveStatusRef]);

  // Cmd+S / Ctrl+S to save current project
  const handleProjectSaveRef = useRef(null);
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        const name = project.activeProject;
        if (name) {
          handleProjectSaveRef.current?.(name);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [project.activeProject]);
  handleProjectSaveRef.current = project.handleProjectSave;

  const handleUniformChange = useCallback(
    (uniform, value) => {
      const h = uniformHistoryRef.current;
      const c = uniformCoalesceRef.current;
      const vals = uniformValuesRef.current;

      // Coalesce rapid changes to the same uniform (e.g. slider drag).
      // 50ms window — long enough to batch continuous drag events (~16ms at 60fps)
      // but short enough that separate user actions always create new entries.
      if (c.uniform === uniform && c.timer) {
        clearTimeout(c.timer);
        if (h.past.length > 0) {
          h.past[h.past.length - 1].newValue = value;
        }
      } else {
        const oldValue = vals[uniform] ?? value;
        if (oldValue !== value) {
          h.past.push({ uniform, oldValue, newValue: value });
          if (h.past.length > 100) h.past.shift();
          h.future.length = 0;
        }
      }
      c.uniform = uniform;
      if (c.timer) clearTimeout(c.timer);
      c.timer = setTimeout(() => { c.uniform = null; c.timer = null; }, 50);

      vals[uniform] = value;
      if (engineRef.current) engineRef.current.updateUniform(uniform, value);
      send({ type: "set_uniform", uniform, value });
      dirtyRef.current = true;
      project.markUnsaved();
    },
    [send, project.markUnsaved]
  );

  const handleNewProject = useCallback(() => {
    if (project.saveStatus === "unsaved") {
      if (!window.confirm(
        project.activeProject
          ? `"${project.activeProject}"에 저장되지 않은 변경사항이 있습니다. 새 프로젝트를 만들까요?`
          : "저장되지 않은 변경사항이 있습니다. 새 프로젝트를 만들까요?"
      )) return;
    }
    const msg = { type: "new_project" };
    if (project.activeProject) {
      msg.active_project = project.activeProject;
      msg.thumbnail = captureThumbnail();
      msg.workspace_state = getWorkspaceState();
    }
    chat.clearAll();
    resetUniformHistory();
    setSceneJSON(null);
    setUiConfig({ controls: [], inspectable_buffers: [] });
    project.setActiveProject(null);
    kf.resetKeyframes();
    setDuration(30);
    setLoop(true);
    dirtyRef.current = false;
    project.markSaved();
    send(msg);
  }, [send, project.activeProject, project.saveStatus, captureThumbnail, getWorkspaceState, chat.clearAll, resetUniformHistory, kf.resetKeyframes, project.setActiveProject, project.markSaved]);

  const API_BASE = import.meta.env.DEV
    ? `http://${window.location.hostname}:8000`
    : "";

  const handleDeleteWorkspaceFile = useCallback(
    async (filepath) => {
      try {
        const res = await fetch(`${API_BASE}/api/workspace/files/${encodeURIComponent(filepath)}`, {
          method: "DELETE",
        });
        if (res.ok) setWorkspaceFilesVersion((v) => v + 1);
      } catch { /* ignore */ }
    },
    [API_BASE]
  );

  const handleTogglePause = useCallback(() => setPaused((p) => !p), []);

  const handleToggleRecord = useCallback(() => {
    if (recording) {
      stopRecording();
    } else {
      if (!offlineRecord) setPaused(false);
      startRecording({ offline: offlineRecord });
    }
  }, [recording, startRecording, stopRecording, offlineRecord]);

  const handleToggleOfflineRecord = useCallback(() => setOfflineRecord((v) => !v), []);

  const handleShaderError = useCallback((err) => {
    const message = err.message || String(err);
    chat.addLog({ agent: "WebGL", message, level: "error" });
    sendRef.current?.({ type: "console_error", message });
  }, [chat.addLog]);

  // Sync data into nodes
  useEffect(() => {
    setNodes((nds) => {
      let updated = nds.map((node) => {
        if (node.id === "chat") {
          return {
            ...node,
            data: {
              ...node.data,
              messages: chat.messages,
              onSend: chat.handleSend,
              isProcessing: chat.isProcessing,
              agentStatus: chat.agentStatus,
              onNewChat: chat.handleNewChat,
              pendingQuestion: chat.pendingQuestion,
              onAnswer: chat.handleAnswer,
            },
          };
        }
        if (node.id === "inspector") {
          // Merge live uniform values into controls so sliders start at
          // the actual engine value, not just ctrl.default
          const uniforms = sceneJSON?.uniforms;
          const mergedControls = (uiConfig.controls || []).map((ctrl) => {
            if (uniforms && ctrl.uniform && uniforms[ctrl.uniform]) {
              const live = uniforms[ctrl.uniform].value;
              if (live !== undefined && ctrl.type !== "color") {
                return { ...ctrl, default: live };
              }
              // For color controls, convert [r,g,b,a] floats → hex+alpha
              if (live !== undefined && ctrl.type === "color" && Array.isArray(live) && live.length >= 3) {
                const toHex = (v) => Math.round(v * 255).toString(16).padStart(2, "0");
                let hex = `#${toHex(live[0])}${toHex(live[1])}${toHex(live[2])}`;
                if (live.length >= 4 && live[3] < 1) {
                  hex += toHex(live[3]);
                }
                return { ...ctrl, default: hex };
              }
            }
            return ctrl;
          });
          return {
            ...node,
            data: {
              ...node.data,
              controls: mergedControls,
              onUniformChange: handleUniformChange,
              keyframeManagerRef: kf.keyframeManagerRef,
              engineRef,
              onOpenKeyframeEditor: kf.handleOpenKeyframeEditor,
            },
          };
        }
        if (node.id === "viewport") {
          return {
            ...node,
            data: { ...node.data, sceneJSON, engineRef, paused, onError: handleShaderError },
          };
        }
        if (node.id === "debugLog") {
          return {
            ...node,
            data: { ...node.data, logs: chat.debugLogs },
          };
        }
        if (node.id === "projectBrowser") {
          return {
            ...node,
            data: {
              ...node.data,
              projects: project.projectList,
              activeProject: project.activeProject,
              onSave: project.handleProjectSave,
              onLoad: project.handleProjectLoad,
              onDelete: project.handleProjectDelete,
              onDeleteWorkspaceFile: handleDeleteWorkspaceFile,
              workspaceFilesVersion,
            },
          };
        }
        if (node.type === "customPanel") {
          const panelId = node.id.replace("panel_", "");
          const panel = panels.customPanels.get(panelId);
          if (panel) {
            return {
              ...node,
              data: {
                ...node.data,
                title: panel.title,
                html: panel.html,
                onUniformChange: handleUniformChange,
                engineRef,
                onClose: () => panels.handleClosePanel(panelId),
                keyframeManagerRef: kf.keyframeManagerRef,
                onKeyframesChange: kf.handlePanelKeyframesChange,
                onDurationChange: setDuration,
                onLoopChange: setLoop,
                duration,
                loop,
              },
            };
          }
        }
        return node;
      });

      // Add/remove custom panel nodes
      const panelNodeIds = new Set([...panels.customPanels.keys()].map((id) => `panel_${id}`));
      for (const [panelId, panel] of panels.customPanels) {
        const nodeId = `panel_${panelId}`;
        if (!updated.some((n) => n.id === nodeId)) {
          updated = [
            ...updated,
            {
              id: nodeId,
              type: "customPanel",
              position: { x: 750, y: 400 },
              style: { width: panel.width || 320, height: panel.height || 300 },
              data: {
                title: panel.title,
                html: panel.html,
                onUniformChange: handleUniformChange,
                engineRef,
                onClose: () => panels.handleClosePanel(panelId),
                keyframeManagerRef: kf.keyframeManagerRef,
                onKeyframesChange: kf.handlePanelKeyframesChange,
                onDurationChange: setDuration,
                onLoopChange: setLoop,
                duration,
                loop,
              },
            },
          ];
        }
      }
      updated = updated.filter((n) => n.type !== "customPanel" || panelNodeIds.has(n.id));

      return updated;
    });
  }, [
    chat.messages, chat.handleSend, chat.isProcessing, chat.agentStatus, chat.handleNewChat,
    chat.pendingQuestion, chat.handleAnswer, chat.debugLogs,
    sceneJSON, paused, uiConfig, handleUniformChange,
    project.projectList, project.activeProject, project.handleProjectSave, project.handleProjectLoad, project.handleProjectDelete,
    handleDeleteWorkspaceFile, workspaceFilesVersion, handleShaderError,
    panels.customPanels, panels.handleClosePanel,
    setNodes, kf.handleOpenKeyframeEditor, kf.keyframeVersion, kf.handlePanelKeyframesChange, kf.keyframeManagerRef,
    duration, loop,
  ]);

  return (
    <EngineContext.Provider value={engineRef}>
      <div className="w-screen h-screen pt-10 pb-10">
        <Toolbar
          onNewProject={handleNewProject}
          activeProject={project.activeProject}
          connected={connected}
          saveStatus={project.saveStatus}
        />
        <Timeline
          paused={paused}
          onTogglePause={handleTogglePause}
          onPause={() => setPaused(true)}
          engineRef={engineRef}
          duration={duration}
          onDurationChange={setDuration}
          loop={loop}
          onLoopChange={setLoop}
          recording={recording}
          recordingTime={recordingTime}
          onToggleRecord={handleToggleRecord}
          offlineRecord={offlineRecord}
          onToggleOfflineRecord={handleToggleOfflineRecord}
        />

        {apiKey.apiKeyRequired && (
          <ApiKeyModal
            onSubmit={apiKey.handleApiKeySubmit}
            error={apiKey.apiKeyError}
            loading={apiKey.apiKeyLoading}
          />
        )}

        {kf.keyframeEditorTarget && (
          <KeyframeEditor
            uniformName={kf.keyframeEditorTarget.uniform}
            label={kf.keyframeEditorTarget.label}
            min={kf.keyframeEditorTarget.min}
            max={kf.keyframeEditorTarget.max}
            duration={duration}
            keyframes={kf.keyframeManagerRef.current.getTrack(kf.keyframeEditorTarget.uniform)}
            engineRef={engineRef}
            onKeyframesChange={kf.handleKeyframesChange}
            onClose={kf.closeEditor}
          />
        )}

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          deleteKeyCode={null}
          fitView
          minZoom={0.1}
          maxZoom={4}
          defaultViewport={{ x: 0, y: 0, zoom: 1 }}
          proOptions={{ hideAttribution: true }}
        >
          <SnapGuides guides={guides} />
          <Background color="#333" gap={24} size={1} />
          <Controls
            className="!bg-zinc-800 !border-zinc-700 !shadow-xl [&>button]:!bg-zinc-800 [&>button]:!border-zinc-700 [&>button]:!fill-zinc-400 [&>button:hover]:!bg-zinc-700"
          />
        </ReactFlow>
      </div>
    </EngineContext.Provider>
  );
}
