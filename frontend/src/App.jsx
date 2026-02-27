import { useCallback, useEffect, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import useWebSocket from "./hooks/useWebSocket.js";
import ChatNode from "./nodes/ChatNode.jsx";
import InspectorNode from "./nodes/InspectorNode.jsx";
import ViewportNode from "./nodes/ViewportNode.jsx";
import DebugLogNode from "./nodes/DebugLogNode.jsx";
import ApiKeyModal from "./components/ApiKeyModal.jsx";

const nodeTypes = {
  chat: ChatNode,
  inspector: InspectorNode,
  viewport: ViewportNode,
  debugLog: DebugLogNode,
};

const WS_URL = `ws://${window.location.hostname}:${window.location.port}/ws`;

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
    data: { controls: [], onUniformChange: () => {} },
  },
  {
    id: "viewport",
    type: "viewport",
    position: { x: 400, y: 50 },
    style: { width: 640, height: 480 },
    data: { shaders: null, pipeline: null, uniforms: {} },
  },
  {
    id: "debugLog",
    type: "debugLog",
    position: { x: 50, y: 750 },
    data: { logs: [] },
  },
];

export default function App() {
  const { connected, lastMessage, send } = useWebSocket(WS_URL);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState([]);

  // Chat state
  const [messages, setMessages] = useState([]);

  // Shader/pipeline state from server
  const [shaders, setShaders] = useState(null);
  const [pipeline, setPipeline] = useState(null);
  const [uiConfig, setUiConfig] = useState({ controls: [] });

  // API key state
  const [apiKeyRequired, setApiKeyRequired] = useState(false);
  const [apiKeyError, setApiKeyError] = useState("");
  const [apiKeyLoading, setApiKeyLoading] = useState(false);

  // Debug log state
  const [debugLogs, setDebugLogs] = useState([]);

  // Handle incoming WebSocket messages
  useEffect(() => {
    if (!lastMessage) return;

    if (lastMessage.type === "init") {
      setShaders(lastMessage.shaders);
      setPipeline(lastMessage.pipeline);
      if (lastMessage.ui_config) {
        setUiConfig(lastMessage.ui_config);
      }
    }

    if (lastMessage.type === "chat_response") {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: lastMessage.text },
      ]);
    }

    if (lastMessage.type === "shader_update") {
      setShaders(lastMessage.shaders);
      setPipeline(lastMessage.pipeline);
      if (lastMessage.ui_config) {
        setUiConfig(lastMessage.ui_config);
      }
    }

    if (lastMessage.type === "api_key_required") {
      setApiKeyRequired(true);
    }

    if (lastMessage.type === "api_key_valid") {
      setApiKeyRequired(false);
      setApiKeyError("");
      setApiKeyLoading(false);
    }

    if (lastMessage.type === "api_key_invalid") {
      setApiKeyError(lastMessage.error || "Invalid API key");
      setApiKeyLoading(false);
    }

    if (lastMessage.type === "agent_log") {
      setDebugLogs((prev) => [
        ...prev,
        {
          agent: lastMessage.agent,
          message: lastMessage.message,
          level: lastMessage.level,
        },
      ]);
    }
  }, [lastMessage]);

  // Callbacks
  const handleSend = useCallback(
    (text) => {
      setMessages((prev) => [...prev, { role: "user", text }]);
      send({ type: "prompt", text });
    },
    [send]
  );

  const handleUniformChange = useCallback((uniform, value) => {
    // For Phase 1, uniform changes are local only
    // Later, this will sync back to the backend
  }, []);

  const handleApiKeySubmit = useCallback(
    (key) => {
      setApiKeyLoading(true);
      setApiKeyError("");
      send({ type: "set_api_key", key });
    },
    [send]
  );

  // Sync data into nodes whenever state changes
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === "chat") {
          return {
            ...node,
            data: { ...node.data, messages, onSend: handleSend },
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
            data: { ...node.data, shaders, pipeline },
          };
        }
        if (node.id === "debugLog") {
          return {
            ...node,
            data: { ...node.data, logs: debugLogs },
          };
        }
        return node;
      })
    );
  }, [messages, handleSend, shaders, pipeline, uiConfig, handleUniformChange, debugLogs, setNodes]);

  return (
    <div className="w-screen h-screen">
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

      {/* Connection indicator */}
      <div className="fixed top-3 right-3 flex items-center gap-2 bg-zinc-800/80 backdrop-blur px-3 py-1.5 rounded-full text-xs border border-zinc-700">
        <div
          className={`w-2 h-2 rounded-full ${
            connected ? "bg-emerald-400" : "bg-red-400"
          }`}
        />
        {connected ? "Connected" : "Disconnected"}
      </div>
    </div>
  );
}
