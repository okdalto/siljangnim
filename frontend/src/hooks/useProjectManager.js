import { useCallback, useRef, useState } from "react";

const API_BASE = import.meta.env.DEV
  ? `http://${window.location.hostname}:8000`
  : "";

export default function useProjectManager(sendRef, captureThumbnail, getWorkspaceState, getDebugLogs, getMessages, getNodeLayouts) {
  const [projectList, setProjectList] = useState([]);
  const [activeProject, setActiveProject] = useState(null);
  const [saveStatus, setSaveStatus] = useState("saved");

  // Expose a ref so beforeunload can read current value without re-registering
  const saveStatusRef = useRef(saveStatus);
  saveStatusRef.current = saveStatus;

  const handleProjectSave = useCallback(
    (name, description) => {
      setSaveStatus("saving");
      const ws = getWorkspaceState();
      if (getNodeLayouts) ws.node_layouts = getNodeLayouts();
      sendRef.current?.({
        type: "project_save",
        name,
        description: description || "",
        thumbnail: captureThumbnail(),
        workspace_state: ws,
        debug_logs: getDebugLogs(),
        chat_history: getMessages?.() || [],
      });
    },
    [sendRef, captureThumbnail, getWorkspaceState, getDebugLogs, getMessages, getNodeLayouts]
  );

  const handleProjectLoad = useCallback(
    (name) => {
      if (saveStatusRef.current === "unsaved" && activeProject && activeProject !== name) {
        if (
          !window.confirm(
            `"${activeProject}"에 저장되지 않은 변경사항이 있습니다. "${name}"을(를) 불러올까요?`
          )
        )
          return;
      }
      const msg = { type: "project_load", name };
      if (activeProject && activeProject !== name) {
        msg.active_project = activeProject;
        msg.thumbnail = captureThumbnail();
        const ws = getWorkspaceState();
        if (getNodeLayouts) ws.node_layouts = getNodeLayouts();
        msg.workspace_state = ws;
        msg.debug_logs = getDebugLogs();
        msg.chat_history = getMessages?.() || [];
      }
      sendRef.current?.(msg);
    },
    [sendRef, activeProject, captureThumbnail, getWorkspaceState, getDebugLogs, getMessages, getNodeLayouts]
  );

  const handleProjectDelete = useCallback(
    (name) => {
      sendRef.current?.({ type: "project_delete", name });
      setActiveProject((prev) => (prev === name ? null : prev));
    },
    [sendRef]
  );

  const handleProjectImport = useCallback(async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(`${API_BASE}/api/projects/import`, {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        // Refresh project list via WebSocket
        sendRef.current?.({ type: "project_list" });
      }
    } catch { /* ignore */ }
  }, [sendRef]);

  const markSaved = useCallback(() => setSaveStatus("saved"), []);
  const markUnsaved = useCallback(() => setSaveStatus("unsaved"), []);
  const markSaving = useCallback(() => setSaveStatus("saving"), []);

  return {
    projectList,
    activeProject,
    saveStatus,
    saveStatusRef,
    handleProjectSave,
    handleProjectLoad,
    handleProjectDelete,
    handleProjectImport,
    setProjectList,
    setActiveProject,
    markSaved,
    markUnsaved,
    markSaving,
  };
}
