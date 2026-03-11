import { useCallback } from "react";
import * as storageApi from "../engine/storage.js";

/**
 * Extracts tree-related callbacks from App.jsx.
 */
export default function useTreeActions({ tree, compare, handleMessage, project, chat, agentEngine }) {
  const handleTreeNodeRestore = useCallback(async (nodeId) => {
    if (agentEngine?.abortController) {
      chat.addLog({ agent: "System", message: "에이전트가 실행 중입니다. 완료 후 노드를 전환해 주세요.", level: "warn" });
      return;
    }
    const projName = storageApi.getActiveProjectName();
    if (!projName) return;
    try {
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
    }
  }, [tree.restoreNode, handleMessage, project.activeProject, chat.addLog, agentEngine]);

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
      chat.addLog({ agent: "System", message: "에이전트가 실행 중입니다. 완료 후 삭제해 주세요.", level: "warn" });
      return;
    }
    const projName = storageApi.getActiveProjectName();
    if (!projName) return;
    await tree.deleteNodeTree(nodeId, projName);
  }, [tree.deleteNodeTree, agentEngine, chat.addLog]);

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
