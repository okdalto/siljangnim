import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { reconstructScene } from "./engine/projectTree.js";
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
import useKeyboardShortcuts from "./hooks/useKeyboardShortcuts.js";
import useTreeActions from "./hooks/useTreeActions.js";
import useNodeSelection from "./hooks/useNodeSelection.js";
import useWorkspaceStateSync from "./hooks/useWorkspaceStateSync.js";
import useAssetHandlers from "./hooks/useAssetHandlers.js";
import useAIDebugger from "./hooks/useAIDebugger.js";
import usePromptMode from "./hooks/usePromptMode.js";
import FeedbackButton from "./components/FeedbackButton.jsx";
import EngineContext from "./contexts/EngineContext.js";
import SettingsContext from "./contexts/SettingsContext.js";
import SceneContext from "./contexts/SceneContext.js";
import { nodeTypes, initialNodes } from "./config/nodeConfig.js";
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
import GitHubSaveDialog from "./components/GitHubSaveDialog.jsx";
import GitHubLoadDialog from "./components/GitHubLoadDialog.jsx";
import useVersionCompare from "./hooks/useVersionCompare.js";
import useGitHub from "./hooks/useGitHub.js";
import { isSafeMode } from "./engine/portableSchema.js";
import { API_BASE } from "./constants/api.js";
import { nextUndoSeq } from "./utils/undoSeq.js";

const UNIFORM_HISTORY_LIMIT = 100;

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

