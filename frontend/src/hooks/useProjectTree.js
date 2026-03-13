import { useCallback, useRef, useState } from "react";
import * as storage from "../engine/storage.js";
import * as projectTree from "../engine/projectTree.js";

/**
 * React hook for managing the project version tree.
 *
 * Provides: treeNodes, activeNodeId, sidebar visibility,
 * node creation, restoration, branching, and deletion.
 */
const ACTIVE_NODE_KEY = "siljangnim:activeNodeId";

export default function useProjectTree(sendRef, captureThumbnail, getWorkspaceState, getDebugLogs, getMessages) {
  const [treeNodes, setTreeNodes] = useState([]);
  const [activeNodeId, _setActiveNodeId] = useState(
    () => sessionStorage.getItem(ACTIVE_NODE_KEY) || null
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const setActiveNodeId = useCallback((valOrFn) => {
    _setActiveNodeId((prev) => {
      const next = typeof valOrFn === "function" ? valOrFn(prev) : valOrFn;
      if (next) sessionStorage.setItem(ACTIVE_NODE_KEY, next);
      else sessionStorage.removeItem(ACTIVE_NODE_KEY);
      return next;
    });
  }, []);

  // Ref to avoid stale closures
  const activeNodeIdRef = useRef(activeNodeId);
  activeNodeIdRef.current = activeNodeId;

  /**
   * Load all tree nodes for a project.
   */
  const loadTree = useCallback(async (projectName) => {
    if (!projectName) {
      setTreeNodes([]);
      setActiveNodeId(null);
      return;
    }
    try {
      const nodes = await storage.listProjectNodes(projectName);
      setTreeNodes(nodes);
      // If we have nodes but no active node, set to the latest
      if (nodes.length > 0) {
        const sorted = [...nodes].sort((a, b) => b.createdAt - a.createdAt);
        setActiveNodeId((prev) => {
          // Keep current if it still exists
          if (prev && nodes.some((n) => n.id === prev)) return prev;
          return sorted[0].id;
        });
      }
    } catch {
      setTreeNodes([]);
    }
  }, []);

  /**
   * Ensure root node exists (lazy migration from flat project).
   */
  const ensureRoot = useCallback(async (projectName, currentState) => {
    if (!projectName) return null;
    const root = await projectTree.ensureRootNode(projectName, currentState);
    await loadTree(projectName);
    return root;
  }, [loadTree]);

  /**
   * Create a node after a prompt completes.
   */
  const createNodeAfterPrompt = useCallback(async (projectName, currentState, opts = {}) => {
    if (!projectName) return null;
    const parentId = activeNodeIdRef.current;
    const thumbnail = captureThumbnail?.() || null;
    const node = await projectTree.createNodeAfterPrompt(
      projectName, parentId, currentState,
      { ...opts, thumbnailDataUrl: thumbnail }
    );
    setActiveNodeId(node.id);
    await loadTree(projectName);
    return node;
  }, [captureThumbnail, loadTree]);

  /**
   * Overwrite the current active node in-place (instead of creating a child).
   */
  const overwriteCurrentNode = useCallback(async (projectName, currentState, opts = {}) => {
    const nodeId = activeNodeIdRef.current;
    if (!projectName || !nodeId) return null;
    const thumbnail = captureThumbnail?.() || null;
    const node = await projectTree.overwriteNode(nodeId, projectName, currentState, {
      ...opts,
      thumbnailDataUrl: thumbnail,
    });
    await loadTree(projectName);
    return node;
  }, [captureThumbnail, loadTree]);

  /**
   * Restore scene from a node (double-click).
   * Returns the reconstructed state for the caller to apply.
   */
  const restoreNode = useCallback(async (nodeId, projectName) => {
    const state = await projectTree.reconstructScene(nodeId, projectName);
    // Sync workspace files and assets to match the node's snapshot
    await projectTree.syncWorkspaceFiles(state.workspace_files);
    await projectTree.syncAssetManifest(state.asset_manifest);
    setActiveNodeId(nodeId);
    return state;
  }, []);

  /**
   * Create a branch from a node.
   */
  const branchFromNode = useCallback(async (nodeId, projectName, title) => {
    const node = await projectTree.createBranch(projectName, nodeId, title);
    setActiveNodeId(node.id);
    await loadTree(projectName);
    return node;
  }, [loadTree]);

  /**
   * Rename a node.
   */
  const renameNode = useCallback(async (nodeId, newTitle, projectName) => {
    await projectTree.renameNode(nodeId, newTitle);
    await loadTree(projectName);
  }, [loadTree]);

  /**
   * Toggle favorite tag on a node.
   */
  const toggleFavorite = useCallback(async (nodeId, projectName) => {
    await projectTree.toggleNodeTag(nodeId, "favorite");
    await loadTree(projectName);
  }, [loadTree]);

  /**
   * Pin a node as checkpoint (duplicate as checkpoint).
   */
  const pinCheckpoint = useCallback(async (nodeId, projectName) => {
    await projectTree.duplicateAsCheckpoint(projectName, nodeId);
    await loadTree(projectName);
  }, [loadTree]);

  /**
   * Delete a node and its descendants.
   * Returns { navigatedTo } with the new active node ID (or null).
   */
  const deleteNodeTree = useCallback(async (nodeId, projectName) => {
    // Read parent ID before deletion so we can navigate to it afterwards.
    let parentId = null;
    try {
      const node = await storage.readNode(nodeId);
      if (node) parentId = node.parentId;
    } catch { /* proceed with deletion anyway */ }

    // If deleting the active node, clear activeNodeId BEFORE deletion
    // to prevent stale ref usage by concurrent operations (e.g. chat_done).
    const wasActive = activeNodeIdRef.current === nodeId;
    if (wasActive) {
      setActiveNodeId(null);
    }

    await projectTree.deleteNodeTree(nodeId, projectName);

    // Navigate to the deleted node's parent, or fall back to the most recent node.
    let navigatedTo = null;
    if (wasActive) {
      const nodes = await storage.listProjectNodes(projectName);
      if (nodes.length > 0) {
        const parentExists = parentId && nodes.some((n) => n.id === parentId);
        if (parentExists) {
          setActiveNodeId(parentId);
          navigatedTo = parentId;
        } else {
          const sorted = [...nodes].sort((a, b) => b.createdAt - a.createdAt);
          setActiveNodeId(sorted[0].id);
          navigatedTo = sorted[0].id;
        }
      }
    }
    await loadTree(projectName);
    return { navigatedTo };
  }, [loadTree]);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  return {
    treeNodes,
    activeNodeId,
    setActiveNodeId,
    sidebarOpen,
    setSidebarOpen,
    toggleSidebar,
    loadTree,
    ensureRoot,
    createNodeAfterPrompt,
    overwriteCurrentNode,
    restoreNode,
    branchFromNode,
    renameNode,
    toggleFavorite,
    pinCheckpoint,
    deleteNodeTree,
  };
}
