import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import useMobile from "./hooks/useMobile.js";
import useWebSocket from "./hooks/useWebSocket.js";
import useMessageBus from "./hooks/useMessageBus.js";
import MessageBus from "./engine/messageBus.js";
import AgentEngine from "./engine/agentEngine.js";
import * as storageApi from "./engine/storage.js";
import useNodeSnapping from "./hooks/useNodeSnapping.js";
import useNodeLayoutHistory from "./hooks/useNodeLayoutHistory.js";
import useRecorder from "./hooks/useRecorder.js";
import useApiKey from "./hooks/useApiKey.js";
import useChat from "./hooks/useChat.js";
import useCustomPanels from "./hooks/useCustomPanels.js";
import useKeyframes from "./hooks/useKeyframes.js";
import useProjectManager from "./hooks/useProjectManager.js";
import useAutoSave from "./hooks/useAutoSave.js";
import useProjectTree from "./hooks/useProjectTree.js";
import useSettings from "./hooks/useSettings.js";
import useUniformHistory from "./hooks/useUniformHistory.js";
import useMessageDispatcher from "./hooks/useMessageDispatcher.js";
import useNodeDataSync from "./hooks/useNodeDataSync.js";
import useAIDebugger from "./hooks/useAIDebugger.js";
import usePromptMode from "./hooks/usePromptMode.js";
import EngineContext from "./contexts/EngineContext.js";
import SettingsContext from "./contexts/SettingsContext.js";
import ChatNode from "./nodes/ChatNode.jsx";
import CustomPanelNode from "./nodes/CustomPanelNode.jsx";
import ViewportNode from "./nodes/ViewportNode.jsx";
import DebugLogNode from "./nodes/DebugLogNode.jsx";
import AssetNode from "./nodes/AssetNode.jsx";
import AssetBrowserNode from "./nodes/AssetBrowserNode.jsx";
import useAssetNodes from "./hooks/useAssetNodes.js";
import ApiKeyModal from "./components/ApiKeyModal.jsx";
import MobileLayout from "./components/MobileLayout.jsx";
import Toolbar from "./components/Toolbar.jsx";
import Timeline from "./components/Timeline.jsx";
import SnapGuides from "./components/SnapGuides.jsx";
import KeyframeEditor from "./components/KeyframeEditor.jsx";
import ProjectTreeSidebar from "./components/ProjectTreeSidebar.jsx";
import VersionComparePanel from "./components/VersionComparePanel.jsx";
import SafeModeBanner from "./components/SafeModeBanner.jsx";
import AssetManagerPanel from "./components/AssetManagerPanel.jsx";
import GitHubSaveDialog from "./components/GitHubSaveDialog.jsx";
import GitHubLoadDialog from "./components/GitHubLoadDialog.jsx";
import useVersionCompare from "./hooks/useVersionCompare.js";
import useGitHub from "./hooks/useGitHub.js";
import { isSafeMode } from "./engine/portableSchema.js";
import { API_BASE } from "./constants/api.js";
import { nextUndoSeq } from "./utils/undoSeq.js";

const UNIFORM_HISTORY_LIMIT = 100;

const nodeTypes = {
  chat: ChatNode,
  viewport: ViewportNode,
  debugLog: DebugLogNode,
  customPanel: CustomPanelNode,
  assetNode: AssetNode,
  assetBrowser: AssetBrowserNode,
};

const BROWSER_ONLY = import.meta.env.VITE_MODE === "browser";

const WS_URL = import.meta.env.DEV
  ? `ws://${window.location.hostname}:8000/ws`
  : `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`;

// Browser-only mode singletons (only created when needed)
let _messageBus, _agentEngine;
if (BROWSER_ONLY) {
  _messageBus = new MessageBus();
  _agentEngine = new AgentEngine(_messageBus);
  _messageBus.setEngine(_agentEngine);
}

const initialNodes = [
  {
    id: "chat",
    type: "chat",
    position: { x: 50, y: 550 },
    style: { width: 670, height: 380 },
    data: { messages: [], onSend: () => { } },
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
    style: { width: 320, height: 480 },
    data: { logs: [] },
  },
  {
    id: "assetBrowser",
    type: "assetBrowser",
    position: { x: 750, y: 550 },
    style: { width: 320, height: 380 },
    data: { assets: new Map(), onDelete: () => {}, onSelect: () => {}, onUpload: () => {} },
  },
];

