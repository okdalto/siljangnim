import { useCallback } from "react";

export default function useMessageDispatcher({
  chat, apiKey, project, panels, kf,
  setSceneJSON, setUiConfig, setDuration, setLoop,
  setWorkspaceFilesVersion, dirtyRef, setPaused,
  recorderFnsRef, pendingLayoutsRef, setNodes,
  resetUniformHistoryRef, initSettledRef,
  wsStateTimerRef, kfMountedRef, durationLoopMountedRef,
  thinkingBufferRef, thinkingLogReceivedRef,
  settingsRef,
}) {
  const handleMessage = useCallback((msg) => {
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case "init":
        // Suppress layout saves until init settles (prevent overwriting saved positions)
        initSettledRef.current = false;
        // Cancel any pending debounced workspace state save
        if (wsStateTimerRef.current) { clearTimeout(wsStateTimerRef.current); wsStateTimerRef.current = null; }
        // Reset mount guards so the kf/duration effects skip the restore-triggered fire
        kfMountedRef.current = false;
        durationLoopMountedRef.current = false;
        resetUniformHistoryRef.current();
        if (msg.api_config) apiKey.setSavedConfig(msg.api_config);
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
          if (msg.workspace_state.node_layouts) {
            pendingLayoutsRef.current = msg.workspace_state.node_layouts;
            // Direct application for core nodes — belt-and-suspenders alongside pendingLayoutsRef
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
        if (msg.debug_logs) chat.setDebugLogs(msg.debug_logs);
        project.markSaved();
        // Allow layout saves after React Flow has fully reconciled (double-rAF)
        requestAnimationFrame(() => requestAnimationFrame(() => { initSettledRef.current = true; }));
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
        if (msg.config) apiKey.setSavedConfig(msg.config);
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
        // Suppress layout saves until project load settles
        initSettledRef.current = false;
        // Cancel any pending debounced workspace state save
        if (wsStateTimerRef.current) { clearTimeout(wsStateTimerRef.current); wsStateTimerRef.current = null; }
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
          if (msg.workspace_state.node_layouts) {
            pendingLayoutsRef.current = msg.workspace_state.node_layouts;
            // Direct application for core nodes — belt-and-suspenders alongside pendingLayoutsRef
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
        setWorkspaceFilesVersion((v) => v + 1);
        dirtyRef.current = false;
        project.markSaved();
        // Allow layout saves after React Flow has fully reconciled (double-rAF)
        requestAnimationFrame(() => requestAnimationFrame(() => { initSettledRef.current = true; }));
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

  return handleMessage;
}
