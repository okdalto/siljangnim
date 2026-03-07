import { useEffect, useRef } from "react";

/**
 * Find a non-overlapping position for a new panel among existing nodes.
 */
const _PLACEMENT_GAP = 20;

function findEmptyPosition(existingNodes, width, height) {
  const boxes = existingNodes.map((n) => ({
    x: n.position.x,
    y: n.position.y,
    w: n.measured?.width ?? n.width ?? parseFloat(n.style?.width) ?? 320,
    h: n.measured?.height ?? n.height ?? parseFloat(n.style?.height) ?? 300,
  }));

  const overlaps = (cx, cy) =>
    boxes.some(
      (b) =>
        cx < b.x + b.w + _PLACEMENT_GAP &&
        cx + width + _PLACEMENT_GAP > b.x &&
        cy < b.y + b.h + _PLACEMENT_GAP &&
        cy + height + _PLACEMENT_GAP > b.y
    );

  const candidates = [];
  for (const b of boxes) {
    candidates.push({ x: b.x + b.w + _PLACEMENT_GAP, y: b.y });
    candidates.push({ x: b.x, y: b.y + b.h + _PLACEMENT_GAP });
  }
  candidates.sort((a, b) => a.x + a.y - (b.x + b.y));

  for (const c of candidates) {
    if (!overlaps(c.x, c.y)) return c;
  }

  const n = existingNodes.filter((nd) => nd.type === "customPanel").length;
  return { x: 750 + n * 30, y: 400 + n * 30 };
}

