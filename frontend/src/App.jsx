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
import useSettings from "./hooks/useSettings.js";
import useUniformHistory from "./hooks/useUniformHistory.js";
import useMessageDispatcher from "./hooks/useMessageDispatcher.js";
import useNodeDataSync from "./hooks/useNodeDataSync.js";
import EngineContext from "./contexts/EngineContext.js";
import SettingsContext from "./contexts/SettingsContext.js";
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
  const settingsCtx = useSettings();
  const { settings } = settingsCtx;

  const [nodes, setNodes, rawOnNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState([]);
  const { onNodesChange: onNodesChangeSnapped, guides } = useNodeSnapping(nodes, rawOnNodesChange, setNodes, settings);
  const getSeq = useCallback(() => ++_undoSeq, []);
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

  // Workspace files version counter
  const [workspaceFilesVersion, setWorkspaceFilesVersion] = useState(0);

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

  // F key → fit view to selected nodes (or all)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code !== "KeyF") return;
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target.isContentEditable) return;
      e.preventDefault();
      const rf = rfInstanceRef.current;
      if (!rf) return;
      const selected = nodesRef.current.filter((n) => n.selected);
      rf.fitView({
        nodes: selected.length > 0 ? selected.map((n) => ({ id: n.id })) : undefined,
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
    if (!initSettledRef.current) return; // suppress during init/project load
    sendWorkspaceStateNow();
    project.markUnsaved();
  };

  // Buffer for thinking content from agent_status (fallback if agent_log misses it)
  const thinkingBufferRef = useRef("");
  const thinkingLogReceivedRef = useRef(false);

  // Settings ref for message dispatcher (avoids stale closure in [] deps callback)
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Handle incoming WebSocket messages (extracted hook)
  const handleMessage = useMessageDispatcher({
    chat, apiKey, project, panels, kf,
    setSceneJSON, setUiConfig, setDuration, setLoop,
    setWorkspaceFilesVersion, dirtyRef, setPaused,
    recorderFnsRef, pendingLayoutsRef, setNodes,
    resetUniformHistoryRef, initSettledRef,
    wsStateTimerRef, kfMountedRef, durationLoopMountedRef,
    thinkingBufferRef, thinkingLogReceivedRef,
    settingsRef,
  });

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
    setDuration(settings.defaultDuration);
    setLoop(settings.defaultLoop);
    dirtyRef.current = false;
    project.markSaved();
    send(msg);
  }, [send, project.activeProject, project.saveStatus, captureThumbnail, getWorkspaceState, getNodeLayouts, chat.clearAll, chat.messages, resetUniformHistory, panels.restorePanels, kf.resetKeyframes, project.setActiveProject, project.markSaved, settings.defaultDuration, settings.defaultLoop]);

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

  const handleStartRecord = useCallback((settings) => {
    if (!settings.offline) setPaused(false);
    startRecording(settings);
  }, [startRecording]);

  const handleShaderError = useCallback((err) => {
    const message = err.message || String(err);
    chat.addLog({ agent: "WebGL", message, level: "error" });
    sendRef.current?.({ type: "console_error", message });
  }, [chat.addLog]);

  // --- Node selection (two-part system) ---
  // Part 1: Track multi-select modifier on pointerdown (capture phase = fires first)
  const multiKeyRef = useRef(false);
  useEffect(() => {
    const track = (e) => { multiKeyRef.current = e.shiftKey || e.metaKey || e.ctrlKey; };
    window.addEventListener('pointerdown', track, true);
    return () => window.removeEventListener('pointerdown', track, true);
  }, []);

  // Part 2: pointerdown — immediate selection + rAF fallback.
  // pointerdown fires before ReactFlow's mousedown/click, so ReactFlow may
  // override our selection.  The guard (Part 3) blocks Shift-deselects, and
  // the rAF fallback re-checks after all handlers to catch remaining misses.
  useEffect(() => {
    const handlePointerDown = (e) => {
      if (!e.target.closest('.react-flow')) return;
      const nodeEl = e.target.closest('.react-flow__node');
      if (!nodeEl) return;
      const nodeId = nodeEl.getAttribute('data-id');
      if (!nodeId) return;
      const isMulti = e.shiftKey || e.metaKey || e.ctrlKey;
      const prevSelected = new Set(
        nodesRef.current.filter((n) => n.selected).map((n) => n.id)
      );
      const applySelection = () => {
        setNodes((nds) =>
          nds.map((n) => {
            if (n.id === nodeId) return { ...n, selected: true };
            if (isMulti) return { ...n, selected: prevSelected.has(n.id) };
            return { ...n, selected: false };
          })
        );
      };
      applySelection();
      // Fallback: re-check after ReactFlow's handlers have all run
      requestAnimationFrame(() => {
        const node = nodesRef.current.find((n) => n.id === nodeId);
        if (!node?.selected) applySelection();
      });
    };
    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [setNodes]);

  // Part 3: Intercept onNodesChange — when a multi-select key is held,
  // block ReactFlow's deselect changes so previously selected nodes stay.
  const onNodesChangeGuarded = useCallback((changes) => {
    if (multiKeyRef.current) {
      changes = changes.filter((c) => !(c.type === 'select' && c.selected === false));
    }
    onNodesChange(changes);
  }, [onNodesChange]);

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

  // Sync data into nodes (extracted hook)
  useNodeDataSync({
    setNodes, chat, sceneJSON, paused, uiConfig,
    handleUniformChange, project, handleDeleteWorkspaceFile,
    workspaceFilesVersion, handleShaderError,
    panels, handlePanelClose, mergeControlDefaults,
    kf, duration, loop, engineRef, pendingLayoutsRef,
    setDuration, setLoop,
  });

  return (
    <SettingsContext.Provider value={settingsCtx}>
    <EngineContext.Provider value={engineRef}>
      <div className="w-screen h-screen pt-10 pb-10">
        <Toolbar
          onNewProject={handleNewProject}
          activeProject={project.activeProject}
          connected={connected}
          saveStatus={project.saveStatus}
          onChangeApiKey={() => apiKey.setRequired()}
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
          onNodesChange={onNodesChangeGuarded}
          onEdgesChange={onEdgesChange}
          onInit={(instance) => { rfInstanceRef.current = instance; }}
          onNodeDragStop={() => {
            if (!initSettledRef.current) return; // suppress during init/project load
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
          <Background color="var(--grid-color)" gap={settings.gridGap} size={settings.gridDotSize} style={{ backgroundColor: settings.canvasBg }} />
          <Controls />
        </ReactFlow>

      </div>
    </EngineContext.Provider>
    </SettingsContext.Provider>
  );
}
