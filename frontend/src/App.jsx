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
import CustomPanelNode from "./nodes/CustomPanelNode.jsx";
import ViewportNode from "./nodes/ViewportNode.jsx";
import DebugLogNode from "./nodes/DebugLogNode.jsx";
import ProjectBrowserNode from "./nodes/ProjectBrowserNode.jsx";
import ApiKeyModal from "./components/ApiKeyModal.jsx";
import Toolbar from "./components/Toolbar.jsx";
import Timeline from "./components/Timeline.jsx";
import SnapGuides from "./components/SnapGuides.jsx";
import KeyframeEditor from "./components/KeyframeEditor.jsx";

let _undoSeq = 0;

const _PLACEMENT_GAP = 20;

/**
 * Find a non-overlapping position for a new panel among existing nodes.
 * Tries placing to the right of each node, then below, picking the
 * candidate closest to the origin to keep the layout compact.
 */
function findEmptyPosition(existingNodes, width, height) {
  const boxes = existingNodes.map((n) => ({
    x: n.position.x,
    y: n.position.y,
    w: n.measured?.width ?? n.width ?? parseFloat(n.style?.width) ?? 320,
    h: n.measured?.height ?? n.height ?? parseFloat(n.style?.height) ?? 300,
  }));

  const overlaps = (cx, cy) =>
    boxes.some(
      (b) =>
        cx < b.x + b.w + _PLACEMENT_GAP &&
        cx + width + _PLACEMENT_GAP > b.x &&
        cy < b.y + b.h + _PLACEMENT_GAP &&
        cy + height + _PLACEMENT_GAP > b.y
    );

  // Build candidate positions: right-of and below each node
  const candidates = [];
  for (const b of boxes) {
    candidates.push({ x: b.x + b.w + _PLACEMENT_GAP, y: b.y });
    candidates.push({ x: b.x, y: b.y + b.h + _PLACEMENT_GAP });
  }
  // Sort by distance from origin (prefer compact placement)
  candidates.sort((a, b) => a.x + a.y - (b.x + b.y));

  for (const c of candidates) {
    if (!overlaps(c.x, c.y)) return c;
  }

  // Fallback: cascade from default position
  const n = existingNodes.filter((nd) => nd.type === "customPanel").length;
  return { x: 750 + n * 30, y: 400 + n * 30 };
}

const nodeTypes = {
  chat: ChatNode,
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
    id: "projectBrowser",
    type: "projectBrowser",
    position: { x: 1100, y: 50 },
    style: { width: 320, height: 480 },
    data: { projects: [], activeProject: null, onSave: () => { }, onLoad: () => { }, onDelete: () => { } },
  },
];

