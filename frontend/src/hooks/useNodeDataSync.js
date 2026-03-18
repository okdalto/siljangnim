import { useEffect, useMemo, useRef } from "react";

/**
 * Find a non-overlapping position for a new panel among existing nodes.
 * Tries to place within the current viewport and snaps to adjacent edges
 * (block-stacking style) for a tidy layout.
 */
const _PLACEMENT_GAP = 16;

function findEmptyPosition(existingNodes, width, height, rfInstance) {
  const boxes = existingNodes.map((n) => ({
    x: n.position.x,
    y: n.position.y,
    w: n.measured?.width ?? n.width ?? parseFloat(n.style?.width) ?? 320,
    h: n.measured?.height ?? n.height ?? parseFloat(n.style?.height) ?? 300,
  }));

  const overlaps = (cx, cy, w, h) =>
    boxes.some(
      (b) =>
        cx < b.x + b.w + _PLACEMENT_GAP &&
        cx + w + _PLACEMENT_GAP > b.x &&
        cy < b.y + b.h + _PLACEMENT_GAP &&
        cy + h + _PLACEMENT_GAP > b.y
    );

  // Get visible viewport area in flow coordinates
  let vpLeft = 0, vpTop = 0, vpRight = 1200, vpBottom = 800;
  if (rfInstance) {
    try {
      const vp = rfInstance.getViewport();
      const el = document.querySelector(".react-flow");
      if (el && vp) {
        const rect = el.getBoundingClientRect();
        const z = vp.zoom || 1;
        vpLeft = -vp.x / z;
        vpTop = -vp.y / z;
        vpRight = vpLeft + rect.width / z;
        vpBottom = vpTop + rect.height / z;
      }
    } catch { /* use defaults */ }
  }

  // Inset viewport edges to keep panels away from screen edges
  const INSET = 40;
  vpLeft += INSET;
  vpTop += INSET;
  vpRight -= INSET;
  vpBottom -= INSET;

  // Clamp check: does a position fit inside viewport?
  const fitsViewport = (x, y) =>
    x >= vpLeft && y >= vpTop &&
    x + width <= vpRight && y + height <= vpBottom;

  // --- Strategy 1: snap to edges of existing nodes (block stacking) ---
  // Generate candidate positions by snapping to right/bottom edges of existing boxes
  const candidates = [];
  for (const b of boxes) {
    // Right of box, top-aligned
    candidates.push({ x: b.x + b.w + _PLACEMENT_GAP, y: b.y });
    // Below box, left-aligned
    candidates.push({ x: b.x, y: b.y + b.h + _PLACEMENT_GAP });
    // Right of box, bottom-aligned (so bottoms line up)
    if (height <= b.h) {
      candidates.push({ x: b.x + b.w + _PLACEMENT_GAP, y: b.y + b.h - height });
    }
    // Below box, right-aligned (so right edges line up)
    if (width <= b.w) {
      candidates.push({ x: b.x + b.w - width, y: b.y + b.h + _PLACEMENT_GAP });
    }
  }

  // Score candidates: prefer in-viewport, closer to viewport top-left
  const scored = candidates
    .filter((c) => !overlaps(c.x, c.y, width, height))
    .map((c) => ({
      ...c,
      inView: fitsViewport(c.x, c.y),
      dist: Math.hypot(c.x - vpLeft, c.y - vpTop),
    }))
    .sort((a, b) => {
      // In-viewport first
      if (a.inView !== b.inView) return a.inView ? -1 : 1;
      // Then by distance to viewport top-left
      return a.dist - b.dist;
    });

  if (scored.length > 0) return { x: scored[0].x, y: scored[0].y };

  // --- Strategy 2: scan viewport grid for free slot ---
  const stepX = width + _PLACEMENT_GAP;
  const stepY = height + _PLACEMENT_GAP;
  for (let y = vpTop; y + height <= vpBottom; y += stepY) {
    for (let x = vpLeft; x + width <= vpRight; x += stepX) {
      if (!overlaps(x, y, width, height)) return { x, y };
    }
  }

  // --- Strategy 3: overlap with offset inside viewport ---
  // Better to overlap slightly than to place off-screen where the user can't see it.
  // Use a cascading offset so stacked panels are still distinguishable.
  const cascadeOffset = (boxes.length % 5) * 30;
  const fallbackX = Math.min(vpLeft + cascadeOffset, vpRight - width);
  const fallbackY = Math.min(vpTop + cascadeOffset, vpBottom - height);
  return { x: fallbackX, y: fallbackY };
}

/**
 * Update data for a single node by ID.
 * @param {Function} setNodes - React Flow setNodes
 * @param {string} nodeId - Target node ID
 * @param {Function} dataMapper - (prevData) => newData partial
 */
