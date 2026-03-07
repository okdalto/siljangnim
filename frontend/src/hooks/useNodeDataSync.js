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
              },
            }
          : node
      )
    );
  }, [
    setNodes, chat.messages, chat.handleSend, chat.isProcessing, chat.agentStatus,
    chat.handleNewChat, chat.handleCancel, chat.pendingQuestion, chat.handleAnswer,
  ]);

  // --- Viewport node sync ---
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) =>
        node.id === "viewport"
          ? { ...node, data: { ...node.data, sceneJSON, engineRef, paused, onError: handleShaderErrorRef.current } }
          : node
      )
    );
  }, [setNodes, sceneJSON, paused]);

  // --- Debug log node sync ---
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) =>
        node.id === "debugLog"
          ? { ...node, data: { ...node.data, logs: chat.debugLogs } }
          : node
      )
    );
  }, [setNodes, chat.debugLogs]);

  // --- Project browser node sync ---
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) =>
        node.id === "projectBrowser"
          ? {
              ...node,
              data: {
                ...node.data,
                projects: project.projectList,
                activeProject: project.activeProject,
                onSave: project.handleProjectSave,
                onLoad: project.handleProjectLoad,
                onDelete: project.handleProjectDelete,
                onRename: project.handleProjectRename,
                onImport: project.handleProjectImport,
                onDeleteWorkspaceFile: handleDeleteWorkspaceFileRef.current,
                workspaceFilesVersion,
              },
            }
          : node
      )
    );
  }, [
    setNodes, project.projectList, project.activeProject,
    project.handleProjectSave, project.handleProjectLoad,
    project.handleProjectDelete, project.handleProjectRename,
    workspaceFilesVersion,
  ]);

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
}
