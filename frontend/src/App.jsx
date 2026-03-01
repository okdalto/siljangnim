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
import EngineContext from "./contexts/EngineContext.js";
import ChatNode from "./nodes/ChatNode.jsx";
import InspectorNode from "./nodes/InspectorNode.jsx";
import CameraNode from "./nodes/CameraNode.jsx";
import Pad2dNode from "./nodes/Pad2dNode.jsx";
import CustomPanelNode from "./nodes/CustomPanelNode.jsx";
import ViewportNode from "./nodes/ViewportNode.jsx";
import DebugLogNode from "./nodes/DebugLogNode.jsx";
import ProjectBrowserNode from "./nodes/ProjectBrowserNode.jsx";
import ApiKeyModal from "./components/ApiKeyModal.jsx";
import Toolbar from "./components/Toolbar.jsx";
import Timeline from "./components/Timeline.jsx";
import SnapGuides from "./components/SnapGuides.jsx";
import KeyframeEditor from "./components/KeyframeEditor.jsx";
import KeyframeManager from "./engine/KeyframeManager.js";

const nodeTypes = {
  chat: ChatNode,
  inspector: InspectorNode,
  viewport: ViewportNode,
  debugLog: DebugLogNode,
  projectBrowser: ProjectBrowserNode,
  camera: CameraNode,
  pad2d: Pad2dNode,
  customPanel: CustomPanelNode,
};

