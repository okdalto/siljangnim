import { useCallback } from "react";
import * as storageApi from "../engine/storage.js";
import { guessMimeType } from "../utils/mimeUtils.js";

/**
 * Handles asset upload and deletion, including notification to chat and agent engine.
 */
export default function useAssetHandlers({ assetNodes, chat, sendRef, BROWSER_ONLY, agentEngine, sceneJSON }) {
  const handleAssetUpload = useCallback(async (files) => {
    const saved = [];
    for (const file of files) {
      const buf = await file.arrayBuffer();
      const mime = file.type || guessMimeType(file.name);
      await storageApi.saveUpload(file.name, buf, mime);
      saved.push({ name: file.name, mimeType: mime, size: file.size });
    }
    if (saved.length > 0) {
      assetNodes.createAssetsFromUpload(saved);
      const names = saved.map((f) => f.name).join(", ");
      const notification = `[Asset uploaded: ${names}]`;
      chat.addSystemMessage(notification);
      // Record in agent engine chatHistory so the model knows about the asset
      if (BROWSER_ONLY && agentEngine) {
        agentEngine.chatHistory.push({ role: "user", text: notification });
      } else {
        sendRef.current?.({ type: "asset_notification", text: notification });
      }
    }
  }, [assetNodes.createAssetsFromUpload, chat.addSystemMessage, BROWSER_ONLY, agentEngine]);

  const handleAssetDelete = useCallback((assetId) => {
    const desc = assetNodes.assets.get(assetId);
    const name = desc?.filename || desc?.semanticName || assetId;
    // Warn if the asset might be referenced in the current scene
    const sceneStr = JSON.stringify(sceneJSON || {});
    const isReferenced = sceneStr.includes(name);
    if (isReferenced) {
      if (!window.confirm(`"${name}" is referenced in the current scene. Deleting it may cause errors. Continue?`)) {
        return;
      }
    }
    assetNodes.deleteAsset(assetId);
    const notification = `[Asset deleted: ${name}]`;
    chat.addSystemMessage(notification);
    if (BROWSER_ONLY && agentEngine) {
      agentEngine.chatHistory.push({ role: "user", text: notification });
    } else {
      sendRef.current?.({ type: "asset_notification", text: notification });
    }
  }, [assetNodes.assets, assetNodes.deleteAsset, chat.addSystemMessage, sceneJSON, BROWSER_ONLY, agentEngine]);

  return { handleAssetUpload, handleAssetDelete };
}
