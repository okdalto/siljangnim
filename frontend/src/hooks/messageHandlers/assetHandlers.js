import { unpackBufferRefs } from "./helpers.js";

export function handleFilesUploaded(msg, deps) {
  const { assetNodes, projectTreeRef } = deps;
  const { getSceneJSONRef, getUiConfigRef, getWorkspaceStateRef, getPanelsRef, getMessagesRef, getDebugLogsRef, getActiveProjectNameRef } = unpackBufferRefs(deps);
  if (msg.files?.length) {
    assetNodes.createAssetsFromUpload(msg.files);
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
      }).catch((e) => { console.warn("[files_uploaded] tree node creation failed:", e); });
    }
  }
}

export function handleAssetDeletedByAgent(msg, deps) {
  const { assetNodes, chat } = deps;
  const delFilename = msg.filename;
  if (delFilename && assetNodes.findByFilename) {
    const desc = assetNodes.findByFilename(delFilename);
    if (desc) assetNodes.deleteAsset(desc.id);
  }
  chat.addSystemMessage?.(`[Asset deleted by agent: ${delFilename}]`);
}

export function handleProcessingStatus(msg, deps) {
  deps.assetNodes.handleProcessingStatus(msg.filename, msg.status);
}

export function handleProcessingComplete(msg, deps) {
  deps.assetNodes.handleProcessingComplete(msg.filename, msg.processor, msg.outputs, msg.metadata);
}

export function handleDebuggerRepair(msg, deps) {
  const { projectTreeRef } = deps;
  const { getSceneJSONRef, getUiConfigRef, getWorkspaceStateRef, getPanelsRef, getMessagesRef, getDebugLogsRef, getActiveProjectNameRef } = unpackBufferRefs(deps);
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
    }).catch((e) => { console.warn("[debugger_repair] tree node creation failed:", e); });
  }
}