const WS_URL = import.meta.env.DEV
  ? `ws://${window.location.hostname}:8000/ws`
  : `ws://${window.location.hostname}:${window.location.port}/ws`;

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

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

  // Chat state (restored from localStorage)
  const [messages, setMessages] = useState(() => loadJson("siljangnim:messages", []));

  // Scene state
  const [sceneJSON, setSceneJSON] = useState(null);
  const [uiConfig, setUiConfig] = useState({ controls: [], inspectable_buffers: [] });
  const [paused, setPaused] = useState(false);
  const [duration, setDuration] = useState(30);
  const [loop, setLoop] = useState(true);
  const [offlineRecord, setOfflineRecord] = useState(false);

  // Spacebar toggle pause (ignore when typing in inputs)
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

  // Undo/Redo shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target.isContentEditable) return;
      e.preventDefault();
      if (e.shiftKey) {
        redo();
      } else {
        undo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);

  // Engine ref (shared via EngineContext and node data)
  const engineRef = useRef(null);

  // Keyframe animation (restore from localStorage)
  const keyframeManagerRef = useRef(() => {
    const km = new KeyframeManager();
    try {
      const raw = localStorage.getItem("siljangnim:keyframes");
      if (raw) {
        const tracks = JSON.parse(raw);
        for (const [uniform, kfs] of Object.entries(tracks)) {
          km.setTrack(uniform, kfs);
        }
      }
    } catch {}
    return km;
  });
  // Lazy init: replace the factory with its result on first access
  if (typeof keyframeManagerRef.current === "function") {
    keyframeManagerRef.current = keyframeManagerRef.current();
  }
  const [keyframeVersion, setKeyframeVersion] = useState(0);
  const [keyframeEditorTarget, setKeyframeEditorTarget] = useState(null); // { uniform, label, min, max }

  // Connect keyframe manager to engine when engine is available
  useEffect(() => {
    const engine = engineRef.current;
    if (engine) engine.setKeyframeManager(keyframeManagerRef.current);
  });

  const handleOpenKeyframeEditor = useCallback((ctrl) => {
    setKeyframeEditorTarget({
      uniform: ctrl.uniform,
      label: ctrl.label,
      min: ctrl.min ?? 0,
      max: ctrl.max ?? 1,
    });
  }, []);

  const handleKeyframesChange = useCallback((newKeyframes) => {
    if (!keyframeEditorTarget) return;
    const km = keyframeManagerRef.current;
    if (newKeyframes.length === 0) {
      km.clearTrack(keyframeEditorTarget.uniform);
    } else {
      km.setTrack(keyframeEditorTarget.uniform, newKeyframes);
    }
    setKeyframeVersion((v) => v + 1);
  }, [keyframeEditorTarget]);

  // Recording
  const { recording, elapsedTime: recordingTime, startRecording, stopRecording } = useRecorder(engineRef);
  const recorderFnsRef = useRef({ startRecording, stopRecording });
  recorderFnsRef.current = { startRecording, stopRecording };

  // API key state
  const [apiKeyRequired, setApiKeyRequired] = useState(false);
  const [apiKeyError, setApiKeyError] = useState("");
  const [apiKeyLoading, setApiKeyLoading] = useState(false);

  // Debug log state (restored from localStorage)
  const [debugLogs, setDebugLogs] = useState(() => loadJson("siljangnim:debugLogs", []));

  // Project state
  const [projectList, setProjectList] = useState([]);
  const [activeProject, setActiveProject] = useState(null);

  // Agent processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [agentStatus, setAgentStatus] = useState(null); // {status, detail}

  // Custom panels: Map<id, {title, html, width, height}>
  const [customPanels, setCustomPanels] = useState(new Map());

  // Workspace files version counter — bump to trigger re-fetch in ProjectBrowserNode
  const [workspaceFilesVersion, setWorkspaceFilesVersion] = useState(0);

  // Handle every incoming WebSocket message
  const handleMessage = useCallback((msg) => {
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case "init":
        if (msg.scene_json) {
          setSceneJSON(msg.scene_json);
        }
        if (msg.ui_config) setUiConfig(msg.ui_config);
        if (msg.projects) setProjectList(msg.projects);
        if (msg.chat_history?.length) setMessages(msg.chat_history);
        setIsProcessing(!!msg.is_processing);
        break;

      case "assistant_text":
        setMessages((prev) => [...prev, { role: "assistant", text: msg.text }]);
        break;

      case "chat_done":
        setIsProcessing(false);
        setAgentStatus(null);
        setWorkspaceFilesVersion((v) => v + 1);
        break;

      case "agent_status":
        setAgentStatus({ status: msg.status, detail: msg.detail });
        break;

      case "scene_update":
        if (msg.scene_json) {
          setSceneJSON(msg.scene_json);
        }
        if (msg.ui_config) setUiConfig(msg.ui_config);
        setWorkspaceFilesVersion((v) => v + 1);
        break;

      case "api_key_required":
        setApiKeyRequired(true);
        break;

      case "api_key_valid":
        setApiKeyRequired(false);
        setApiKeyError("");
        setApiKeyLoading(false);
        break;

      case "api_key_invalid":
        setApiKeyError(msg.error || "Invalid API key");
        setApiKeyLoading(false);
        break;

      case "agent_log":
        setDebugLogs((prev) => [
          ...prev,
          { agent: msg.agent, message: msg.message, level: msg.level },
        ]);
        break;

      case "project_list":
        setProjectList(msg.projects || []);
        break;

      case "project_saved":
        if (msg.meta) setActiveProject(msg.meta.name);
        break;

      case "project_loaded":
        if (msg.meta) setActiveProject(msg.meta.name);
        if (msg.chat_history) setMessages(msg.chat_history);
        if (msg.scene_json) {
          setSceneJSON(msg.scene_json);
        }
        if (msg.ui_config) setUiConfig(msg.ui_config);
        setDebugLogs([]);
        setWorkspaceFilesVersion((v) => v + 1);
        break;

      case "open_panel":
        setCustomPanels((prev) => {
          const next = new Map(prev);
          next.set(msg.id, {
            title: msg.title || "Panel",
            html: msg.html || "",
            width: msg.width || 320,
            height: msg.height || 300,
          });
          return next;
        });
        break;

      case "close_panel":
        setCustomPanels((prev) => {
          const next = new Map(prev);
          next.delete(msg.id);
          return next;
        });
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

      case "project_save_error":
      case "project_load_error":
      case "project_delete_error":
        setDebugLogs((prev) => [
          ...prev,
          { agent: "System", message: msg.error, level: "error" },
        ]);
        break;
    }
  }, []);

  const { connected, send } = useWebSocket(WS_URL, handleMessage);

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem("siljangnim:messages", JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    localStorage.setItem("siljangnim:debugLogs", JSON.stringify(debugLogs));
  }, [debugLogs]);

  // Persist keyframes to localStorage
  useEffect(() => {
    if (keyframeVersion > 0) {
      localStorage.setItem("siljangnim:keyframes", JSON.stringify(keyframeManagerRef.current.tracks));
    }
  }, [keyframeVersion]);

  // Callbacks
  const handleSend = useCallback(
    (text, files) => {
      const msg = { role: "user", text };
      if (files?.length) {
        msg.files = files.map((f) => ({ name: f.name, mime_type: f.mime_type, size: f.size }));
      }
      setMessages((prev) => [...prev, msg]);
      setIsProcessing(true);

      const wsMsg = { type: "prompt", text };
      if (files?.length) wsMsg.files = files;
      send(wsMsg);
    },
    [send]
  );

  const handleUniformChange = useCallback(
    (uniform, value) => {
      // Update engine directly for immediate visual feedback
      if (engineRef.current) {
        engineRef.current.updateUniform(uniform, value);
      }
      // Persist to backend
      send({ type: "set_uniform", uniform, value });
    },
    [send]
  );

  const handleNewChat = useCallback(() => {
    setMessages([]);
    send({ type: "new_chat" });
  }, [send]);

  const handleNewProject = useCallback(() => {
    setMessages([]);
    setDebugLogs([]);
    setSceneJSON(null);
    setUiConfig({ controls: [], inspectable_buffers: [] });
    setActiveProject(null);
    send({ type: "new_project" });
  }, [send]);

  const handleProjectSave = useCallback(
    (name, description) => {
      // Capture thumbnail from WebGL canvas
      let thumbnail = null;
      if (engineRef.current?.canvas) {
        try {
          thumbnail = engineRef.current.canvas.toDataURL("image/jpeg", 0.8);
        } catch {
          // Canvas may be tainted
        }
      }
      send({ type: "project_save", name, description: description || "", thumbnail });
    },
    [send]
  );

  const handleProjectLoad = useCallback(
    (name) => {
      send({ type: "project_load", name });
    },
    [send]
  );

  const handleProjectDelete = useCallback(
    (name) => {
      send({ type: "project_delete", name });
      setActiveProject((prev) => (prev === name ? null : prev));
    },
    [send]
  );

  const API_BASE = import.meta.env.DEV
    ? `http://${window.location.hostname}:8000`
    : "";

  const handleDeleteWorkspaceFile = useCallback(
    async (filepath) => {
      try {
        const res = await fetch(`${API_BASE}/api/workspace/files/${encodeURIComponent(filepath)}`, {
          method: "DELETE",
        });
        if (res.ok) {
          setWorkspaceFilesVersion((v) => v + 1);
        }
      } catch { /* ignore */ }
    },
    [API_BASE]
  );

  const handleTogglePause = useCallback(() => {
    setPaused((p) => !p);
  }, []);

  const handleToggleRecord = useCallback(() => {
    if (recording) {
      stopRecording();
    } else {
      if (!offlineRecord) setPaused(false);
      startRecording({ offline: offlineRecord });
    }
  }, [recording, startRecording, stopRecording, offlineRecord]);

  const handleToggleOfflineRecord = useCallback(() => {
    setOfflineRecord((v) => !v);
  }, []);

  const handleApiKeySubmit = useCallback(
    (key) => {
      setApiKeyLoading(true);
      setApiKeyError("");
      send({ type: "set_api_key", key });
    },
    [send]
  );

  const handleShaderError = useCallback((err) => {
    setDebugLogs((prev) => [
      ...prev,
      { agent: "WebGL", message: err.message || String(err), level: "error" },
    ]);
  }, []);

  const handleClosePanel = useCallback(
    (panelId) => {
      setCustomPanels((prev) => {
        const next = new Map(prev);
        next.delete(panelId);
        return next;
      });
      send({ type: "close_panel", id: panelId });
    },
    [send]
  );

  // Sync data into nodes (including dynamic camera node creation/removal)
  useEffect(() => {
    const rot3dCtrl = (uiConfig.controls || []).find((c) => c.type === "rotation3d");
    const pad2dCtrls = (uiConfig.controls || []).filter((c) => c.type === "pad2d");

    setNodes((nds) => {
      let updated = nds.map((node) => {
        if (node.id === "chat") {
          return {
            ...node,
            data: { ...node.data, messages, onSend: handleSend, isProcessing, agentStatus, onNewChat: handleNewChat },
          };
        }
        if (node.id === "inspector") {
          return {
            ...node,
            data: {
              ...node.data,
              controls: uiConfig.controls || [],
              onUniformChange: handleUniformChange,
              keyframeManagerRef,
              engineRef,
              onOpenKeyframeEditor: handleOpenKeyframeEditor,
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
            data: { ...node.data, logs: debugLogs },
          };
        }
        if (node.id === "projectBrowser") {
          return {
            ...node,
            data: {
              ...node.data,
              projects: projectList,
              activeProject,
              onSave: handleProjectSave,
              onLoad: handleProjectLoad,
              onDelete: handleProjectDelete,
              onDeleteWorkspaceFile: handleDeleteWorkspaceFile,
              workspaceFilesVersion,
            },
          };
        }
        if (node.id === "camera") {
          return {
            ...node,
            data: {
              ...node.data,
              ctrl: rot3dCtrl,
              onUniformChange: handleUniformChange,
            },
          };
        }
        if (node.type === "pad2d") {
          const ctrl = pad2dCtrls.find((c) => `pad2d_${c.uniform}` === node.id);
          return {
            ...node,
            data: { ...node.data, ctrl, onUniformChange: handleUniformChange },
          };
        }
        if (node.type === "customPanel") {
          const panelId = node.id.replace("panel_", "");
          const panel = customPanels.get(panelId);
          if (panel) {
            return {
              ...node,
              data: {
                ...node.data,
                title: panel.title,
                html: panel.html,
                onUniformChange: handleUniformChange,
                engineRef,
                onClose: () => handleClosePanel(panelId),
              },
            };
          }
        }
        return node;
      });

      // Add camera node if rotation3d control exists but node doesn't
      const hasCamera = updated.some((n) => n.id === "camera");
      if (rot3dCtrl && !hasCamera) {
        updated = [
          ...updated,
          {
            id: "camera",
            type: "camera",
            position: { x: 1080, y: 400 },
            style: { width: 240, height: 280 },
            data: { ctrl: rot3dCtrl, onUniformChange: handleUniformChange },
          },
        ];
      }
      // Remove camera node if no rotation3d control
      if (!rot3dCtrl && hasCamera) {
        updated = updated.filter((n) => n.id !== "camera");
      }

      // Add pad2d nodes for each pad2d control that doesn't have a node yet
      const pad2dIds = new Set(pad2dCtrls.map((c) => `pad2d_${c.uniform}`));
      for (const ctrl of pad2dCtrls) {
        const nodeId = `pad2d_${ctrl.uniform}`;
        if (!updated.some((n) => n.id === nodeId)) {
          updated = [
            ...updated,
            {
              id: nodeId,
              type: "pad2d",
              position: { x: 1080, y: 700 },
              style: { width: 220, height: 260 },
              data: { ctrl, onUniformChange: handleUniformChange },
            },
          ];
        }
      }
      // Remove pad2d nodes whose controls no longer exist
      updated = updated.filter((n) => n.type !== "pad2d" || pad2dIds.has(n.id));

      // Add custom panel nodes for each panel that doesn't have a node yet
      const panelNodeIds = new Set([...customPanels.keys()].map((id) => `panel_${id}`));
      for (const [panelId, panel] of customPanels) {
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
                onClose: () => handleClosePanel(panelId),
              },
            },
          ];
        }
      }
      // Remove custom panel nodes whose panels no longer exist
      updated = updated.filter((n) => n.type !== "customPanel" || panelNodeIds.has(n.id));

      return updated;
    });
  }, [messages, handleSend, isProcessing, agentStatus, handleNewChat, sceneJSON, paused, uiConfig, handleUniformChange, debugLogs, projectList, activeProject, handleProjectSave, handleProjectLoad, handleProjectDelete, handleDeleteWorkspaceFile, workspaceFilesVersion, handleShaderError, customPanels, handleClosePanel, setNodes, handleOpenKeyframeEditor, keyframeVersion]);

  return (
    <EngineContext.Provider value={engineRef}>
      <div className="w-screen h-screen pt-10 pb-10">
        <Toolbar
          onNewProject={handleNewProject}
          activeProject={activeProject}
          connected={connected}
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

        {apiKeyRequired && (
          <ApiKeyModal
            onSubmit={handleApiKeySubmit}
            error={apiKeyError}
            loading={apiKeyLoading}
          />
        )}

        {keyframeEditorTarget && (
          <KeyframeEditor
            uniformName={keyframeEditorTarget.uniform}
            label={keyframeEditorTarget.label}
            min={keyframeEditorTarget.min}
            max={keyframeEditorTarget.max}
            duration={duration}
            keyframes={keyframeManagerRef.current.getTrack(keyframeEditorTarget.uniform)}
            engineRef={engineRef}
            onKeyframesChange={handleKeyframesChange}
            onClose={() => setKeyframeEditorTarget(null)}
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
