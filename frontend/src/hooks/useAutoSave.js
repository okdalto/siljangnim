import { useCallback, useRef, useState } from "react";
import { autoSaveCurrentProject, getActiveProjectName, listProjects } from "../engine/storage.js";

const DEBOUNCE_MS = 2000;

/**
 * Figma-style auto-save hook.
 * Debounces saves by 2 seconds after the last trigger.
 *
 * @param {Object} params
 * @param {React.MutableRefObject} params.captureThumbnailRef - ref to thumbnail capture function
 * @param {React.MutableRefObject} params.getMessagesRef - ref to function returning chat messages
 * @param {Function} params.setProjectList - setter for project list state
 * @returns {{ triggerAutoSave: Function, saveStatus: "saving"|"saved" }}
 */
export default function useAutoSave({ captureThumbnailRef, getMessagesRef, setProjectList }) {
  const [saveStatus, setSaveStatus] = useState("saved");
  const timerRef = useRef(null);
  const savingRef = useRef(false);

  const triggerAutoSave = useCallback(() => {
    const activeName = getActiveProjectName();
    if (!activeName || activeName === "_untitled") return;

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      if (savingRef.current) return;
      savingRef.current = true;
      setSaveStatus("saving");

      try {
        const chatHistory = getMessagesRef?.current?.() || [];
        const thumbnail = captureThumbnailRef?.current?.() || null;
        await autoSaveCurrentProject(chatHistory, thumbnail);

        // Refresh project list
        const projects = await listProjects();
        setProjectList(projects);
      } catch (e) {
        console.warn("[useAutoSave] auto-save failed:", e);
      } finally {
        savingRef.current = false;
        setSaveStatus("saved");
      }
    }, DEBOUNCE_MS);
  }, [captureThumbnailRef, getMessagesRef, setProjectList]);

  return { triggerAutoSave, saveStatus };
}
