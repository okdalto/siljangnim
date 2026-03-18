import { useCallback, useState } from "react";
import { API_BASE } from "../constants/api.js";
import { getActiveProjectName, importProjectZip } from "../engine/storage.js";

export default function useProjectManager(sendRef, agentEngine) {
  const [projectList, setProjectList] = useState([]);
  const [activeProject, setActiveProject] = useState(null);

  const handleProjectLoad = useCallback(
    (name) => {
      if (agentEngine?.abortController) return; // blocked while agent is running
      // No unsaved-changes confirmation needed — auto-save handles everything
      sendRef.current?.({ type: "project_load", name });
    },
    [sendRef, agentEngine]
  );

  const handleProjectDelete = useCallback(
    (name) => {
      const isDeletingActive = getActiveProjectName() === name;
      sendRef.current?.({ type: "project_delete", name });
      if (isDeletingActive) setActiveProject(null);
    },
    [sendRef]
  );

  const handleProjectRename = useCallback(
    (name, newDisplayName) => {
      sendRef.current?.({ type: "project_rename", name, newDisplayName });
      // Immediately update the active project name in the UI
      setActiveProject((prev) => (prev === name ? newDisplayName : prev));
    },
    [sendRef]
  );

  const handleProjectFork = useCallback(
    (name, newDisplayName) => {
      sendRef.current?.({ type: "project_fork", name, newDisplayName });
    },
    [sendRef]
  );

  const handleProjectImport = useCallback(async (file) => {
    // Try backend API first
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${API_BASE}/api/projects/import`, {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        sendRef.current?.({ type: "project_list" });
        return;
      }
    } catch { /* backend unavailable */ }

    // Fallback: browser-only import
    try {
      if (file.name?.endsWith(".zip") || file.type === "application/zip") {
        const { importProjectFromZip } = await import("../engine/zipIO.js");
        await importProjectFromZip(file, { isExternal: true });
      } else {
        const text = await file.text();
        await importProjectZip(text);
      }
      sendRef.current?.({ type: "project_list" });
    } catch { /* ignore */ }
  }, [sendRef]);

  return {
    projectList,
    activeProject,
    handleProjectLoad,
    handleProjectDelete,
    handleProjectRename,
    handleProjectFork,
    handleProjectImport,
    setProjectList,
    setActiveProject,
  };
}
