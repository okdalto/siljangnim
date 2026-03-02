import { useCallback, useRef, useState } from "react";

export default function useProjectManager(sendRef, captureThumbnail, getWorkspaceState) {
  const [projectList, setProjectList] = useState([]);
  const [activeProject, setActiveProject] = useState(null);
  const [saveStatus, setSaveStatus] = useState("saved");

  // Expose a ref so beforeunload can read current value without re-registering
  const saveStatusRef = useRef(saveStatus);
  saveStatusRef.current = saveStatus;

  const handleProjectSave = useCallback(
    (name, description) => {
      setSaveStatus("saving");
      sendRef.current?.({
        type: "project_save",
        name,
        description: description || "",
        thumbnail: captureThumbnail(),
        workspace_state: getWorkspaceState(),
      });
    },
    [sendRef, captureThumbnail, getWorkspaceState]
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
        msg.workspace_state = getWorkspaceState();
      }
      sendRef.current?.(msg);
    },
    [sendRef, activeProject, captureThumbnail, getWorkspaceState]
  );

  const handleProjectDelete = useCallback(
    (name) => {
      sendRef.current?.({ type: "project_delete", name });
      setActiveProject((prev) => (prev === name ? null : prev));
    },
    [sendRef]
  );

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
    setProjectList,
    setActiveProject,
    markSaved,
    markUnsaved,
    markSaving,
  };
}