function updateNodeData(setNodes, nodeId, dataMapper) {
  setNodes((nds) =>
    nds.map((node) =>
      node.id === nodeId
        ? { ...node, data: { ...node.data, ...dataMapper(node.data) } }
        : node
    )
  );
}

export default function useNodeDataSync({
  setNodes, chat, sceneJSON, uiConfig,
  handleUniformChange, handleDeleteWorkspaceFile,
  workspaceFilesVersion, handleShaderError, onViewportStateChange,
  panels, handlePanelClose, mergeControlDefaults,
  kf, duration, loop, engineRef, pendingLayoutsRef,
  setDuration, setLoop,
  activeNodeTitle,
  // ReactFlow instance for viewport-aware placement
  rfInstanceRef,
  // Asset nodes
  assetNodes,
  onAssetUpload,
  onAssetDelete,
  // AI Debugger props
  debugger: dbg,
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
  // Per-node UI state ref (collapsed, fixedResolution)
  nodeUiStateRef,
  // Scene references from version tree
  sceneReferences,
  onRemoveReference,
  onClearReferences,
}) {
  // Use refs for stable callback values to avoid triggering unrelated effects
  const handleUniformChangeRef = useRef(handleUniformChange);
  handleUniformChangeRef.current = handleUniformChange;
  const handleShaderErrorRef = useRef(handleShaderError);
  handleShaderErrorRef.current = handleShaderError;
  const onViewportStateChangeRef = useRef(onViewportStateChange);
  onViewportStateChangeRef.current = onViewportStateChange;
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

  // --- Chat node sync (core chat values come from ChatContext) ---
  useEffect(() => {
    updateNodeData(setNodes, "chat", () => ({
      onRetryInterrupted: chat.handleRetryInterrupted,
      activeNodeTitle: activeNodeTitle || null,
      promptMode: promptMode || "hybrid",
      treeNodes: treeNodes || [],
      activeTreeNodeId: activeTreeNodeId || null,
      onBranchFromNode: (...args) => onBranchFromNodeRef.current?.(...args),
      onSwitchToNode: (...args) => onSwitchToNodeRef.current?.(...args),
      overwriteMode: overwriteMode || false,
      onToggleOverwrite,
      sceneReferences: sceneReferences || [],
      onRemoveReference,
      onClearReferences,
      initialCollapsed: nodeUiStateRef?.current?.collapsed?.chat,
      onCollapsedChange: (v) => { if (nodeUiStateRef?.current) nodeUiStateRef.current.collapsed.chat = v; },
    }));
  }, [
    setNodes, activeNodeTitle, promptMode,
    treeNodes, activeTreeNodeId, overwriteMode, onToggleOverwrite, sceneReferences, onRemoveReference,
  ]);

  // --- Viewport node sync (scene values come from SceneContext / EngineContext) ---
  const VIEWPORT_HEADER_HEIGHT = 36; // px — header bar height
  useEffect(() => {
    updateNodeData(setNodes, "viewport", () => ({
      onError: handleShaderErrorRef.current,
      onViewportStateChange: (...args) => onViewportStateChangeRef.current?.(...args),
      initialCollapsed: nodeUiStateRef?.current?.collapsed?.viewport,
      onCollapsedChange: (v) => { if (nodeUiStateRef?.current) nodeUiStateRef.current.collapsed.viewport = v; },
      initialFixedResolution: nodeUiStateRef?.current?.viewportFixedResolution,
      onFixedResolutionChange: (v) => { if (nodeUiStateRef?.current) nodeUiStateRef.current.viewportFixedResolution = v; },
      onResizeNode: (w, h) => {
        setNodes((prev) =>
          prev.map((n) => {
            if (n.id !== "viewport") return n;
            const currentWidth = parseFloat(n.style?.width) || 670;
            const aspectHeight = Math.round(currentWidth * (h / w)) + VIEWPORT_HEADER_HEIGHT;
            return { ...n, style: { ...n.style, height: aspectHeight } };
          })
        );
      },
    }));
  }, [setNodes]);

  // Refs for debugger callbacks
  const runDiagnosisRef = useRef(dbg?.runDiagnosis);
  runDiagnosisRef.current = dbg?.runDiagnosis;
  const applyPatchRef = useRef(dbg?.applyPatch);
  applyPatchRef.current = dbg?.applyPatch;

  // --- Debug log node sync (debugLogs + backendName come from contexts) ---
  useEffect(() => {
    updateNodeData(setNodes, "debugLog", () => ({
      compileLogs: dbg?.compileLogs || [],
      validationLogs: dbg?.validationLogs || [],
      diagnosis: dbg?.diagnosis || null,
      patches: dbg?.patches || [],
      simpleExplanation: dbg?.simpleExplanation || null,
      onApplyPatch: (patch) => applyPatchRef.current?.(patch),
      onRunDiagnosis: () => runDiagnosisRef.current?.(),
      initialCollapsed: nodeUiStateRef?.current?.collapsed?.debugLog,
      onCollapsedChange: (v) => { if (nodeUiStateRef?.current) nodeUiStateRef.current.collapsed.debugLog = v; },
    }));
  }, [setNodes, dbg?.compileLogs, dbg?.validationLogs, dbg?.diagnosis, dbg?.patches, dbg?.simpleExplanation]);

  // Track newly created panel nodes so we can scroll to them after render
  const newPanelRef = useRef(null);

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
      let newlyAdded = null;
      for (const [panelId, panel] of panels.customPanels) {
        const nodeId = `panel_${panelId}`;
        if (!updated.some((n) => n.id === nodeId)) {
          const pw = panel.width || 320;
          const ph = panel.height || 300;
          const pos = findEmptyPosition(updated, pw, ph, rfInstanceRef?.current);
          const newNode = {
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
          };
          updated = [...updated, newNode];
          newlyAdded = newNode;
        }
      }
      updated = updated.filter((n) => n.type !== "customPanel" || panelNodeIds.has(n.id));

      // Schedule scroll-to for the newly created panel
      if (newlyAdded) {
        newPanelRef.current = newlyAdded;
      }

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

  // Scroll to newly created panel so the user can see it
  useEffect(() => {
    const panel = newPanelRef.current;
    if (!panel) return;
    newPanelRef.current = null;
    const rf = rfInstanceRef?.current;
    if (!rf) return;
    // Wait for React Flow to reconcile the new node, then scroll to it
    requestAnimationFrame(() => {
      try {
        const pw = parseFloat(panel.style?.width) || 320;
        const ph = parseFloat(panel.style?.height) || 300;
        const centerX = panel.position.x + pw / 2;
        const centerY = panel.position.y + ph / 2;
        // Only pan if the panel center is outside the current viewport
        const vp = rf.getViewport();
        const el = document.querySelector(".react-flow");
        if (el && vp) {
          const rect = el.getBoundingClientRect();
          const z = vp.zoom || 1;
          const vpLeft = -vp.x / z;
          const vpTop = -vp.y / z;
          const vpRight = vpLeft + rect.width / z;
          const vpBottom = vpTop + rect.height / z;
          if (centerX < vpLeft || centerX > vpRight || centerY < vpTop || centerY > vpBottom) {
            rf.setCenter(centerX, centerY, { duration: 300, zoom: z });
          }
        }
      } catch { /* non-critical */ }
    });
  }, [panels.customPanels]);

  // Pre-compute merged controls for all panels (replaces separate re-merge effect)
  const mergedControlsMap = useMemo(() => {
    const map = new Map();
    for (const [panelId, panel] of panels.customPanels) {
      if (panel.controls) {
        map.set(panelId, mergeControlDefaultsRef.current(panel.controls));
      }
    }
    return map;
  }, [panels.customPanels, sceneJSON?.uniforms]);

  // Apply merged controls when they change
  useEffect(() => {
    if (mergedControlsMap.size === 0) return;
    setNodes((nds) =>
      nds.map((node) => {
        if (node.type !== "customPanel") return node;
        const panelId = node.id.replace("panel_", "");
        const merged = mergedControlsMap.get(panelId);
        if (!merged) return node;
        return { ...node, data: { ...node.data, controls: merged } };
      })
    );
  }, [setNodes, mergedControlsMap]);

  // --- Asset browser node sync ---
  const assetSelectRef = useRef(assetNodes?.selectAsset);
  assetSelectRef.current = assetNodes?.selectAsset;
  const assetDeleteRef = useRef(onAssetDelete);
  assetDeleteRef.current = onAssetDelete;
  const onAssetUploadRef = useRef(onAssetUpload);
  onAssetUploadRef.current = onAssetUpload;

  useEffect(() => {
    if (!assetNodes) return;
    updateNodeData(setNodes, "assetBrowser", () => ({
      assets: assetNodes.assets,
      onDelete: (id) => assetDeleteRef.current?.(id),
      onSelect: (id) => assetSelectRef.current?.(id),
      onUpload: (files) => onAssetUploadRef.current?.(files),
      workspaceFilesVersion,
      onDeleteWorkspaceFile: (f) => handleDeleteWorkspaceFileRef.current?.(f),
    }));
  }, [setNodes, assetNodes?.assets, workspaceFilesVersion]);
}
