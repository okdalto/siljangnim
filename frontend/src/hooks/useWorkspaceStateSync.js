import { useCallback, useEffect, useRef } from "react";

/**
 * Manages debounced workspace-state sends to the backend.
 * Also fires workspace-state updates when keyframes or duration/loop change.
 */
export default function useWorkspaceStateSync({ sendRef, getWorkspaceState, kf, duration, loop, fps, autoSave, initSettledRef, onLayoutCommitRef }) {
  const wsStateTimerRef = useRef(null);

  const sendWorkspaceState = useCallback(() => {
    if (wsStateTimerRef.current) clearTimeout(wsStateTimerRef.current);
    wsStateTimerRef.current = setTimeout(() => {
      sendRef.current?.({ type: "update_workspace_state", workspace_state: getWorkspaceState() });
    }, 2000);
  }, [getWorkspaceState]);

  // Immediate (non-debounced) send — for user actions like drag end
  const sendWorkspaceStateNow = useCallback(() => {
    if (wsStateTimerRef.current) clearTimeout(wsStateTimerRef.current);
    sendRef.current?.({ type: "update_workspace_state", workspace_state: getWorkspaceState() });
  }, [getWorkspaceState]);

  // Use ref so effects don't re-fire when sendWorkspaceState changes
  const sendWsRef = useRef(sendWorkspaceState);
  sendWsRef.current = sendWorkspaceState;

  // Send workspace state when keyframes change (skip init restore)
  const kfMountedRef = useRef(false);
  useEffect(() => {
    if (!kfMountedRef.current) {
      kfMountedRef.current = true;
      return;
    }
    if (kf.keyframeVersion > 0) {
      sendWsRef.current();
      autoSave.triggerAutoSave();
    }
  }, [kf.keyframeVersion, autoSave.triggerAutoSave]);

  const durationLoopMountedRef = useRef(false);
  useEffect(() => {
    if (!durationLoopMountedRef.current) {
      durationLoopMountedRef.current = true;
      return;
    }
    sendWsRef.current();
    autoSave.triggerAutoSave();
  }, [duration, loop, fps, autoSave.triggerAutoSave]);

  // Save workspace state when node layout changes (drag/resize end)
  onLayoutCommitRef.current = () => {
    if (!initSettledRef.current) return; // suppress during init/project load
    sendWorkspaceStateNow();
    autoSave.triggerAutoSave();
  };

  return { wsStateTimerRef, sendWorkspaceState, sendWorkspaceStateNow, kfMountedRef, durationLoopMountedRef };
}