export default function App() {
  const [nodes, setNodes, rawOnNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState([]);
  const { onNodesChange: onNodesChangeSnapped, guides } = useNodeSnapping(nodes, rawOnNodesChange, setNodes);
  const getSeq = useCallback(() => ++_undoSeq, []);
  const onLayoutCommitRef = useRef(null);
  const { onNodesChange, undo, redo, historyRef: layoutHistoryRef } =
    useNodeLayoutHistory(nodes, onNodesChangeSnapped, setNodes, getSeq, onLayoutCommitRef);

  // Scene state
  const [sceneJSON, setSceneJSON] = useState(null);
  const [uiConfig, setUiConfig] = useState({ controls: [], inspectable_buffers: [] });
  const dirtyRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const [duration, setDuration] = useState(30);
  const [loop, setLoop] = useState(true);
  const [offlineRecord, setOfflineRecord] = useState(false);
  const [recordFps, setRecordFps] = useState(30);

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

  const getDebugLogs = useCallback(() => chat.debugLogs, [chat.debugLogs]);

  // Refs for save getters (avoid re-creating callbacks on every state change)
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const messagesRef = useRef(chat.messages);
  messagesRef.current = chat.messages;

  const getMessages = useCallback(() => messagesRef.current, []);
  const getNodeLayouts = useCallback(() => {
    return nodesRef.current.map((n) => ({
      id: n.id,
      type: n.type,
      position: { ...n.position },
      style: n.style ? { ...n.style } : undefined,
    }));
  }, []);

  const getWorkspaceState = useCallback(() => {
    return {
      version: 1,
      keyframes: kf.getKeyframeTracks(),
      duration,
      loop,
      node_layouts: getNodeLayouts(),
    };
  }, [duration, loop, kf.getKeyframeTracks, getNodeLayouts]);

  // Pending node layouts to apply once after project load
  const pendingLayoutsRef = useRef(null);

  const project = useProjectManager(sendRef, captureThumbnail, getWorkspaceState, getDebugLogs, getMessages);

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
      project.markUnsaved();
    }
  }, [kf.keyframeVersion, project.markUnsaved]);

  const durationLoopMountedRef = useRef(false);
  useEffect(() => {
    if (!durationLoopMountedRef.current) {
      durationLoopMountedRef.current = true;
      return;
    }
    sendWsRef.current();
    project.markUnsaved();
  }, [duration, loop, project.markUnsaved]);

  // Save workspace state when node layout changes (drag/resize end)
  onLayoutCommitRef.current = () => {
    sendWorkspaceStateNow();
    project.markUnsaved();
  };

  // Buffer for thinking content from agent_status (fallback if agent_log misses it)
  const thinkingBufferRef = useRef("");
  const thinkingLogReceivedRef = useRef(false);

  // Handle incoming WebSocket messages (dispatcher)
  const handleMessage = useCallback((msg) => {
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case "init":
        // Reset mount guards so the kf/duration effects skip the restore-triggered fire
        kfMountedRef.current = false;
        durationLoopMountedRef.current = false;
        resetUniformHistoryRef.current();
        if (msg.scene_json) setSceneJSON(msg.scene_json);
        if (msg.ui_config) setUiConfig(msg.ui_config);
        if (msg.projects) project.setProjectList(msg.projects);
        if (msg.active_project) {
          project.setActiveProject(msg.active_project.display_name || msg.active_project.name);
        } else {
          project.setActiveProject(null);
        }
        if (msg.chat_history?.length) chat.restoreMessages(msg.chat_history);
        chat.setProcessing(!!msg.is_processing);
        if (msg.workspace_state) {
          kf.restoreKeyframes(msg.workspace_state.keyframes);
          if (typeof msg.workspace_state.duration === "number") setDuration(msg.workspace_state.duration);
          if (typeof msg.workspace_state.loop === "boolean") setLoop(msg.workspace_state.loop);
          if (msg.workspace_state.node_layouts) pendingLayoutsRef.current = msg.workspace_state.node_layouts;
        } else {
          kf.restoreKeyframes(null);
          setDuration(30);
          setLoop(true);
        }
        panels.restorePanels(msg.panels || {});
        if (msg.debug_logs) chat.setDebugLogs(msg.debug_logs);
        project.markSaved();
        break;

      case "assistant_text":
        chat.addAssistantText(msg.text);
        break;

      case "chat_done":
        // Fallback: if thinking content was buffered from agent_status but never
        // received via agent_log, flush it to debug logs now
        if (thinkingBufferRef.current && !thinkingLogReceivedRef.current) {
          chat.addLog({ agent: "Agent", message: thinkingBufferRef.current, level: "thinking" });
        }
        thinkingBufferRef.current = "";
        thinkingLogReceivedRef.current = false;
        chat.setProcessing(false);
        chat.setAgentStatus(null);
        chat.setPendingQuestion(null);
        setWorkspaceFilesVersion((v) => v + 1);
        dirtyRef.current = true;
        project.markUnsaved();
        break;

      case "agent_status":
        chat.setAgentStatus({ status: msg.status, detail: msg.detail });
        if (msg.status === "thinking" && msg.detail) {
          thinkingBufferRef.current = msg.detail;
        }
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
        // Mark that full thinking was received via agent_log (clear fallback buffer)
        if (msg.level === "thinking" && msg.message !== "[Thinking started]" && !msg.message.startsWith("Tool:")) {
          thinkingBufferRef.current = "";
          thinkingLogReceivedRef.current = true;
        }
        break;

      case "message_injected":
        chat.addLog({ agent: "System", message: "Message queued for agent", level: "info" });
        break;

      case "agent_question":
        chat.setPendingQuestion({ question: msg.question, options: msg.options || [] });
        break;

      case "project_list":
        project.setProjectList(msg.projects || []);
        break;

      case "project_saved":
        if (msg.meta) project.setActiveProject(msg.meta.display_name || msg.meta.name);
        dirtyRef.current = false;
        project.markSaved();
        break;

      case "project_loaded":
        // Reset mount guards so the kf/duration effects skip the restore-triggered fire
        kfMountedRef.current = false;
        durationLoopMountedRef.current = false;
        resetUniformHistoryRef.current();
        if (msg.meta) project.setActiveProject(msg.meta.display_name || msg.meta.name);
        if (msg.chat_history) chat.restoreMessages(msg.chat_history);
        if (msg.scene_json) setSceneJSON(msg.scene_json);
        if (msg.ui_config) setUiConfig(msg.ui_config);
        if (msg.workspace_state) {
          kf.restoreKeyframes(msg.workspace_state.keyframes);
          if (typeof msg.workspace_state.duration === "number") setDuration(msg.workspace_state.duration);
          if (typeof msg.workspace_state.loop === "boolean") setLoop(msg.workspace_state.loop);
          if (msg.workspace_state.node_layouts) pendingLayoutsRef.current = msg.workspace_state.node_layouts;
        } else {
          kf.restoreKeyframes(null);
          setDuration(30);
          setLoop(true);
        }
        panels.restorePanels(msg.panels || {});
        chat.setDebugLogs(msg.debug_logs || []);
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
        kfMountedRef.current = false;
        durationLoopMountedRef.current = false;
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

  // Capture uncaught JS errors and send to agent
  useEffect(() => {
    const seen = new Set();
    const forward = (message) => {
      if (!message || seen.has(message)) return;
      seen.add(message);
      setTimeout(() => seen.delete(message), 5000);
      sendRef.current?.({ type: "console_error", message });
    };
    const onError = (e) => forward(e.message || String(e.error || e));
    const onRejection = (e) => forward(e.reason?.message || String(e.reason || "Unhandled promise rejection"));
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

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
        } else {
          window.dispatchEvent(new CustomEvent("open-save-dialog"));
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
          h.past.push({ uniform, oldValue, newValue: value, seq: ++_undoSeq });
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
      msg.debug_logs = chat.debugLogs;
      msg.chat_history = chat.messages;
    }
    chat.clearAll();
    resetUniformHistory();
    setSceneJSON(null);
    setUiConfig({ controls: [], inspectable_buffers: [] });
    panels.restorePanels({});
    project.setActiveProject(null);
    kf.resetKeyframes();
    setDuration(30);
    setLoop(true);
    dirtyRef.current = false;
    project.markSaved();
    send(msg);
  }, [send, project.activeProject, project.saveStatus, captureThumbnail, getWorkspaceState, getNodeLayouts, chat.clearAll, chat.messages, resetUniformHistory, panels.restorePanels, kf.resetKeyframes, project.setActiveProject, project.markSaved]);

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
      startRecording({ offline: offlineRecord, fps: recordFps });
    }
  }, [recording, startRecording, stopRecording, offlineRecord]);

  const handleToggleOfflineRecord = useCallback(() => setOfflineRecord((v) => !v), []);

  const handleShaderError = useCallback((err) => {
    const message = err.message || String(err);
    chat.addLog({ agent: "WebGL", message, level: "error" });
    sendRef.current?.({ type: "console_error", message });
  }, [chat.addLog]);

  // Wrap panel close to capture node position + assign undo seq
  const handlePanelClose = useCallback((panelId) => {
    const node = nodesRef.current.find((n) => n.id === `panel_${panelId}`);
    panels.handleClosePanel(panelId, {
      seq: ++_undoSeq,
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
              onCancel: chat.handleCancel,
              pendingQuestion: chat.pendingQuestion,
              onAnswer: chat.handleAnswer,
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
              onImport: project.handleProjectImport,
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
                controls: panel.controls ? mergeControlDefaults(panel.controls) : undefined,
                onUniformChange: handleUniformChange,
                engineRef,
                onClose: () => handlePanelClose(panelId),
                keyframeManagerRef: kf.keyframeManagerRef,
                onKeyframesChange: kf.handlePanelKeyframesChange,
                onOpenKeyframeEditor: kf.handleOpenKeyframeEditor,
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
          const pw = panel.width || 320;
          const ph = panel.height || 300;
          const pos = findEmptyPosition(updated, pw, ph);
          updated = [
            ...updated,
            {
              id: nodeId,
              type: "customPanel",
              position: pos,
              style: { width: pw, height: ph },
              data: {
                title: panel.title,
                html: panel.html,
                controls: panel.controls ? mergeControlDefaults(panel.controls) : undefined,
                onUniformChange: handleUniformChange,
                engineRef,
                onClose: () => handlePanelClose(panelId),
                keyframeManagerRef: kf.keyframeManagerRef,
                onKeyframesChange: kf.handlePanelKeyframesChange,
                onOpenKeyframeEditor: kf.handleOpenKeyframeEditor,
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

      // Apply pending node layouts from project load (one-shot)
      if (pendingLayoutsRef.current) {
        const layoutMap = new Map(pendingLayoutsRef.current.map((l) => [l.id, l]));
        updated = updated.map((n) => {
          const saved = layoutMap.get(n.id);
          if (saved) {
            return { ...n, position: saved.position, style: saved.style || n.style };
          }
          return n;
        });
        pendingLayoutsRef.current = null;
      }

      // Restore position for undo'd panel close
      if (panels.pendingRestoreRef.current) {
        const r = panels.pendingRestoreRef.current;
        updated = updated.map((n) =>
          n.id === r.id ? { ...n, position: r.position || n.position, style: r.style || n.style } : n
        );
        panels.pendingRestoreRef.current = null;
      }

      return updated;
    });
  }, [
    chat.messages, chat.handleSend, chat.isProcessing, chat.agentStatus, chat.handleNewChat, chat.handleCancel,
    chat.pendingQuestion, chat.handleAnswer, chat.debugLogs,
    sceneJSON, paused, uiConfig, handleUniformChange,
    project.projectList, project.activeProject, project.handleProjectSave, project.handleProjectLoad, project.handleProjectDelete,
    handleDeleteWorkspaceFile, workspaceFilesVersion, handleShaderError,
    panels.customPanels, handlePanelClose, mergeControlDefaults,
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
          onPause={() => { setPaused(true); if (recording) stopRecording(); }}
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
          recordFps={recordFps}
          onRecordFpsChange={setRecordFps}
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
          onNodeDragStop={() => {
            // Use rAF so React has committed position updates before we read them
            requestAnimationFrame(() => {
              sendWorkspaceStateNow();
              project.markUnsaved();
            });
          }}
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
