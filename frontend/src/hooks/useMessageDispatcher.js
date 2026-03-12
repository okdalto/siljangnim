import { useCallback, useRef } from "react";
import { handleInit, handleProjectLoaded, handleWorkspaceStateUpdate } from "./messageHandlers/initHandlers.js";
import { handleAssistantText, handleAssistantTextDelta, handleAssistantTextFinalize, handleChatDone, handleAgentStatus, handleAgentLog, handleAgentQuestion, handleMessageInjected } from "./messageHandlers/chatHandlers.js";
import { handleSceneUpdate, handleViewportCleared, handleSetTimeline, handleSceneUpdated } from "./messageHandlers/sceneHandlers.js";
import { handleProjectList, handleProjectSaved, handleProjectTrusted, handleProjectError } from "./messageHandlers/projectHandlers.js";
import { handleOpenPanel, handleClosePanel } from "./messageHandlers/panelHandlers.js";
import { handleStartRecording, handleStopRecording, handleRunPreprocess } from "./messageHandlers/mediaHandlers.js";
import { handleFilesUploaded, handleAssetDeletedByAgent, handleProcessingStatus, handleProcessingComplete, handleDebuggerRepair } from "./messageHandlers/assetHandlers.js";
import { handleApiKeyRequired, handleApiKeyValid, handleApiKeyInvalid } from "./messageHandlers/apiKeyHandlers.js";

const HANDLERS = {
  init: handleInit,
  project_loaded: handleProjectLoaded,
  workspace_state_update: handleWorkspaceStateUpdate,
  assistant_text: handleAssistantText,
  assistant_text_delta: handleAssistantTextDelta,
  assistant_text_finalize: handleAssistantTextFinalize,
  chat_done: handleChatDone,
  agent_status: handleAgentStatus,
  agent_log: handleAgentLog,
  agent_question: handleAgentQuestion,
  message_injected: handleMessageInjected,
  scene_update: handleSceneUpdate,
  viewport_cleared: handleViewportCleared,
  set_timeline: handleSetTimeline,
  scene_updated: handleSceneUpdated,
  project_list: handleProjectList,
  project_saved: handleProjectSaved,
  project_trusted: handleProjectTrusted,
  project_save_error: handleProjectError,
  project_load_error: handleProjectError,
  project_delete_error: handleProjectError,
  open_panel: handleOpenPanel,
  close_panel: handleClosePanel,
  start_recording: handleStartRecording,
  stop_recording: handleStopRecording,
  run_preprocess: handleRunPreprocess,
  files_uploaded: handleFilesUploaded,
  asset_deleted_by_agent: handleAssetDeletedByAgent,
  processing_status: handleProcessingStatus,
  processing_complete: handleProcessingComplete,
  debugger_repair: handleDebuggerRepair,
  api_key_required: handleApiKeyRequired,
  api_key_valid: handleApiKeyValid,
  api_key_invalid: handleApiKeyInvalid,
};

/**
 * @param {Object} params - All dependencies for message handling
 * @returns {(msg: {type: string, [key: string]: any}) => void} handleMessage callback
 */
export default function useMessageDispatcher(params) {
  const deps = useRef(params);
  deps.current = params;

  const handleMessage = useCallback((msg) => {
    if (!msg || !msg.type) return;
    const handler = HANDLERS[msg.type];
    if (handler) handler(msg, deps.current);
  }, []);

  return handleMessage;
}
