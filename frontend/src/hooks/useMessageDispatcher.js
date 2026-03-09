import { useCallback, useRef } from "react";
import { updateNodeMetadata, generateProjectName } from "../engine/projectTree.js";
import * as storage from "../engine/storage.js";

/**
 * Apply saved UI state (viewport zoom/pan, paused, backendTarget, collapsed states, fixedResolution).
 */
function _applyUiState(uiState, { setPaused, setBackendTarget, rfInstanceRef, nodeUiStateRef }) {
  if (!uiState) return;

  // Restore paused
  if (typeof uiState.paused === "boolean") setPaused(uiState.paused);

  // Restore backendTarget
  if (uiState.backendTarget) setBackendTarget?.(uiState.backendTarget);

  // Restore collapsed states and fixedResolution into the ref
  // (nodes will pick these up on next data sync cycle)
  if (nodeUiStateRef?.current) {
    if (uiState.collapsed && typeof uiState.collapsed === "object") {
      nodeUiStateRef.current.collapsed = { ...uiState.collapsed };
    }
    nodeUiStateRef.current.viewportFixedResolution = uiState.viewportFixedResolution ?? null;
  }

  // Restore React Flow viewport (zoom/pan) — deferred to after layout settles
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
function _restoreWorkspaceState(msg, deps) {
  const {
    chat, panels, kf, assetNodes,
    setSceneJSON, setUiConfig, setDuration, setLoop,
    pendingLayoutsRef, setNodes,
    resetUniformHistoryRef, initSettledRef,
    wsStateTimerRef, kfMountedRef, durationLoopMountedRef,
    settingsRef, setPaused,
    setBackendTarget, rfInstanceRef, nodeUiStateRef,
  } = deps;

  // Suppress layout saves until settled
  initSettledRef.current = false;
  // Cancel any pending debounced workspace state save
  if (wsStateTimerRef.current) { clearTimeout(wsStateTimerRef.current); wsStateTimerRef.current = null; }
  // Reset mount guards so the kf/duration effects skip the restore-triggered fire
  kfMountedRef.current = false;
  durationLoopMountedRef.current = false;
  resetUniformHistoryRef.current();

  if (msg.scene_json) setSceneJSON(msg.scene_json);
  if (msg.ui_config) setUiConfig(msg.ui_config);

  // Restore chat history
  if (msg.chat_history?.length) {
    chat.restoreMessages(msg.chat_history);
  } else if (msg.chat_history) {
    chat.restoreMessages(msg.chat_history);
  }

  // Restore workspace state (keyframes, duration, loop, layouts)
  if (msg.workspace_state) {
    kf.restoreKeyframes(msg.workspace_state.keyframes);
    if (typeof msg.workspace_state.duration === "number") setDuration(msg.workspace_state.duration);
    if (typeof msg.workspace_state.loop === "boolean") setLoop(msg.workspace_state.loop);
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
  _applyUiState(msg.workspace_state?.ui_state, { setPaused, setBackendTarget, rfInstanceRef, nodeUiStateRef });

  // Allow layout saves after React Flow has fully reconciled (double-rAF)
  requestAnimationFrame(() => requestAnimationFrame(() => { initSettledRef.current = true; }));
}

/**
 * @param {Object} params - All dependencies for message handling (chat, apiKey, project, panels, kf, state setters, refs)
 * @returns {(msg: {type: string, [key: string]: any}) => void} handleMessage callback
 */
export default function useMessageDispatcher(params) {
  const deps = useRef(params);
  deps.current = params;

  const handleMessage = useCallback((msg) => {
    const {
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
      // UI state persistence
      setBackendTarget, rfInstanceRef, nodeUiStateRef,
    } = deps.current;
    // Destructure grouped refs
    const thinkingBufferRef = { get current() { return buffersRef.current.thinkingBuffer; }, set current(v) { buffersRef.current.thinkingBuffer = v; } };
    const thinkingLogReceivedRef = { get current() { return buffersRef.current.thinkingLogReceived; }, set current(v) { buffersRef.current.thinkingLogReceived = v; } };
    const getSceneJSONRef = { current: gettersRef.current.getSceneJSON };
    const getUiConfigRef = { current: gettersRef.current.getUiConfig };
    const getWorkspaceStateRef = { current: gettersRef.current.getWorkspaceState };
    const getPanelsRef = { current: gettersRef.current.getPanels };
    const getMessagesRef = { current: gettersRef.current.getMessages };
    const getDebugLogsRef = { current: gettersRef.current.getDebugLogs };
    const getActiveProjectNameRef = { current: gettersRef.current.getActiveProjectName };
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case "init":
        // Init-specific: API config, projects, active project, processing state
        if (msg.api_config) apiKey.setSavedConfig(msg.api_config);
        if (msg.projects) project.setProjectList(msg.projects);
        if (msg.active_project) {
          project.setActiveProject(msg.active_project.display_name || msg.active_project.name);
          setProjectManifest?.(msg.active_project);
        } else {
          project.setActiveProject(null);
          setProjectManifest?.(null);
        }
        chat.setProcessing(!!msg.is_processing);
        // Common restoration
        _restoreWorkspaceState(msg, deps.current);
        break;

      case "assistant_text":
        chat.addAssistantText(msg.text);
        autoSave?.triggerAutoSave?.();
        break;

      case "chat_done": {
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

        // Auto-create project if currently untitled
        const activeProj = project.activeProject;
        const activeName = storage.getActiveProjectName();
        const isNewProject = !activeProj || activeName === "_untitled";
        if (isNewProject) {
          const history = getMessagesRef?.current?.() || [];
          // Temporary name from user message (shown immediately)
          let autoName = "Untitled Project";
          for (let i = history.length - 1; i >= 0; i--) {
            if (history[i]?.role === "user") {
              const txt = (history[i].text || history[i].content || "").trim();
              if (txt) {
                autoName = txt.replace(/^#+\s*/gm, "").split("\n")[0].trim().slice(0, 60) || autoName;
              }
              break;
            }
          }
          (async () => {
            try {
              const manifest = await storage.autoCreateProject(autoName, history);
              project.setActiveProject(manifest.display_name);
              setProjectManifest?.(manifest);
              const projects = await storage.listProjects();
              project.setProjectList(projects);
              autoSave?.triggerAutoSave?.();

              // Background: generate AI project name and rename
              generateProjectName(history).then(async (aiName) => {
                if (!aiName) return;
                try {
                  const updated = await storage.renameProject(manifest.display_name, aiName);
                  project.setActiveProject(updated.display_name);
                  setProjectManifest?.(updated);
                  const refreshed = await storage.listProjects();
                  project.setProjectList(refreshed);
                  // Also update the first tree node title with the project name
                  const pt = projectTreeRef?.current;
                  const activeNodeId = pt?.activeNodeId;
                  if (activeNodeId) {
                    try {
                      const { renameNode } = await import("../engine/projectTree.js");
                      await renameNode(activeNodeId, aiName);
                      pt.loadTree?.(updated.display_name);
                    } catch {}
                  }
                } catch (e) {
                  console.warn("[chat_done] AI rename failed:", e);
                }
              }).catch(() => {});
            } catch (e) {
              console.warn("[chat_done] auto-create project failed:", e);
            }
          })();
        } else {
          // Trigger auto-save for existing project
          autoSave?.triggerAutoSave?.();
        }

        // Create tree node after prompt completes
        const pt = projectTreeRef?.current;
        const projName = getActiveProjectNameRef?.current?.();
        if (pt && projName) {
          const currentState = {
            scene_json: getSceneJSONRef?.current?.() || {},
            ui_config: getUiConfigRef?.current?.() || {},
            workspace_state: getWorkspaceStateRef?.current?.() || {},
            panels: getPanelsRef?.current?.() || {},
            chat_history: getMessagesRef?.current?.() || [],
            debug_logs: getDebugLogsRef?.current?.() || [],
          };
          // Use user prompt as temporary title (AI will generate a better one async)
          const history = currentState.chat_history;
          let userPrompt = null;
          for (let i = history.length - 1; i >= 0; i--) {
            if (history[i]?.role === "user") {
              userPrompt = (history[i].text || history[i].content || "").trim();
              break;
            }
          }
          const lastMsg = history[history.length - 1];
          const promptLine = (userPrompt || "Prompt result").split("\n")[0].trim();
          const title = promptLine.slice(0, 60) + (promptLine.length > 60 ? "…" : "");

          const reloadTree = () => pt.loadTree?.(projName);
          // For new projects, skip separate AI title generation — project name will be used
          const skipAITitle = isNewProject;
          if (overwriteModeRef?.current && pt.overwriteCurrentNode) {
            pt.overwriteCurrentNode(projName, currentState, {
              title,
              prompt: lastMsg?.text || lastMsg?.content || null,
            }).then((node) => {
              if (node) updateNodeMetadata(node.id, currentState, { generateTitle: !skipAITitle, onTitleUpdated: reloadTree }).catch(() => {});
            }).catch(() => { /* non-critical */ });
          } else {
            pt.createNodeAfterPrompt(projName, currentState, {
              title,
              type: "prompt_node",
              prompt: lastMsg?.text || lastMsg?.content || null,
            }).then((node) => {
              if (node) updateNodeMetadata(node.id, currentState, { generateTitle: !skipAITitle, onTitleUpdated: reloadTree }).catch(() => {});
            }).catch(() => { /* non-critical */ });
          }
        }
        break;
      }

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
        autoSave?.triggerAutoSave?.();
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
        break;

      case "project_loaded":
        // Project-loaded-specific: meta, dirty flag, workspace version
        if (msg.meta) {
          project.setActiveProject(msg.meta.display_name || msg.meta.name);
          setProjectManifest?.(msg.meta);
        }
        // Common restoration
        _restoreWorkspaceState(msg, deps.current);
        setWorkspaceFilesVersion((v) => v + 1);
        dirtyRef.current = false;
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

      case "files_uploaded":
        if (msg.files?.length) {
          assetNodes.createAssetsFromUpload(msg.files);
          // Create asset_node in project tree for tracking
          const ptAsset = projectTreeRef?.current;
          const assetProjName = getActiveProjectNameRef?.current?.();
          if (ptAsset && assetProjName && ptAsset.createNodeAfterPrompt) {
            const assetState = {
              scene_json: getSceneJSONRef?.current?.() || {},
              ui_config: getUiConfigRef?.current?.() || {},
              workspace_state: getWorkspaceStateRef?.current?.() || {},
              panels: getPanelsRef?.current?.() || {},
              chat_history: getMessagesRef?.current?.() || [],
              debug_logs: getDebugLogsRef?.current?.() || [],
            };
            const fileNames = msg.files.map(f => f.name).join(", ");
            ptAsset.createNodeAfterPrompt(assetProjName, assetState, {
              title: `Upload: ${fileNames.slice(0, 50)}`,
              type: "asset_node",
            }).catch(() => { /* non-critical */ });
          }
        }
        break;

      case "asset_deleted_by_agent": {
        // Agent deleted an asset via tool — remove from UI
        const delFilename = msg.filename;
        if (delFilename && assetNodes.findByFilename) {
          const desc = assetNodes.findByFilename(delFilename);
          if (desc) assetNodes.deleteAsset(desc.id);
        }
        // Add system message to chat
        chat.addSystemMessage?.(`[Asset deleted by agent: ${delFilename}]`);
        break;
      }

      case "processing_status":
        assetNodes.handleProcessingStatus(msg.filename, msg.status);
        break;

      case "processing_complete":
        assetNodes.handleProcessingComplete(msg.filename, msg.processor, msg.outputs, msg.metadata);
        break;

      case "project_trusted":
        if (msg.meta) setProjectManifest?.(msg.meta);
        break;

      case "scene_updated":
        // Alias — same as scene_update but without dirty/autosave
        if (msg.scene_json) setSceneJSON(msg.scene_json);
        if (msg.ui_config) setUiConfig(msg.ui_config);
        break;

      case "debugger_repair": {
        // Create a repair node in the project tree after a successful auto-fix
        const ptRepair = projectTreeRef?.current;
        const repairProjName = getActiveProjectNameRef?.current?.();
        if (ptRepair && repairProjName && ptRepair.createNodeAfterPrompt) {
          const repairState = {
            scene_json: msg.fixedScene || getSceneJSONRef?.current?.() || {},
            ui_config: getUiConfigRef?.current?.() || {},
            workspace_state: getWorkspaceStateRef?.current?.() || {},
            panels: getPanelsRef?.current?.() || {},
            chat_history: getMessagesRef?.current?.() || [],
            debug_logs: getDebugLogsRef?.current?.() || [],
          };
          ptRepair.createNodeAfterPrompt(repairProjName, repairState, {
            title: msg.title || "Auto-fix",
            type: "agent_repair_node",
          }).catch(() => { /* non-critical */ });
        }
        break;
      }

      case "project_save_error":
      case "project_load_error":
      case "project_delete_error":
        chat.addErrorLog(msg.error);
        break;
    }
  }, []);

  return handleMessage;
}
