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
import EngineContext from "./contexts/EngineContext.js";
import ChatNode from "./nodes/ChatNode.jsx";
import InspectorNode from "./nodes/InspectorNode.jsx";
import ViewportNode from "./nodes/ViewportNode.jsx";
import DebugLogNode from "./nodes/DebugLogNode.jsx";
import ProjectBrowserNode from "./nodes/ProjectBrowserNode.jsx";
import BufferViewportNode from "./nodes/BufferViewportNode.jsx";
import ApiKeyModal from "./components/ApiKeyModal.jsx";
import Toolbar from "./components/Toolbar.jsx";

const nodeTypes = {
  chat: ChatNode,
  inspector: InspectorNode,
  viewport: ViewportNode,
  debugLog: DebugLogNode,
  projectBrowser: ProjectBrowserNode,
  bufferViewport: BufferViewportNode,
};

const WS_URL = `ws://${window.location.hostname}:${window.location.port}/ws`;

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
    position: { x: 50, y: 50 },
    data: { messages: [], onSend: () => {} },
  },
  {
    id: "inspector",
    type: "inspector",
    position: { x: 50, y: 450 },
    data: { controls: [], bufferNames: [], onUniformChange: () => {}, onOpenBufferViewport: () => {} },
  },
  {
    id: "viewport",
    type: "viewport",
    position: { x: 400, y: 50 },
    style: { width: 640, height: 480 },
    data: { sceneJSON: null, engineRef: null, paused: false },
  },
  {
    id: "debugLog",
    type: "debugLog",
    position: { x: 50, y: 750 },
    data: { logs: [] },
  },
  {
    id: "projectBrowser",
    type: "projectBrowser",
    position: { x: 1080, y: 50 },
    data: { projects: [], activeProject: null, onSave: () => {}, onLoad: () => {}, onDelete: () => {} },
  },
];

export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState([]);

  // Chat state (restored from localStorage)
  const [messages, setMessages] = useState(() => loadJson("promptgl:messages", []));

  // Scene state
  const [sceneJSON, setSceneJSON] = useState(null);
  const [uiConfig, setUiConfig] = useState({ controls: [], inspectable_buffers: [] });
  const [paused, setPaused] = useState(false);

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

  // Buffer viewport tracking
  const [openBufferViewports, setOpenBufferViewports] = useState([]);

  // Handle every incoming WebSocket message
  const handleMessage = useCallback((msg) => {
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case "init":
        if (msg.scene_json) setSceneJSON(msg.scene_json);
        if (msg.ui_config) setUiConfig(msg.ui_config);
        if (msg.projects) setProjectList(msg.projects);
        break;

      case "chat_response":
        setIsProcessing(false);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", text: msg.text },
        ]);
        break;

      case "scene_update":
        if (msg.scene_json) setSceneJSON(msg.scene_json);
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
        if (msg.scene_json) setSceneJSON(msg.scene_json);
        if (msg.ui_config) setUiConfig(msg.ui_config);
        setDebugLogs([]);
        setOpenBufferViewports([]);
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
    (text) => {
      setMessages((prev) => [...prev, { role: "user", text }]);
      setIsProcessing(true);
      send({ type: "prompt", text });
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

  const handleNewProject = useCallback(() => {
    setMessages([]);
    setDebugLogs([]);
    setSceneJSON(null);
    setUiConfig({ controls: [], inspectable_buffers: [] });
    setActiveProject(null);
    setOpenBufferViewports([]);
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

  const handleOpenBufferViewport = useCallback((bufferName) => {
    setOpenBufferViewports((prev) => {
      if (prev.includes(bufferName)) return prev;
      return [...prev, bufferName];
    });
  }, []);

  const handleCloseBufferViewport = useCallback((nodeId) => {
    const bufferName = nodeId.replace("bufferViewport-", "");
    setOpenBufferViewports((prev) => prev.filter((n) => n !== bufferName));
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

  // Manage buffer viewport nodes dynamically
  useEffect(() => {
    setNodes((nds) => {
      // Remove closed buffer viewports
      const filtered = nds.filter(
        (n) => n.type !== "bufferViewport" || openBufferViewports.includes(n.id.replace("bufferViewport-", ""))
      );

      // Add new buffer viewports
      const existing = new Set(filtered.filter((n) => n.type === "bufferViewport").map((n) => n.id));
      const toAdd = openBufferViewports
        .filter((name) => !existing.has(`bufferViewport-${name}`))
        .map((name, i) => ({
          id: `bufferViewport-${name}`,
          type: "bufferViewport",
          position: { x: 1080 + i * 50, y: 400 + i * 50 },
          style: { width: 400, height: 300 },
          data: {
            bufferName: name,
            engineRef,
            onClose: handleCloseBufferViewport,
          },
        }));

      if (toAdd.length === 0 && filtered.length === nds.length) {
        return nds; // no change
      }
      return [...filtered, ...toAdd];
    });
  }, [openBufferViewports, handleCloseBufferViewport, setNodes]);

  // Sync data into nodes
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === "chat") {
          return {
            ...node,
            data: { ...node.data, messages, onSend: handleSend, isProcessing },
          };
        }
        if (node.id === "inspector") {
          return {
            ...node,
            data: {
              ...node.data,
              controls: uiConfig.controls || [],
              bufferNames: uiConfig.inspectable_buffers || [],
              onUniformChange: handleUniformChange,
              onOpenBufferViewport: handleOpenBufferViewport,
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
        if (node.type === "bufferViewport") {
          return {
            ...node,
            data: {
              ...node.data,
              engineRef,
              onClose: handleCloseBufferViewport,
            },
          };
        }
        return node;
      })
    );
  }, [messages, handleSend, isProcessing, sceneJSON, paused, uiConfig, handleUniformChange, handleOpenBufferViewport, debugLogs, projectList, activeProject, handleProjectSave, handleProjectLoad, handleProjectDelete, handleCloseBufferViewport, handleShaderError, setNodes]);

  return (
    <EngineContext.Provider value={engineRef}>
      <div className="w-screen h-screen pt-10">
        <Toolbar
          onNewProject={handleNewProject}
          onTogglePause={handleTogglePause}
          paused={paused}
          activeProject={activeProject}
          connected={connected}
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
          fitView
          minZoom={0.1}
          maxZoom={4}
          defaultViewport={{ x: 0, y: 0, zoom: 1 }}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#333" gap={24} size={1} />
          <Controls
            className="!bg-zinc-800 !border-zinc-700 !shadow-xl [&>button]:!bg-zinc-800 [&>button]:!border-zinc-700 [&>button]:!fill-zinc-400 [&>button:hover]:!bg-zinc-700"
          />
        </ReactFlow>
      </div>
    </EngineContext.Provider>
  );
}
