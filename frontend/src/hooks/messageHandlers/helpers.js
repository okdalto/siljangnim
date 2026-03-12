/**
 * Apply saved UI state (viewport zoom/pan, paused, backendTarget, collapsed states, fixedResolution).
 */
export function applyUiState(uiState, { setPaused, setBackendTarget, rfInstanceRef, nodeUiStateRef, setNodes }) {
  if (!uiState) return;
  if (typeof uiState.paused === "boolean") setPaused(uiState.paused);
  if (uiState.backendTarget) setBackendTarget?.(uiState.backendTarget);
  if (nodeUiStateRef?.current) {
    if (uiState.collapsed && typeof uiState.collapsed === "object") {
      nodeUiStateRef.current.collapsed = { ...uiState.collapsed };
    }
    nodeUiStateRef.current.viewportFixedResolution = uiState.viewportFixedResolution ?? null;
  }
  // Push restored UI state directly into node data so hooks can pick it up
  if (setNodes) {
    const fixedRes = uiState.viewportFixedResolution ?? null;
    const collapsed = uiState.collapsed || {};
    setNodes((nds) => nds.map((n) => {
      if (n.id === "viewport") {
        return { ...n, data: { ...n.data, initialFixedResolution: fixedRes, initialCollapsed: collapsed.viewport } };
      }
      if (n.id === "chat") {
        return { ...n, data: { ...n.data, initialCollapsed: collapsed.chat } };
      }
      if (n.id === "debugLog") {
        return { ...n, data: { ...n.data, initialCollapsed: collapsed.debugLog } };
      }
      return n;
    }));
  }
  if (uiState.viewport && rfInstanceRef?.current) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      try {
        rfInstanceRef.current?.setViewport(uiState.viewport, { duration: 0 });
      } catch { /* ignore if RF not ready */ }
    }));
  }
}

/**
 * Common workspace state restoration logic shared by "init" and "project_loaded" handlers.
 */
export function restoreWorkspaceState(msg, deps) {
  const {
    chat, panels, kf, assetNodes,
    setSceneJSON, setUiConfig, setDuration, setLoop, setFps,
    pendingLayoutsRef, setNodes,
    resetUniformHistoryRef, initSettledRef,
    wsStateTimerRef, kfMountedRef, durationLoopMountedRef,
    settingsRef, setPaused,
    setBackendTarget, rfInstanceRef, nodeUiStateRef,
  } = deps;

  initSettledRef.current = false;
  if (wsStateTimerRef.current) { clearTimeout(wsStateTimerRef.current); wsStateTimerRef.current = null; }
  kfMountedRef.current = false;
  durationLoopMountedRef.current = false;
  resetUniformHistoryRef.current();

  if (msg.scene_json) setSceneJSON(msg.scene_json);
  if (msg.ui_config) setUiConfig(msg.ui_config);

  if (msg.chat_history?.length) {
    chat.restoreMessages(msg.chat_history);
  } else if (msg.chat_history) {
    chat.restoreMessages(msg.chat_history);
  }

  if (msg.workspace_state) {
    kf.restoreKeyframes(msg.workspace_state.keyframes);
    if (typeof msg.workspace_state.duration === "number") setDuration(msg.workspace_state.duration);
    if (typeof msg.workspace_state.loop === "boolean") setLoop(msg.workspace_state.loop);
    if (typeof msg.workspace_state.fps === "number") setFps(msg.workspace_state.fps);
    if (msg.workspace_state.node_layouts) {
      pendingLayoutsRef.current = msg.workspace_state.node_layouts;
      const layoutMap = new Map(msg.workspace_state.node_layouts.map((l) => [l.id, l]));
      setNodes((nds) => nds.map((n) => {
        const saved = layoutMap.get(n.id);
        return saved ? { ...n, position: saved.position, style: saved.style || n.style } : n;
      }));
    }
  } else {
    kf.restoreKeyframes(null);
    setDuration(settingsRef?.current?.defaultDuration ?? 30);
    setLoop(settingsRef?.current?.defaultLoop ?? true);
  }

  panels.restorePanels(msg.panels || {});
  chat.setDebugLogs(msg.debug_logs || []);
  assetNodes.restore(msg.workspace_state?.assets || {});
  applyUiState(msg.workspace_state?.ui_state, { setPaused, setBackendTarget, rfInstanceRef, nodeUiStateRef, setNodes });

  requestAnimationFrame(() => requestAnimationFrame(() => { initSettledRef.current = true; }));
}

/**
 * Unpack buffer proxy refs from deps for convenience.
 */
export function unpackBufferRefs(deps) {
  const { buffersRef, gettersRef } = deps;
  return {
    thinkingBufferRef: { get current() { return buffersRef.current.thinkingBuffer; }, set current(v) { buffersRef.current.thinkingBuffer = v; } },
    thinkingLogReceivedRef: { get current() { return buffersRef.current.thinkingLogReceived; }, set current(v) { buffersRef.current.thinkingLogReceived = v; } },
    getSceneJSONRef: { current: gettersRef.current.getSceneJSON },
    getUiConfigRef: { current: gettersRef.current.getUiConfig },
    getWorkspaceStateRef: { current: gettersRef.current.getWorkspaceState },
    getPanelsRef: { current: gettersRef.current.getPanels },
    getMessagesRef: { current: gettersRef.current.getMessages },
    getDebugLogsRef: { current: gettersRef.current.getDebugLogs },
    getActiveProjectNameRef: { current: gettersRef.current.getActiveProjectName },
  };
}