export default function useNodeDataSync({
  setNodes, chat, sceneJSON, paused, uiConfig,
  handleUniformChange, project, handleDeleteWorkspaceFile,
  workspaceFilesVersion, handleShaderError,
  panels, handlePanelClose, mergeControlDefaults,
  kf, duration, loop, engineRef, pendingLayoutsRef,
  setDuration, setLoop,
  activeNodeTitle,
  // Asset nodes
  assetNodes,
  onPromptSuggestion,
  // AI Debugger props
  debugger: dbg,
  // Safe mode
  safeModeActive,
  // Prompt mode
  promptMode,
  // Project tree (branch UX)
  treeNodes,
  activeTreeNodeId,
  onBranchFromNode,
  onSwitchToNode,
  // Overwrite mode
  overwriteMode,
  onToggleOverwrite,
  // Backend target
  backendTarget,
}) {
  // Use refs for stable callback values to avoid triggering unrelated effects
  const handleUniformChangeRef = useRef(handleUniformChange);
  handleUniformChangeRef.current = handleUniformChange;
  const handleShaderErrorRef = useRef(handleShaderError);
  handleShaderErrorRef.current = handleShaderError;
  const handlePanelCloseRef = useRef(handlePanelClose);
  handlePanelCloseRef.current = handlePanelClose;
  const mergeControlDefaultsRef = useRef(mergeControlDefaults);
  mergeControlDefaultsRef.current = mergeControlDefaults;
  const handleDeleteWorkspaceFileRef = useRef(handleDeleteWorkspaceFile);
  handleDeleteWorkspaceFileRef.current = handleDeleteWorkspaceFile;
  const onBranchFromNodeRef = useRef(onBranchFromNode);
  onBranchFromNodeRef.current = onBranchFromNode;
  const onSwitchToNodeRef = useRef(onSwitchToNode);
  onSwitchToNodeRef.current = onSwitchToNode;

  // --- Chat node sync ---
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) =>
        node.id === "chat"
          ? {
              ...node,
              data: {
                ...node.data,
                messages: chat.messages,
                onSend: chat.handleSend,
                isProcessing: chat.isProcessing,
                agentStatus: chat.agentStatus,
                onNewChat: chat.handleNewChat,
                onCancel: chat.handleCancel,
                pendingQuestion: chat.pendingQuestion,
                onAnswer: chat.handleAnswer,
                activeNodeTitle: activeNodeTitle || null,
                promptMode: promptMode || "hybrid",
                treeNodes: treeNodes || [],
                activeTreeNodeId: activeTreeNodeId || null,
                onBranchFromNode: (...args) => onBranchFromNodeRef.current?.(...args),
                onSwitchToNode: (...args) => onSwitchToNodeRef.current?.(...args),
                overwriteMode: overwriteMode || false,
                onToggleOverwrite,
              },
            }
          : node
      )
    );
  }, [
    setNodes, chat.messages, chat.handleSend, chat.isProcessing, chat.agentStatus,
    chat.handleNewChat, chat.handleCancel, chat.pendingQuestion, chat.handleAnswer, activeNodeTitle, promptMode,
    treeNodes, activeTreeNodeId, overwriteMode, onToggleOverwrite,
  ]);

  // --- Viewport node sync ---
  // When safe_mode is active, pass null sceneJSON to block script execution
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) =>
        node.id === "viewport"
          ? { ...node, data: { ...node.data, sceneJSON: safeModeActive ? null : sceneJSON, engineRef, paused, onError: handleShaderErrorRef.current, safeModeActive } }
          : node
      )
    );
  }, [setNodes, sceneJSON, paused, safeModeActive]);

  // Refs for debugger callbacks
  const runDiagnosisRef = useRef(dbg?.runDiagnosis);
  runDiagnosisRef.current = dbg?.runDiagnosis;
  const applyPatchRef = useRef(dbg?.applyPatch);
  applyPatchRef.current = dbg?.applyPatch;

  // --- Debug log node sync ---
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) =>
        node.id === "debugLog"
          ? {
              ...node,
              data: {
                ...node.data,
                logs: chat.debugLogs,
                compileLogs: dbg?.compileLogs || [],
                validationLogs: dbg?.validationLogs || [],
                diagnosis: dbg?.diagnosis || null,
                patches: dbg?.patches || [],
                simpleExplanation: dbg?.simpleExplanation || null,
                backendName: backendTarget === "webgpu" ? "WebGPU" : (backendTarget === "webgl2" ? "WebGL2" : (engineRef?.current?.backendName || "WebGL2")),
                onApplyPatch: (patch) => applyPatchRef.current?.(patch),
                onRunDiagnosis: () => runDiagnosisRef.current?.(),
              },
            }
          : node
      )
    );
  }, [setNodes, chat.debugLogs, dbg?.compileLogs, dbg?.validationLogs, dbg?.diagnosis, dbg?.patches, dbg?.simpleExplanation, backendTarget]);

  // --- Custom panel nodes sync (data + add/remove) ---
  useEffect(() => {
    setNodes((nds) => {
      let updated = nds.map((node) => {
        if (node.type !== "customPanel") return node;
        const panelId = node.id.replace("panel_", "");
        const panel = panels.customPanels.get(panelId);
        if (!panel) return node;
        return {
          ...node,
          data: {
            ...node.data,
            title: panel.title,
            html: panel.html,
            controls: panel.controls ? mergeControlDefaultsRef.current(panel.controls) : undefined,
            onUniformChange: handleUniformChangeRef.current,
            engineRef,
            onClose: () => handlePanelCloseRef.current(panelId),
            keyframeManagerRef: kf.keyframeManagerRef,
            onKeyframesChange: kf.handlePanelKeyframesChange,
            onOpenKeyframeEditor: kf.handleOpenKeyframeEditor,
            onDurationChange: setDuration,
            onLoopChange: setLoop,
            duration,
            loop,
          },
        };
      });

      // Add/remove custom panel nodes
      const panelNodeIds = new Set([...panels.customPanels.keys()].map((id) => `panel_${id}`));
      for (const [panelId, panel] of panels.customPanels) {
        const nodeId = `panel_${panelId}`;
        if (!updated.some((n) => n.id === nodeId)) {
          const pw = panel.width || 320;
          const ph = panel.height || 300;
          const pos = findEmptyPosition(updated, pw, ph);
          updated = [
            ...updated,
            {
              id: nodeId,
              type: "customPanel",
              position: pos,
              style: { width: pw, height: ph },
              data: {
                title: panel.title,
                html: panel.html,
                controls: panel.controls ? mergeControlDefaultsRef.current(panel.controls) : undefined,
                onUniformChange: handleUniformChangeRef.current,
                engineRef,
                onClose: () => handlePanelCloseRef.current(panelId),
                keyframeManagerRef: kf.keyframeManagerRef,
                onKeyframesChange: kf.handlePanelKeyframesChange,
                onOpenKeyframeEditor: kf.handleOpenKeyframeEditor,
                onDurationChange: setDuration,
                onLoopChange: setLoop,
                duration,
                loop,
              },
            },
          ];
        }
      }
      updated = updated.filter((n) => n.type !== "customPanel" || panelNodeIds.has(n.id));

      // Apply pending node layouts from project load (incremental)
      if (pendingLayoutsRef.current) {
        const layoutMap = new Map(pendingLayoutsRef.current.map((l) => [l.id, l]));
        const appliedIds = new Set();
        updated = updated.map((n) => {
          const saved = layoutMap.get(n.id);
          if (saved) {
            appliedIds.add(n.id);
            return { ...n, position: saved.position, style: saved.style || n.style };
          }
          return n;
        });
        const remaining = pendingLayoutsRef.current.filter((l) => !appliedIds.has(l.id));
        pendingLayoutsRef.current = remaining.length > 0 ? remaining : null;
      }

      // Restore position for undo'd panel close
      if (panels.pendingRestoreRef.current) {
        const r = panels.pendingRestoreRef.current;
        updated = updated.map((n) =>
          n.id === r.id ? { ...n, position: r.position || n.position, style: r.style || n.style } : n
        );
        panels.pendingRestoreRef.current = null;
      }

      return updated;
    });
  }, [
    setNodes, panels.customPanels,
    kf.handleOpenKeyframeEditor, kf.keyframeVersion, kf.handlePanelKeyframesChange, kf.keyframeManagerRef,
    duration, loop,
  ]);

  // --- Asset node sync (add/remove/update) ---
  const assetSelectRef = useRef(assetNodes?.selectAsset);
  assetSelectRef.current = assetNodes?.selectAsset;
  const assetRenameRef = useRef(assetNodes?.renameAsset);
  assetRenameRef.current = assetNodes?.renameAsset;
  const assetExecuteActionRef = useRef(assetNodes?.executeAction);
  assetExecuteActionRef.current = assetNodes?.executeAction;
  const onPromptSuggestionRef = useRef(onPromptSuggestion);
  onPromptSuggestionRef.current = onPromptSuggestion;

  useEffect(() => {
    if (!assetNodes) return;
    const assets = assetNodes.assets;

    setNodes((nds) => {
      let updated = nds;

      // Update existing asset nodes data
      updated = updated.map((node) => {
        if (node.type !== "assetNode") return node;
        const assetId = node.id.replace("asset_node_", "");
        const desc = assets.get(assetId);
        if (!desc) return node;
        return {
          ...node,
          data: {
            ...node.data,
            descriptor: desc,
            onSelect: (id) => assetSelectRef.current?.(id),
            onRename: (id, name) => assetRenameRef.current?.(id, name),
            onAction: (id, actionType) => {
              const result = assetExecuteActionRef.current?.(id, actionType);
              if (result?.type === "prompt_suggestion") {
                onPromptSuggestionRef.current?.(result.text);
              }
            },
          },
        };
      });

      // Add new asset nodes
      const assetNodeIds = new Set([...assets.keys()].map((id) => `asset_node_${id}`));
      for (const [assetId, desc] of assets) {
        const nodeId = `asset_node_${assetId}`;
        if (!updated.some((n) => n.id === nodeId)) {
          const pos = findEmptyPosition(updated, 180, 200);
          updated = [
            ...updated,
            {
              id: nodeId,
              type: "assetNode",
              position: pos,
              style: { width: 180, height: 200 },
              data: {
                descriptor: desc,
                onSelect: (id) => assetSelectRef.current?.(id),
                onRename: (id, name) => assetRenameRef.current?.(id, name),
                onAction: (id, actionType) => {
                  const result = assetExecuteActionRef.current?.(id, actionType);
                  if (result?.type === "prompt_suggestion") {
                    onPromptSuggestionRef.current?.(result.text);
                  }
                },
              },
            },
          ];
        }
      }

      // Remove asset nodes whose descriptors no longer exist
      updated = updated.filter((n) => n.type !== "assetNode" || assetNodeIds.has(n.id));

      // Apply pending layouts for asset nodes
      if (pendingLayoutsRef.current) {
        const layoutMap = new Map(pendingLayoutsRef.current.map((l) => [l.id, l]));
        const appliedIds = new Set();
        updated = updated.map((n) => {
          if (n.type !== "assetNode") return n;
          const saved = layoutMap.get(n.id);
          if (saved) {
            appliedIds.add(n.id);
            return { ...n, position: saved.position, style: saved.style || n.style };
          }
          return n;
        });
        if (appliedIds.size > 0) {
          const remaining = pendingLayoutsRef.current.filter((l) => !appliedIds.has(l.id));
          pendingLayoutsRef.current = remaining.length > 0 ? remaining : null;
        }
      }

      return updated;
    });
  }, [setNodes, assetNodes?.assets]);
}
