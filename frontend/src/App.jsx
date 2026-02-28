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
import EngineContext from "./contexts/EngineContext.js";
import ChatNode from "./nodes/ChatNode.jsx";
import InspectorNode from "./nodes/InspectorNode.jsx";
import CameraNode from "./nodes/CameraNode.jsx";
import Pad2dNode from "./nodes/Pad2dNode.jsx";
import ViewportNode from "./nodes/ViewportNode.jsx";
import DebugLogNode from "./nodes/DebugLogNode.jsx";
import ProjectBrowserNode from "./nodes/ProjectBrowserNode.jsx";
import ApiKeyModal from "./components/ApiKeyModal.jsx";
import Toolbar from "./components/Toolbar.jsx";
import Timeline from "./components/Timeline.jsx";
import SnapGuides from "./components/SnapGuides.jsx";

const nodeTypes = {
  chat: ChatNode,
  inspector: InspectorNode,
  viewport: ViewportNode,
  debugLog: DebugLogNode,
  projectBrowser: ProjectBrowserNode,
  camera: CameraNode,
  pad2d: Pad2dNode,
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
    style: { width: 288, height: 300 },
    data: { projects: [], activeProject: null, onSave: () => { }, onLoad: () => { }, onDelete: () => { } },
  },
];

export default function App() {
  const [nodes, setNodes, rawOnNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState([]);
  const { onNodesChange, guides } = useNodeSnapping(nodes, rawOnNodesChange, setNodes);

  // Chat state (restored from localStorage)
  const [messages, setMessages] = useState(() => loadJson("promptgl:messages", []));

  // Scene state
  const [sceneJSON, setSceneJSON] = useState(null);
  const [uiConfig, setUiConfig] = useState({ controls: [], inspectable_buffers: [] });
  const [paused, setPaused] = useState(false);
  const [duration, setDuration] = useState(30);
  const [loop, setLoop] = useState(true);

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

  // Engine ref (shared via EngineContext and node data)
  const engineRef = useRef(null);

  // API key state
  const [apiKeyRequired, setApiKeyRequired] = useState(false);
  const [apiKeyError, setApiKeyError] = useState("");
  const [apiKeyLoading, setApiKeyLoading] = useState(false);

  // Debug log state (restored from localStorage)
  const [debugLogs, setDebugLogs] = useState(() => loadJson("promptgl:debugLogs", []));

  // Project state
  const [projectList, setProjectList] = useState([]);
  const [activeProject, setActiveProject] = useState(null);

  // Agent processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [agentStatus, setAgentStatus] = useState(null); // {status, detail}

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
        break;

      case "agent_status":
        setAgentStatus({ status: msg.status, detail: msg.detail });
        break;

      case "scene_update":
        if (msg.scene_json) {
          setSceneJSON(msg.scene_json);
        }
        if (msg.ui_config) setUiConfig(msg.ui_config);
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
    localStorage.setItem("promptgl:messages", JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    localStorage.setItem("promptgl:debugLogs", JSON.stringify(debugLogs));
  }, [debugLogs]);

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

  const handleTogglePause = useCallback(() => {
    setPaused((p) => !p);
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

      return updated;
    });
  }, [messages, handleSend, isProcessing, agentStatus, handleNewChat, sceneJSON, paused, uiConfig, handleUniformChange, debugLogs, projectList, activeProject, handleProjectSave, handleProjectLoad, handleProjectDelete, handleShaderError, setNodes]);

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
        />

        {apiKeyRequired && (
          <ApiKeyModal
            onSubmit={handleApiKeySubmit}
            error={apiKeyError}
            loading={apiKeyLoading}
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
