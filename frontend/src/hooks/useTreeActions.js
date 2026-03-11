import { useCallback, useRef } from "react";
import * as storageApi from "../engine/storage.js";
import { showToast } from "./useToast.js";

/**
 * Extracts tree-related callbacks from App.jsx.
 */
export default function useTreeActions({ tree, compare, handleMessage, project, chat, agentEngine, getState }) {
  // Concurrency guard: prevent overlapping node switches
  const switchingRef = useRef(false);

  const handleTreeNodeRestore = useCallback(async (nodeId) => {
    if (agentEngine?.abortController) {
      showToast("에이전트가 실행 중입니다. 완료 후 노드를 전환해 주세요.", "warn");
      return;
    }
    if (switchingRef.current) return;

    const projName = storageApi.getActiveProjectName();
    if (!projName) return;

    switchingRef.current = true;
    try {
      // Auto-save current node state before switching.
      // This preserves any changes made since the last chat_done
      // (panel movements, uniform changes, new panels, etc.)
      const currentNodeId = tree.activeNodeId;
      if (currentNodeId && currentNodeId !== nodeId && tree.overwriteCurrentNode && getState) {
        try {
          await tree.overwriteCurrentNode(projName, getState());
        } catch { /* non-critical: save failure shouldn't block switch */ }
      }

      const state = await tree.restoreNode(nodeId, projName);
      handleMessage({
        type: "project_loaded",
        nodeId,
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
    } finally {
      switchingRef.current = false;
    }
  }, [tree.restoreNode, tree.activeNodeId, tree.overwriteCurrentNode, handleMessage, project.activeProject, chat.addLog, agentEngine, getState]);

  const handleContinueFromNode = useCallback(async (nodeId) => {
    await handleTreeNodeRestore(nodeId);
  }, [handleTreeNodeRestore]);

  const handleBranchFromChat = useCallback((nodeId) => {
    tree.setActiveNodeId(nodeId);
    tree.setSidebarOpen(true);
  }, [tree.setActiveNodeId, tree.setSidebarOpen]);

  const handleSwitchToNodeFromChat = useCallback(async (nodeId) => {
    await handleTreeNodeRestore(nodeId);
  }, [handleTreeNodeRestore]);

  const handleTreeBranch = useCallback(async (nodeId, title) => {
    const projName = storageApi.getActiveProjectName();
    if (!projName) return;
    await tree.branchFromNode(nodeId, projName, title);
  }, [tree.branchFromNode]);

  const handleTreeRename = useCallback(async (nodeId, newTitle) => {
    const projName = storageApi.getActiveProjectName();
    if (!projName) return;
    await tree.renameNode(nodeId, newTitle, projName);
  }, [tree.renameNode]);

  const handleTreeToggleFavorite = useCallback(async (nodeId) => {
    const projName = storageApi.getActiveProjectName();
    if (!projName) return;
    await tree.toggleFavorite(nodeId, projName);
  }, [tree.toggleFavorite]);

  const handleTreePinCheckpoint = useCallback(async (nodeId) => {
    const projName = storageApi.getActiveProjectName();
    if (!projName) return;
    await tree.pinCheckpoint(nodeId, projName);
  }, [tree.pinCheckpoint]);

  const handleTreeDuplicate = useCallback(async (nodeId) => {
    const projName = storageApi.getActiveProjectName();
    if (!projName) return;
    await tree.pinCheckpoint(nodeId, projName);
  }, [tree.pinCheckpoint]);

  const handleStartCompare = useCallback((nodeId) => {
    compare.startCompare(nodeId);
  }, [compare.startCompare]);

  const handleSelectCompareTarget = useCallback((nodeId) => {
    const projName = storageApi.getActiveProjectName();
    if (!projName) return;
    compare.selectCompareTarget(nodeId, projName);
  }, [compare.selectCompareTarget]);

  const handleTreeDeleteNode = useCallback(async (nodeId) => {
    if (agentEngine?.abortController) {
      showToast("에이전트가 실행 중입니다. 완료 후 삭제해 주세요.", "warn");
      return;
    }
    const projName = storageApi.getActiveProjectName();
    if (!projName) return;

    // Auto-save current state before deletion (same as switch)
    const currentNodeId = tree.activeNodeId;
    const deletingActive = currentNodeId === nodeId;
    if (deletingActive && getState && tree.overwriteCurrentNode) {
      // Don't save the node being deleted — save is only useful if we're
      // deleting a different node. When deleting the active node, we'll
      // restore the parent's state afterwards.
    }

    const { navigatedTo } = await tree.deleteNodeTree(nodeId, projName);

    // If the active node was deleted, restore the new active node's state
    // so the UI matches the node we navigated to (parent or fallback).
    if (deletingActive && navigatedTo) {
      try {
        const state = await tree.restoreNode(navigatedTo, projName);
        handleMessage({
          type: "project_loaded",
          nodeId: navigatedTo,
          meta: { name: projName, display_name: project.activeProject },
          scene_json: state.scene_json,
          ui_config: state.ui_config,
          workspace_state: state.workspace_state,
          panels: state.panels,
          chat_history: state.chat_history,
          debug_logs: state.debug_logs,
        });
      } catch {
        // If restoration fails, at least clear panels so UI isn't stale
        handleMessage({
          type: "project_loaded",
          nodeId: navigatedTo,
          meta: { name: projName, display_name: project.activeProject },
          scene_json: {},
          ui_config: {},
          workspace_state: {},
          panels: {},
          chat_history: [],
          debug_logs: [],
        });
      }
    }
  }, [tree.deleteNodeTree, tree.activeNodeId, tree.restoreNode, tree.overwriteCurrentNode, handleMessage, project.activeProject, agentEngine, getState]);

  return {
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
  };
}