export default function App() {
  const { isMobile } = useMobile();
  const settingsCtx = useSettings();
  const { settings } = settingsCtx;

  const [nodes, setNodes, rawOnNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState([]);
  // Custom selection state — completely decoupled from ReactFlow's node state.
  // Declared early so useNodeSnapping can access it for multi-select drag.
  const { selectedIds, selectedIdsRef } = useNodeSelection();
  const { onNodesChange: onNodesChangeSnapped, guides } = useNodeSnapping(nodes, rawOnNodesChange, setNodes, settings, selectedIdsRef);
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

  // Per-node UI state (collapsed, fixedResolution) — tracked here so we can
  // persist them in workspace_state snapshots and restore on checkout.
  const nodeUiStateRef = useRef({
    collapsed: {},            // { chat: false, viewport: false, debugLog: false, ... }
    viewportFixedResolution: null, // null = auto, [w, h] = fixed
  });

  // Workspace files version counter
  const [workspaceFilesVersion, setWorkspaceFilesVersion] = useState(0);

  // Safe mode state (v2 manifest trust)
  const [projectManifest, setProjectManifest] = useState(null);
  const safeModeActive = isSafeMode(projectManifest);

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
  const { handleAssetUpload, handleAssetDelete } = useAssetHandlers({
    assetNodes, chat, sendRef, BROWSER_ONLY, agentEngine: _agentEngine, sceneJSON,
  });

  // Wire asset context getter to browser-mode agent engine
  if (BROWSER_ONLY && _agentEngine) {
    _agentEngine._getAssetContext = assetNodes.getPromptContext;
    _agentEngine._selectedModel = selectedModel;
  }

  // Forward uncaught runtime errors (e.g. from GLEngine script execution) to agent error collector
  useEffect(() => {
    if (!BROWSER_ONLY || !_agentEngine) return;
    const handler = (event) => {
      const msg = event.message || event.error?.message || String(event.error || "Unknown error");
      // Only forward if agent is busy (otherwise it's not relevant to agent work)
      if (_agentEngine.agentBusy) {
        _agentEngine.errorCollector.push(msg);
      }
    };
    window.addEventListener("error", handler);
    return () => window.removeEventListener("error", handler);
  }, []);

  // Auto-switch model when provider changes (if current model doesn't belong to new provider)
  const currentProvider = apiKey.savedConfig?.provider;
  useEffect(() => {
    if (!currentProvider) return;
    const PROVIDER_MODELS = {
      anthropic: ["claude-sonnet-4-6", "claude-opus-4-6", "claude-haiku-4-5-20251001"],
      openai: ["gpt-4o", "gpt-4o-mini", "o3"],
      gemini: ["gemini-2.5-pro", "gemini-2.0-flash"],
      glm: ["glm-4-plus"],
    };
    const models = PROVIDER_MODELS[currentProvider];
    if (models && !models.includes(selectedModel)) {
      handleModelChange(models[0]);
    }
  }, [currentProvider]); // eslint-disable-line react-hooks/exhaustive-deps
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

  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const backendTargetRef = useRef(backendTarget);
  backendTargetRef.current = backendTarget;

  const getWorkspaceState = useCallback(() => {
    // Capture React Flow viewport (zoom/pan)
    let viewport = { x: 0, y: 0, zoom: 1 };
    try {
      const vp = rfInstanceRef.current?.getViewport();
      if (vp) viewport = { x: vp.x, y: vp.y, zoom: vp.zoom };
    } catch { /* ignore */ }

    return {
      version: 1,
      keyframes: kf.getKeyframeTracks(),
      duration,
      loop,
      node_layouts: getNodeLayouts(),
      assets: assetNodes.serialize(),
      ui_state: {
        viewport,
        paused: pausedRef.current,
        backendTarget: backendTargetRef.current,
        collapsed: { ...nodeUiStateRef.current.collapsed },
        viewportFixedResolution: nodeUiStateRef.current.viewportFixedResolution,
      },
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

  const gettersRef = useRef({
    getSceneJSON: () => sceneJSONRef.current,
    getUiConfig: () => uiConfigRef.current,
    getWorkspaceState,
    getPanels: () => Object.fromEntries(panelsDataRef.current),
    getMessages: () => messagesRef.current,
    getDebugLogs: () => chat.debugLogs,
    getActiveProjectName: () => project.activeProject ? storageApi.getActiveProjectName() : null,
  });
  gettersRef.current.getWorkspaceState = getWorkspaceState;
  gettersRef.current.getDebugLogs = () => chat.debugLogs;
  gettersRef.current.getActiveProjectName = () => project.activeProject ? storageApi.getActiveProjectName() : null;

  // Version compare
  const apiKeyConfigRef = useRef(apiKey.savedConfig);
  apiKeyConfigRef.current = apiKey.savedConfig;
  const compare = useVersionCompare(apiKeyConfigRef);

  // GitHub integration
  const github = useGitHub();
  const [showGitHubSave, setShowGitHubSave] = useState(false);
  const [showGitHubLoad, setShowGitHubLoad] = useState(false);

  // Recording
  const { recording, elapsedTime: recordingTime, progress: recProgress, completionInfo: recCompletionInfo, startRecording, stopRecording } = useRecorder(engineRef);
  const recorderFnsRef = useRef({ startRecording, stopRecording, engineRef });
  recorderFnsRef.current = { startRecording, stopRecording, engineRef };

  // Notify agent engine when recording finishes (so start_recording tool can await completion)
  const prevRecordingRef = useRef(false);
  useEffect(() => {
    if (prevRecordingRef.current && !recording && BROWSER_ONLY && _agentEngine) {
      _agentEngine.handleMessage({ type: "recording_done" });
    }
    prevRecordingRef.current = recording;
  }, [recording]);

  // Load project tree when active project changes (lazy migration: ensure root node)
  // NOTE: Only depend on activeProject — do NOT depend on getWorkspaceState/debugLogs
  // as those change every scene update and cause tree flicker.
  useEffect(() => {
    const projName = storageApi.getActiveProjectName();
    if (projName) {
      // Ensure root node exists for any project (including _untitled)
      const currentState = {
        scene_json: sceneJSONRef.current || {},
        ui_config: uiConfigRef.current || {},
        workspace_state: getWorkspaceState(),
        panels: Object.fromEntries(panelsDataRef.current || new Map()),
        chat_history: messagesRef.current || [],
        debug_logs: chat.debugLogs || [],
      };
      tree.ensureRoot(projName, currentState).catch(() => { /* non-critical */ });
    } else {
      tree.loadTree(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.activeProject]);

  // --- Uniform change undo/redo (extracted hook) ---
  const {
    uniformHistoryRef, uniformCoalesceRef, uniformValuesRef,
    resetUniformHistory, undoUniform, redoUniform,
  } = useUniformHistory(engineRef, sendRef, sceneJSON, uiConfig);

  const resetUniformHistoryRef = useRef(resetUniformHistory);
  resetUniformHistoryRef.current = resetUniformHistory;

  // Keyboard shortcuts (T, Space, F, Ctrl+Z, Cmd+S)
  useKeyboardShortcuts({
    setPaused,
    toggleSidebar: tree.toggleSidebar,
    rfInstanceRef,
    selectedIdsRef,
    undo,
    redo,
    undoUniform,
    redoUniform,
    uniformHistoryRef,
    layoutHistoryRef,
    kf,
    panels,
  });

  // Debounced + immediate workspace-state sync to backend
  const { wsStateTimerRef, sendWorkspaceState, sendWorkspaceStateNow, kfMountedRef, durationLoopMountedRef } =
    useWorkspaceStateSync({ sendRef, getWorkspaceState, kf, duration, loop, autoSave, initSettledRef, onLayoutCommitRef });

  // Buffers for thinking content from agent_status (fallback if agent_log misses it)
  const buffersRef = useRef({ thinkingBuffer: "", thinkingLogReceived: false });

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
    buffersRef,
    settingsRef,
    projectTreeRef,
    gettersRef,
    setProjectManifest,
    overwriteModeRef,
    autoSave,
    setBackendTarget, rfInstanceRef, nodeUiStateRef,
    agentEngine: _agentEngine,
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

  // Tree-related callbacks (extracted hook)
  const {
    handleTreeNodeRestore,
    handleContinueFromNode,
    handleBranchFromChat,
    handleSwitchToNodeFromChat,
    handleTreeBranch,
    handleTreeRename,
    handleTreeToggleFavorite,
    handleTreePinCheckpoint,
    handleTreeDuplicate,
    handleStartCompare,
    handleSelectCompareTarget,
    handleTreeDeleteNode,
  } = useTreeActions({ tree, compare, handleMessage, project, chat, agentEngine: _agentEngine });

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
    // Forward to agent error collector so check_browser_errors picks it up
    if (BROWSER_ONLY && _agentEngine) {
      _agentEngine.errorCollector.push(message);
    } else {
      sendRef.current?.({ type: "console_error", message });
    }
    // Feed shader compile errors to AI debugger
    if (message.includes("compile") || message.includes("shader") || message.includes("GLSL") || message.includes("ERROR:")) {
      aiDebugger.addCompileLog("fragment", "", message);
    } else {
      aiDebugger.addRuntimeError(err, "render");
    }
  }, [chat.addLog, aiDebugger.addCompileLog, aiDebugger.addRuntimeError]);

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

  // Scene references — nodes pinned from version tree for agent context
  const [sceneReferences, setSceneReferences] = useState([]);

  const handleReferenceInChat = useCallback(async (node) => {
    // Don't add duplicates
    if (sceneReferences.some((r) => r.nodeId === node.id)) return;
    try {
      const projName = storageApi.getActiveProjectName();
      const state = await reconstructScene(node.id, projName);
      setSceneReferences((prev) => [...prev, {
        nodeId: node.id,
        title: node.title || "Untitled",
        sceneJson: state.scene_json,
      }]);
    } catch (e) {
      console.error("[App] Failed to reconstruct scene for reference:", e);
    }
  }, [sceneReferences]);

  const handleRemoveReference = useCallback((nodeId) => {
    setSceneReferences((prev) => prev.filter((r) => r.nodeId !== nodeId));
  }, []);

  const handleClearReferences = useCallback(() => {
    setSceneReferences([]);
  }, []);

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
    onAssetDelete: handleAssetDelete,
    onPromptSuggestion: (text) => chat.handleSend(text),
    onClearReferences: handleClearReferences,
    safeModeActive,
    promptMode: promptModeHook.promptMode,
    treeNodes: tree.treeNodes,
    activeTreeNodeId: tree.activeNodeId,
    onBranchFromNode: handleBranchFromChat,
    onSwitchToNode: handleSwitchToNodeFromChat,
    overwriteMode,
    onToggleOverwrite: handleToggleOverwrite,
    backendTarget,
    nodeUiStateRef,
    sceneReferences,
    onRemoveReference: handleRemoveReference,
  });

  const sceneCtxValue = useMemo(() => ({
    sceneJSON, uiConfig, paused, duration, loop, backendTarget, safeModeActive,
  }), [sceneJSON, uiConfig, paused, duration, loop, backendTarget, safeModeActive]);

  return (
    <SettingsContext.Provider value={settingsCtx}>
    <EngineContext.Provider value={engineRef}>
    <SceneContext.Provider value={sceneCtxValue}>
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
          promptMode={promptModeHook.promptMode}
          onPromptModeChange={promptModeHook.setPromptMode}
          projectManifest={projectManifest}
          backendTarget={backendTarget}
          onBackendTargetChange={handleBackendTargetChange}
          selectedModel={selectedModel}
          onModelChange={handleModelChange}
          onProjectRename={project.handleProjectRename}
          githubAuth={github}
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
            onReferenceInChat={handleReferenceInChat}
            compareSourceId={compare.compareSourceId}
            onStartCompare={handleStartCompare}
            onSelectCompareTarget={handleSelectCompareTarget}
            onCancelCompare={compare.cancelCompare}
            projectList={project.projectList}
            activeProject={project.activeProject}
            onProjectLoad={project.handleProjectLoad}
            onProjectDelete={project.handleProjectDelete}
            onProjectRename={project.handleProjectRename}
            onProjectFork={project.handleProjectFork}
            onProjectImport={project.handleProjectImport}
            github={github}
            onGitHubSave={() => setShowGitHubSave(true)}
            onGitHubLoad={() => setShowGitHubLoad(true)}
          />
        )}

        <div style={{
          marginLeft: !isMobile && tree.sidebarOpen ? 256 : 0,
          transition: "margin-left 0.2s ease",
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
          progress={recProgress}
          completionInfo={recCompletionInfo}
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
            onProjectFork={project.handleProjectFork}
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
      {!isMobile && (
        <FeedbackButton
          isAuthenticated={github.isAuthenticated}
          token={github.token}
        />
      )}
    </SceneContext.Provider>
    </EngineContext.Provider>
    </SettingsContext.Provider>
  );
}