export default function App() {
  const { isMobile } = useMobile();
  const settingsCtx = useSettings();
  const { settings } = settingsCtx;

  const [nodes, setNodes, rawOnNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState([]);
  const { onNodesChange: onNodesChangeSnapped, guides } = useNodeSnapping(nodes, rawOnNodesChange, setNodes, settings);
  const getSeq = useCallback(() => nextUndoSeq(), []);
  const onLayoutCommitRef = useRef(null);
  const { onNodesChange, undo, redo, historyRef: layoutHistoryRef } =
    useNodeLayoutHistory(nodes, onNodesChangeSnapped, setNodes, getSeq, onLayoutCommitRef);

  const rfInstanceRef = useRef(null);

  // Guard: suppress workspace-state saves until init has fully settled
  const initSettledRef = useRef(false);

  // Scene state
  const [sceneJSON, setSceneJSON] = useState(null);
  const [uiConfig, setUiConfig] = useState({ controls: [], inspectable_buffers: [] });
  const dirtyRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const [duration, setDuration] = useState(30);
  const [loop, setLoop] = useState(true);
  const [canvasSize, setCanvasSize] = useState({ width: 670, height: 480 });

  // Backend target (per-project override: auto / webgl / webgpu)
  const [backendTarget, setBackendTarget] = useState("auto");

  // Model selection (persisted in localStorage)
  const [selectedModel, setSelectedModel] = useState(
    () => localStorage.getItem("siljangnim:selectedModel") || "claude-sonnet-4-6"
  );
  const handleModelChange = useCallback((modelId) => {
    setSelectedModel(modelId);
    localStorage.setItem("siljangnim:selectedModel", modelId);
    // Notify engine of model change
    if (engineRef.current) engineRef.current._selectedModel = modelId;
  }, []);

  // Asset manager panel
  const [assetsPanelOpen, setAssetsPanelOpen] = useState(false);
  const toggleAssetsPanel = useCallback(() => setAssetsPanelOpen((v) => !v), []);
  // Workspace files version counter
  const [workspaceFilesVersion, setWorkspaceFilesVersion] = useState(0);

  // Safe mode state (v2 manifest trust)
  const [projectManifest, setProjectManifest] = useState(null);
  const safeModeActive = isSafeMode(projectManifest);

  // Custom selection state — completely decoupled from ReactFlow's node state.
  // This avoids race conditions caused by frequent setNodes calls from useNodeDataSync.
  const [selectedIds, setSelectedIds] = useState(new Set());
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;

  // Engine ref (shared via EngineContext and node data)
  const engineRef = useRef(null);
  const sendRef = useRef(null);

  // Track canvas size for recording resolution UI
  useEffect(() => {
    let rafId;
    const sync = () => {
      rafId = requestAnimationFrame(sync);
      const c = engineRef.current?.canvas;
      if (c) setCanvasSize((prev) => (prev.width === c.width && prev.height === c.height) ? prev : { width: c.width, height: c.height });
    };
    rafId = requestAnimationFrame(sync);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // Sync backendTarget from sceneJSON when a project is loaded
  useEffect(() => {
    if (sceneJSON?.backendTarget) {
      setBackendTarget(sceneJSON.backendTarget);
    }
  }, [sceneJSON?.backendTarget]);

  // --- Custom hooks ---
  const apiKey = useApiKey(sendRef);
  const chat = useChat(sendRef);
  const panels = useCustomPanels(sendRef);
  const assetNodes = useAssetNodes();
  const handleAssetUpload = useCallback(async (files) => {
    const saved = [];
    for (const file of files) {
      const buf = await file.arrayBuffer();
      await storageApi.saveUpload(file.name, buf, file.type);
      saved.push({ name: file.name, mimeType: file.type, size: file.size });
    }
    if (saved.length > 0) assetNodes.createAssetsFromUpload(saved);
  }, [assetNodes.createAssetsFromUpload]);
  // Wire asset context getter to browser-mode agent engine
  if (BROWSER_ONLY && _agentEngine) {
    _agentEngine._getAssetContext = assetNodes.getPromptContext;
    _agentEngine._selectedModel = selectedModel;
  }
  const kf = useKeyframes(engineRef);

  const captureThumbnail = useCallback(() => {
    if (engineRef.current?.canvas) {
      try {
        return engineRef.current.canvas.toDataURL("image/jpeg", 0.8);
      } catch { /* canvas may be tainted */ }
    }
    return null;
  }, []);

  // Prompt Mode
  const promptModeHook = usePromptMode();

  const getDebugLogs = useCallback(() => chat.debugLogs, [chat.debugLogs]);

  // Refs for save getters (avoid re-creating callbacks on every state change)
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const messagesRef = useRef(chat.messages);
  messagesRef.current = chat.messages;

  const getMessages = useCallback(() => messagesRef.current, []);
  const getNodeLayouts = useCallback(() => {
    const rf = rfInstanceRef.current;
    return nodesRef.current.map((n) => {
      const internal = rf?.getInternalNode(n.id);
      const pos = internal?.position ?? n.position;
      return {
        id: n.id,
        type: n.type,
        position: { x: pos.x, y: pos.y },
        style: n.style ? { ...n.style } : undefined,
      };
    });
  }, []);

  const getWorkspaceState = useCallback(() => {
    return {
      version: 1,
      keyframes: kf.getKeyframeTracks(),
      duration,
      loop,
      node_layouts: getNodeLayouts(),
      assets: assetNodes.serialize(),
    };
  }, [duration, loop, kf.getKeyframeTracks, getNodeLayouts, assetNodes.serialize]);

  // Pending node layouts to apply once after project load
  const pendingLayoutsRef = useRef(null);

  // Overwrite mode: update current node in-place instead of creating a new child
  const [overwriteMode, setOverwriteMode] = useState(false);
  const overwriteModeRef = useRef(false);
  overwriteModeRef.current = overwriteMode;

  const project = useProjectManager(sendRef, captureThumbnail, getWorkspaceState, getDebugLogs, getMessages);

  // Auto-save (Figma-style)
  const captureThumbnailRef = useRef(captureThumbnail);
  captureThumbnailRef.current = captureThumbnail;
  const getMessagesAutoSaveRef = useRef(getMessages);
  getMessagesAutoSaveRef.current = getMessages;
  const autoSave = useAutoSave({
    captureThumbnailRef,
    getMessagesRef: { current: getMessages },
    setProjectList: project.setProjectList,
  });

  // Handler: user changes backend target via toolbar
  const handleBackendTargetChange = useCallback((target) => {
    setBackendTarget(target);
    // Persist into sceneJSON so it's saved with the project
    setSceneJSON((prev) => prev ? { ...prev, backendTarget: target } : prev);
    dirtyRef.current = true;
    autoSave.triggerAutoSave();
    // Notify backend/agent engine of the change
    sendRef.current?.({ type: "set_backend_target", backendTarget: target });
  }, [autoSave.triggerAutoSave]);

  // Project tree (version history)
  const tree = useProjectTree(sendRef, captureThumbnail, getWorkspaceState, getDebugLogs, getMessages);
  const projectTreeRef = useRef(tree);
  projectTreeRef.current = tree;

  // Refs for message dispatcher to access current state without stale closures
  const sceneJSONRef = useRef(sceneJSON);
  sceneJSONRef.current = sceneJSON;
  const uiConfigRef = useRef(uiConfig);
  uiConfigRef.current = uiConfig;
  const panelsDataRef = useRef(panels.customPanels);
  panelsDataRef.current = panels.customPanels;

  // AI Debugger (needs sceneJSONRef)
  const aiDebugger = useAIDebugger(sendRef, sceneJSONRef, chat.addLog);

  const getSceneJSONRef = useRef(() => sceneJSONRef.current);
  const getUiConfigRef = useRef(() => uiConfigRef.current);
  const getWorkspaceStateRef = useRef(getWorkspaceState);
  getWorkspaceStateRef.current = getWorkspaceState;
  const getPanelsRef = useRef(() => panelsDataRef.current);
  const getMessagesRef = useRef(() => messagesRef.current);
  const getDebugLogsRef = useRef(() => chat.debugLogs);
  const getActiveProjectNameRef = useRef(() => {
    return project.activeProject ? storageApi.getActiveProjectName() : null;
  });
  getActiveProjectNameRef.current = () => {
    return project.activeProject ? storageApi.getActiveProjectName() : null;
  };

  // Version compare
  const apiKeyConfigRef = useRef(apiKey.savedConfig);
  apiKeyConfigRef.current = apiKey.savedConfig;
  const compare = useVersionCompare(apiKeyConfigRef);

  // GitHub integration
  const github = useGitHub();
  const [showGitHubSave, setShowGitHubSave] = useState(false);
  const [showGitHubLoad, setShowGitHubLoad] = useState(false);

  // Recording
  const { recording, elapsedTime: recordingTime, startRecording, stopRecording } = useRecorder(engineRef);
  const recorderFnsRef = useRef({ startRecording, stopRecording });
  recorderFnsRef.current = { startRecording, stopRecording };

  // Load project tree when active project changes (lazy migration: ensure root node)
  useEffect(() => {
    const projName = storageApi.getActiveProjectName();
    if (projName) {
      // Ensure root node exists for any project (including _untitled)
      const currentState = {
        scene_json: sceneJSONRef.current || {},
        ui_config: uiConfigRef.current || {},
        workspace_state: getWorkspaceState(),
        panels: panelsDataRef.current || {},
        chat_history: messagesRef.current || [],
        debug_logs: chat.debugLogs || [],
      };
      tree.ensureRoot(projName, currentState).catch(() => { /* non-critical */ });
    } else {
      tree.loadTree(null);
    }
  }, [project.activeProject, tree.ensureRoot, tree.loadTree, getWorkspaceState, chat.debugLogs]);

  // T key → toggle version tree sidebar
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code !== "KeyT") return;
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target.isContentEditable) return;
      e.preventDefault();
      tree.toggleSidebar();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [tree.toggleSidebar]);

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

  // F key → fit view to selected nodes (or all)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code !== "KeyF") return;
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target.isContentEditable) return;
      e.preventDefault();
      const rf = rfInstanceRef.current;
      if (!rf) return;
      const ids = selectedIdsRef.current;
      rf.fitView({
        nodes: ids.size > 0 ? [...ids].map((id) => ({ id })) : undefined,
        duration: 300,
        padding: 0.15,
      });
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // --- Uniform change undo/redo (extracted hook) ---
  const {
    uniformHistoryRef, uniformCoalesceRef, uniformValuesRef,
    resetUniformHistory, undoUniform, redoUniform,
  } = useUniformHistory(engineRef, sendRef, sceneJSON, uiConfig);

  const resetUniformHistoryRef = useRef(resetUniformHistory);
  resetUniformHistoryRef.current = resetUniformHistory;

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
      } else if (e.shiftKey) {
        // REDO: 3-way seq comparison
        const uFuture = uniformHistoryRef.current.future;
        const lFuture = layoutHistoryRef.current.future;
        const pFuture = panels.panelHistoryRef.current.future;
        const uSeq = uFuture.length > 0 ? uFuture[uFuture.length - 1].seq ?? 0 : -1;
        const lSeq = lFuture.length > 0 ? lFuture[lFuture.length - 1].seq ?? 0 : -1;
        const pSeq = pFuture.length > 0 ? pFuture[pFuture.length - 1].seq ?? 0 : -1;
        const maxSeq = Math.max(uSeq, lSeq, pSeq);
        if (maxSeq < 0) return;
        if (pSeq === maxSeq) panels.redoPanelClose();
        else if (uSeq >= lSeq) redoUniform();
        else redo();
      } else {
        // UNDO: 3-way seq comparison
        const uPast = uniformHistoryRef.current.past;
        const lPast = layoutHistoryRef.current.past;
        const pPast = panels.panelHistoryRef.current.past;
        const uSeq = uPast.length > 0 ? uPast[uPast.length - 1].seq ?? 0 : -1;
        const lSeq = lPast.length > 0 ? lPast[lPast.length - 1].seq ?? 0 : -1;
        const pSeq = pPast.length > 0 ? pPast[pPast.length - 1].seq ?? 0 : -1;
        const maxSeq = Math.max(uSeq, lSeq, pSeq);
        if (maxSeq < 0) return;
        if (pSeq === maxSeq) panels.undoPanelClose();
        else if (uSeq >= lSeq) undoUniform();
        else undo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo, kf.undoKeyframes, kf.redoKeyframes, kf.isEditorOpen, undoUniform, redoUniform, panels.undoPanelClose, panels.redoPanelClose]);

  // Debounced send workspace state to backend
  const wsStateTimerRef = useRef(null);
  const sendWorkspaceState = useCallback(() => {
    if (wsStateTimerRef.current) clearTimeout(wsStateTimerRef.current);
    wsStateTimerRef.current = setTimeout(() => {
      sendRef.current?.({ type: "update_workspace_state", workspace_state: getWorkspaceState() });
    }, 2000);
  }, [getWorkspaceState]);

  // Immediate (non-debounced) send — for user actions like drag end
  const sendWorkspaceStateNow = useCallback(() => {
    if (wsStateTimerRef.current) clearTimeout(wsStateTimerRef.current);
    sendRef.current?.({ type: "update_workspace_state", workspace_state: getWorkspaceState() });
  }, [getWorkspaceState]);

  // Use ref so effects don't re-fire when sendWorkspaceState changes
  const sendWsRef = useRef(sendWorkspaceState);
  sendWsRef.current = sendWorkspaceState;

  // Send workspace state when keyframes change (skip init restore)
  const kfMountedRef = useRef(false);
  useEffect(() => {
    if (!kfMountedRef.current) {
      kfMountedRef.current = true;
      return;
    }
    if (kf.keyframeVersion > 0) {
      sendWsRef.current();
      autoSave.triggerAutoSave();
    }
  }, [kf.keyframeVersion, autoSave.triggerAutoSave]);

  const durationLoopMountedRef = useRef(false);
  useEffect(() => {
    if (!durationLoopMountedRef.current) {
      durationLoopMountedRef.current = true;
      return;
    }
    sendWsRef.current();
    autoSave.triggerAutoSave();
  }, [duration, loop, autoSave.triggerAutoSave]);

  // Save workspace state when node layout changes (drag/resize end)
  onLayoutCommitRef.current = () => {
    if (!initSettledRef.current) return; // suppress during init/project load
    sendWorkspaceStateNow();
    autoSave.triggerAutoSave();
  };

  // Buffer for thinking content from agent_status (fallback if agent_log misses it)
  const thinkingBufferRef = useRef("");
  const thinkingLogReceivedRef = useRef(false);

  // Settings ref for message dispatcher (avoids stale closure in [] deps callback)
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Handle incoming WebSocket messages (extracted hook)
  const handleMessage = useMessageDispatcher({
    chat, apiKey, project, panels, kf, assetNodes,
    setSceneJSON, setUiConfig, setDuration, setLoop,
    setWorkspaceFilesVersion, dirtyRef, setPaused,
    recorderFnsRef, pendingLayoutsRef, setNodes,
    resetUniformHistoryRef, initSettledRef,
    wsStateTimerRef, kfMountedRef, durationLoopMountedRef,
    thinkingBufferRef, thinkingLogReceivedRef,
    settingsRef,
    projectTreeRef,
    getSceneJSONRef, getUiConfigRef, getWorkspaceStateRef,
    getPanelsRef, getMessagesRef, getDebugLogsRef,
    getActiveProjectNameRef,
    setProjectManifest,
    overwriteModeRef,
    autoSave,
  });

  const ws = useWebSocket(BROWSER_ONLY ? null : WS_URL, handleMessage);
  const mb = useMessageBus(BROWSER_ONLY ? _messageBus : null, handleMessage);
  const { connected, send } = BROWSER_ONLY ? mb : ws;
  sendRef.current = send;

  // Send prompt mode addition whenever mode changes (pre-computed, not per-prompt)
  const prevModeRef = useRef(null);
  useEffect(() => {
    if (prevModeRef.current === promptModeHook.promptMode) return;
    prevModeRef.current = promptModeHook.promptMode;
    import("./engine/promptMode.js").then((mod) => {
      const interp = mod.interpretPrompt("", promptModeHook.promptMode);
      const addition = mod.buildModeSystemPrompt(interp);
      sendRef.current?.({ type: "set_prompt_mode_addition", addition: addition || "" });
    }).catch(() => {});
  }, [promptModeHook.promptMode]);

  // In browser-only mode, request initial state on mount
  useEffect(() => {
    if (BROWSER_ONLY) send({ type: "request_state" });
  }, [send]);

  // Cmd+S / Ctrl+S — prevent browser default (auto-save handles everything)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleUniformChange = useCallback(
    (uniform, value) => {
      const h = uniformHistoryRef.current;
      const c = uniformCoalesceRef.current;
      const vals = uniformValuesRef.current;

      // Coalesce rapid changes to the same uniform (e.g. slider drag).
      if (c.uniform === uniform && c.timer) {
        clearTimeout(c.timer);
        if (h.past.length > 0) {
          h.past[h.past.length - 1].newValue = value;
        }
      } else {
        const oldValue = vals[uniform] ?? value;
        if (oldValue !== value) {
          h.past.push({ uniform, oldValue, newValue: value, seq: nextUndoSeq() });
          if (h.past.length > UNIFORM_HISTORY_LIMIT) h.past.shift();
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
      autoSave.triggerAutoSave();
    },
    [send, autoSave.triggerAutoSave]
  );

  // Handle restoring scene from tree node (double-click)
  const handleTreeNodeRestore = useCallback(async (nodeId) => {
    const projName = storageApi.getActiveProjectName();
    if (!projName) return;
    try {
      const state = await tree.restoreNode(nodeId, projName);
      // Reuse the project_loaded message path
      handleMessage({
        type: "project_loaded",
        meta: { name: projName, display_name: project.activeProject },
        scene_json: state.scene_json,
        ui_config: state.ui_config,
        workspace_state: state.workspace_state,
        panels: state.panels,
        chat_history: state.chat_history,
        debug_logs: state.debug_logs,
      });
    } catch (err) {
      chat.addLog({ agent: "System", message: `Failed to restore node: ${err.message}`, level: "error" });
    }
  }, [tree.restoreNode, handleMessage, project.activeProject, chat.addLog]);

  // Handle "Continue from here" in tree
  const handleContinueFromNode = useCallback(async (nodeId) => {
    await handleTreeNodeRestore(nodeId);
  }, [handleTreeNodeRestore]);

  // Branch from chat input — set source node for next prompt
  const handleBranchFromChat = useCallback((nodeId) => {
    tree.setActiveNodeId(nodeId);
    // Open sidebar to show the branch context
    tree.setSidebarOpen(true);
  }, [tree.setActiveNodeId, tree.setSidebarOpen]);

  // Switch to a branch tip node from chat
  const handleSwitchToNodeFromChat = useCallback(async (nodeId) => {
    await handleTreeNodeRestore(nodeId);
  }, [handleTreeNodeRestore]);

  // Handle branch from tree node
  const handleTreeBranch = useCallback(async (nodeId, title) => {
    const projName = storageApi.getActiveProjectName();
    if (!projName) return;
    await tree.branchFromNode(nodeId, projName, title);
  }, [tree.branchFromNode]);

  // Handle rename in tree
  const handleTreeRename = useCallback(async (nodeId, newTitle) => {
    const projName = storageApi.getActiveProjectName();
    if (!projName) return;
    await tree.renameNode(nodeId, newTitle, projName);
  }, [tree.renameNode]);

  // Handle toggle favorite
  const handleTreeToggleFavorite = useCallback(async (nodeId) => {
    const projName = storageApi.getActiveProjectName();
    if (!projName) return;
    await tree.toggleFavorite(nodeId, projName);
  }, [tree.toggleFavorite]);

  // Handle pin checkpoint
  const handleTreePinCheckpoint = useCallback(async (nodeId) => {
    const projName = storageApi.getActiveProjectName();
    if (!projName) return;
    await tree.pinCheckpoint(nodeId, projName);
  }, [tree.pinCheckpoint]);

  // Handle duplicate node (creates a checkpoint copy as a sibling)
  const handleTreeDuplicate = useCallback(async (nodeId) => {
    const projName = storageApi.getActiveProjectName();
    if (!projName) return;
    await tree.pinCheckpoint(nodeId, projName);
  }, [tree.pinCheckpoint]);

  // Handle compare
  const handleStartCompare = useCallback((nodeId) => {
    compare.startCompare(nodeId);
  }, [compare.startCompare]);

  const handleSelectCompareTarget = useCallback((nodeId) => {
    const projName = storageApi.getActiveProjectName();
    if (!projName) return;
    compare.selectCompareTarget(nodeId, projName);
  }, [compare.selectCompareTarget]);

  // Handle delete node
  const handleTreeDeleteNode = useCallback(async (nodeId) => {
    const projName = storageApi.getActiveProjectName();
    if (!projName) return;
    await tree.deleteNodeTree(nodeId, projName);
  }, [tree.deleteNodeTree]);

  const handleNewProject = useCallback(() => {
    // No unsaved-changes dialog — auto-save ensures everything is persisted
    chat.clearAll();
    resetUniformHistory();
    setSceneJSON(null);
    setUiConfig({ controls: [], inspectable_buffers: [] });
    panels.restorePanels({});
    assetNodes.restore({});
    project.setActiveProject(null);
    setProjectManifest(null);
    setBackendTarget("auto");
    kf.resetKeyframes();
    setDuration(settings.defaultDuration);
    setLoop(settings.defaultLoop);
    dirtyRef.current = false;
    send({ type: "new_project" });
  }, [send, chat.clearAll, resetUniformHistory, panels.restorePanels, kf.resetKeyframes, project.setActiveProject, settings.defaultDuration, settings.defaultLoop]);

  // Trust a safe-mode project
  const handleTrustProject = useCallback(() => {
    send({ type: "trust_project", name: storageApi.getActiveProjectName() });
    setProjectManifest((prev) => prev ? { ...prev, trust: { safe_mode: false, trusted_by: "user", trusted_at: new Date().toISOString() } } : prev);
  }, [send]);

  // Fork & Remix a GitHub project
  const handleForkRemix = useCallback(async () => {
    if (!github.isAuthenticated || !projectManifest?.provenance?.github_repo) return;
    const [owner, repo] = projectManifest.provenance.github_repo.split("/");
    if (!owner || !repo) return;
    try {
      chat.addLog({ agent: "GitHub", message: `Forking ${owner}/${repo}...`, level: "info" });
      const { forkRepo, checkForkStatus, loadProjectFromRepo } = await import("./engine/github.js");
      const fork = await forkRepo(github.token, owner, repo);
      // Wait for fork to be ready
      await checkForkStatus(github.token, github.user.login, repo);
      chat.addLog({ agent: "GitHub", message: `Fork created: ${github.user.login}/${repo}`, level: "info" });

      // Load from fork
      const path = projectManifest.provenance.github_path || "";
      const result = await loadProjectFromRepo(github.token, github.user.login, repo, path);

      // Import with forked_from set
      const { migrateV1toV2, validateManifest, buildProvenanceGitHub } = await import("./engine/portableSchema.js");
      let manifest = result.manifest || migrateV1toV2({ name: repo });
      manifest = validateManifest(manifest);
      manifest.provenance = buildProvenanceGitHub(repo, github.user.login, result.commitSha, path);
      manifest.provenance.forked_from = `${owner}/${repo}`;
      manifest.provenance.original_author = owner;
      manifest.trust = { safe_mode: false, trusted_by: "user", trusted_at: new Date().toISOString() };

      const bundle = JSON.stringify({
        schema_version: 2,
        manifest,
        meta: manifest,
        files: result.files,
        blobs: result.blobs,
        nodes: [],
      });
      const meta = await storageApi.importProjectZip(bundle, { isExternal: false });
      sendRef.current?.({ type: "project_load", name: meta.name });
    } catch (err) {
      chat.addLog({ agent: "GitHub", message: `Fork failed: ${err.message}`, level: "error" });
    }
  }, [github.isAuthenticated, github.token, github.user, projectManifest, chat.addLog]);

  const handleDeleteWorkspaceFile = useCallback(
    async (filepath) => {
      try {
        if (BROWSER_ONLY) {
          await storageApi.deleteFile(filepath);
        } else {
          const res = await fetch(`${API_BASE}/api/workspace/files/${encodeURIComponent(filepath)}`, {
            method: "DELETE",
          });
          if (!res.ok) return;
        }
        setWorkspaceFilesVersion((v) => v + 1);
      } catch { /* ignore */ }
    },
    []
  );

  const handleTogglePause = useCallback(() => setPaused((p) => !p), []);

  const handleStartRecord = useCallback((settings) => {
    if (!settings.offline) setPaused(false);
    startRecording(settings);
  }, [startRecording]);

  const handleShaderError = useCallback((err) => {
    const message = err.message || String(err);
    chat.addLog({ agent: "WebGL", message, level: "error" });
    // Feed shader compile errors to AI debugger
    if (message.includes("compile") || message.includes("shader") || message.includes("GLSL") || message.includes("ERROR:")) {
      aiDebugger.addCompileLog("fragment", "", message);
    } else {
      aiDebugger.addRuntimeError(err, "render");
    }
  }, [chat.addLog, aiDebugger.addCompileLog, aiDebugger.addRuntimeError]);

  // --- Node selection (fully decoupled from ReactFlow's node state) ---
  // Uses a separate selectedIds state + DOM data-attribute for visual feedback.
  // This is immune to race conditions from frequent setNodes calls.
  useEffect(() => {
    const handlePointerDown = (e) => {
      const flowEl = e.target.closest('.react-flow');
      if (!flowEl) return;
      if (e.target.closest('.react-flow__controls') ||
          e.target.closest('.react-flow__minimap') ||
          e.target.closest('.react-flow__panel')) return;

      const nodeEl = e.target.closest('.react-flow__node');

      if (!nodeEl) {
        // Pane click — deselect all
        if (selectedIdsRef.current.size > 0) setSelectedIds(new Set());
        return;
      }

      const nodeId = nodeEl.getAttribute('data-id');
      if (!nodeId) return;

      const isMulti = e.shiftKey || e.metaKey || e.ctrlKey;

      setSelectedIds((prev) => {
        const next = isMulti ? new Set(prev) : new Set();
        next.add(nodeId);
        return next;
      });
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  // Sync selection to DOM data-attribute (useLayoutEffect = before paint, no flash)
  useLayoutEffect(() => {
    document.querySelectorAll('.react-flow__node').forEach((el) => {
      const nodeId = el.getAttribute('data-id');
      if (selectedIds.has(nodeId)) {
        el.setAttribute('data-custom-selected', '');
      } else {
        el.removeAttribute('data-custom-selected');
      }
    });
  }, [selectedIds]);

  // Wrap panel close to capture node position + assign undo seq
  const handlePanelClose = useCallback((panelId) => {
    const node = nodesRef.current.find((n) => n.id === `panel_${panelId}`);
    panels.handleClosePanel(panelId, {
      seq: nextUndoSeq(),
      nodePosition: node?.position,
      nodeStyle: node?.style,
    });
  }, [panels.handleClosePanel]);

  // Merge live uniform values from sceneJSON into a controls array
  const mergeControlDefaults = useCallback((controls) => {
    if (!controls || !sceneJSON?.uniforms) return controls;
    return controls.map((ctrl) => {
      if (!ctrl.uniform) return ctrl;
      const uDef = sceneJSON.uniforms[ctrl.uniform];
      if (!uDef || uDef.value === undefined) return ctrl;
      let liveVal = uDef.value;
      // Convert vec3/vec4 [r,g,b] or [r,g,b,a] (0-1) to hex for color controls
      if (ctrl.type === "color" && Array.isArray(liveVal)) {
        const to255 = (v) => Math.round(Math.min(1, Math.max(0, v)) * 255);
        const r = to255(liveVal[0]);
        const g = to255(liveVal[1]);
        const b = to255(liveVal[2]);
        if (liveVal.length >= 4) {
          const a = to255(liveVal[3]);
          liveVal = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}${a.toString(16).padStart(2, "0")}`;
        } else {
          liveVal = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
        }
      }
      return { ...ctrl, default: liveVal };
    });
  }, [sceneJSON]);

  // Compute active tree node title for ChatNode branch indicator
  const activeNodeTitle = tree.treeNodes.find((n) => n.id === tree.activeNodeId)?.title || null;

  // Overwrite mode toggle
  const handleToggleOverwrite = useCallback(() => setOverwriteMode((v) => !v), []);

  // Sync data into nodes (extracted hook)
  useNodeDataSync({
    setNodes, chat, sceneJSON, paused, uiConfig,
    handleUniformChange, project, handleDeleteWorkspaceFile,
    workspaceFilesVersion, handleShaderError,
    panels, handlePanelClose, mergeControlDefaults,
    kf, duration, loop, engineRef, pendingLayoutsRef,
    setDuration, setLoop,
    activeNodeTitle,
    rfInstanceRef,
    debugger: aiDebugger,
    assetNodes,
    onAssetUpload: handleAssetUpload,
    onPromptSuggestion: (text) => chat.handleSend(text),
    safeModeActive,
    promptMode: promptModeHook.promptMode,
    treeNodes: tree.treeNodes,
    activeTreeNodeId: tree.activeNodeId,
    onBranchFromNode: handleBranchFromChat,
    onSwitchToNode: handleSwitchToNodeFromChat,
    overwriteMode,
    onToggleOverwrite: handleToggleOverwrite,
    backendTarget,
  });

  return (
    <SettingsContext.Provider value={settingsCtx}>
    <EngineContext.Provider value={engineRef}>
      <div className={`w-screen h-screen ${isMobile ? "pt-10 pb-20" : "pt-10 pb-10"}`}>
        <Toolbar
          onNewProject={handleNewProject}
          activeProject={project.activeProject}
          connected={connected}
          provider={apiKey.savedConfig?.provider}
          saveStatus={autoSave.saveStatus}
          onChangeApiKey={() => apiKey.setRequired()}
          onToggleTree={tree.toggleSidebar}
          treeOpen={tree.sidebarOpen}
          onToggleAssets={toggleAssetsPanel}
          assetsOpen={assetsPanelOpen}
          promptMode={promptModeHook.promptMode}
          onPromptModeChange={promptModeHook.setPromptMode}
          projectManifest={projectManifest}
          backendTarget={backendTarget}
          onBackendTargetChange={handleBackendTargetChange}
          selectedModel={selectedModel}
          onModelChange={handleModelChange}
        />

        {safeModeActive && (
          <SafeModeBanner
            manifest={projectManifest}
            onTrust={handleTrustProject}
            onForkRemix={github.isAuthenticated && projectManifest?.provenance?.source_type === "github" ? handleForkRemix : undefined}
          />
        )}

        {(!isMobile || tree.sidebarOpen) && (
          <ProjectTreeSidebar
            isOpen={tree.sidebarOpen}
            isMobile={isMobile}
            treeNodes={tree.treeNodes}
            activeNodeId={tree.activeNodeId}
            projectName={storageApi.getActiveProjectName()}
            onSelectNode={(id) => tree.setActiveNodeId(id)}
            onDoubleClickNode={handleTreeNodeRestore}
            onBranch={handleTreeBranch}
            onDuplicate={handleTreeDuplicate}
            onRename={handleTreeRename}
            onToggleFavorite={handleTreeToggleFavorite}
            onPinCheckpoint={handleTreePinCheckpoint}
            onDeleteNode={handleTreeDeleteNode}
            onContinueFrom={handleContinueFromNode}
            compareSourceId={compare.compareSourceId}
            onStartCompare={handleStartCompare}
            onSelectCompareTarget={handleSelectCompareTarget}
            onCancelCompare={compare.cancelCompare}
            projectList={project.projectList}
            activeProject={project.activeProject}
            onProjectLoad={project.handleProjectLoad}
            onProjectDelete={project.handleProjectDelete}
            onProjectRename={project.handleProjectRename}
            onProjectImport={project.handleProjectImport}
            github={github}
            onGitHubSave={() => setShowGitHubSave(true)}
            onGitHubLoad={() => setShowGitHubLoad(true)}
          />
        )}

        <AssetManagerPanel
          isOpen={assetsPanelOpen}
          isMobile={isMobile}
          assets={assetNodes.assets}
          onDelete={assetNodes.deleteAsset}
          onSelect={assetNodes.selectAsset}
          onUpload={handleAssetUpload}
        />

        <div style={{
          marginLeft: !isMobile && tree.sidebarOpen ? 256 : 0,
          marginRight: !isMobile && assetsPanelOpen ? 240 : 0,
          transition: "margin-left 0.2s ease, margin-right 0.2s ease",
          height: "100%",
          display: "flex",
          flexDirection: "column",
        }}>
        <Timeline
          paused={paused}
          onTogglePause={handleTogglePause}
          onPause={() => { setPaused(true); if (recording) stopRecording(); }}
          engineRef={engineRef}
          duration={duration}
          onDurationChange={setDuration}
          loop={loop}
          onLoopChange={setLoop}
          recording={recording}
          recordingTime={recordingTime}
          onStartRecord={handleStartRecord}
          onStopRecord={stopRecording}
          canvasWidth={canvasSize.width}
          canvasHeight={canvasSize.height}
        />

        {apiKey.apiKeyRequired && (
          <ApiKeyModal
            onSubmit={apiKey.handleApiKeySubmit}
            error={apiKey.apiKeyError}
            loading={apiKey.apiKeyLoading}
            onClose={() => apiKey.setValid()}
            savedConfig={apiKey.savedConfig}
          />
        )}

        {showGitHubSave && github.isAuthenticated && (
          <GitHubSaveDialog
            token={github.token}
            user={github.user}
            projectName={project.activeProject || "untitled"}
            captureThumbnail={captureThumbnail}
            onClose={() => setShowGitHubSave(false)}
            onSaved={({ owner, repo, path }) => {
              setShowGitHubSave(false);
              chat.addLog({ agent: "GitHub", message: `Pushed to ${owner}/${repo}${path ? `/${path}` : ""}`, level: "info" });
            }}
          />
        )}

        {showGitHubLoad && (
          <GitHubLoadDialog
            token={github.token}
            isAuthenticated={github.isAuthenticated}
            onClose={() => setShowGitHubLoad(false)}
            onImported={(meta) => {
              setShowGitHubLoad(false);
              sendRef.current?.({ type: "project_load", name: meta.name });
            }}
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

        {(compare.isComparing || compare.compareLoading) && (
          <VersionComparePanel
            result={compare.compareResult}
            loading={compare.compareLoading}
            onClose={compare.cancelCompare}
          />
        )}

        {isMobile ? (
          <MobileLayout
            sceneJSON={sceneJSON}
            engineRef={engineRef}
            paused={paused}
            onShaderError={handleShaderError}
            messages={chat.messages}
            onSend={chat.handleSend}
            isProcessing={chat.isProcessing}
            agentStatus={chat.agentStatus}
            onNewChat={chat.handleNewChat}
            onCancel={chat.handleCancel}
            pendingQuestion={chat.pendingQuestion}
            onAnswer={chat.handleAnswer}
            debugLogs={chat.debugLogs}
            projectList={project.projectList}
            activeProject={project.activeProject}
            onProjectLoad={project.handleProjectLoad}
            onProjectDelete={project.handleProjectDelete}
            onProjectRename={project.handleProjectRename}
            onProjectImport={project.handleProjectImport}
            onDeleteWorkspaceFile={handleDeleteWorkspaceFile}
            workspaceFilesVersion={workspaceFilesVersion}
            customPanels={panels.customPanels}
            onPanelClose={handlePanelClose}
            onUniformChange={handleUniformChange}
            keyframeManagerRef={kf.keyframeManagerRef}
            onKeyframesChange={kf.handlePanelKeyframesChange}
            onDurationChange={setDuration}
            onLoopChange={setLoop}
            onOpenKeyframeEditor={kf.handleOpenKeyframeEditor}
            duration={duration}
            loop={loop}
          />
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onInit={(instance) => { rfInstanceRef.current = instance; }}
            onNodeDragStop={() => {
              if (!initSettledRef.current) return;
              requestAnimationFrame(() => {
                sendWorkspaceStateNow();
                autoSave.triggerAutoSave();
              });
            }}
            nodeTypes={nodeTypes}
            deleteKeyCode={null}
            elementsSelectable={false}
            fitView
            minZoom={0.1}
            maxZoom={4}
            defaultViewport={{ x: 0, y: 0, zoom: 1 }}
            proOptions={{ hideAttribution: true }}
          >
            <SnapGuides guides={guides} />
            <Background color="var(--grid-color)" gap={settings.gridGap} size={settings.gridDotSize} style={{ backgroundColor: settings.canvasBg }} />
            <Controls />
          </ReactFlow>
        )}
        </div>

      </div>
    </EngineContext.Provider>
    </SettingsContext.Provider>
  );
}
