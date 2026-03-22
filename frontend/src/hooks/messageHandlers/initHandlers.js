import { restoreWorkspaceState } from "./helpers.js";

export function handleInit(msg, deps) {
  const { chat, apiKey, project, setProjectManifest, setWorkspaceFilesVersion } = deps;
  if (msg.api_config) apiKey.setSavedConfig(msg.api_config);
  if (msg.projects) project.setProjectList(msg.projects);
  if (msg.active_project) {
    project.setActiveProject(msg.active_project.display_name || msg.active_project.name);
    setProjectManifest?.(msg.active_project);
  } else {
    project.setActiveProject(null);
    setProjectManifest?.(null);
  }
  chat.setProcessing(!!msg.is_processing);
  restoreWorkspaceState(msg, deps);
  setWorkspaceFilesVersion((v) => v + 1);
  if (msg.interrupted_prompt) {
    chat.addInterruptedMessage(msg.interrupted_prompt.userPrompt || "");
  }
}

export function handleProjectLoaded(msg, deps) {
  const { project, recorderFnsRef, setProjectManifest, setWorkspaceFilesVersion, dirtyRef } = deps;
  recorderFnsRef.current.engineRef?.current?.setActiveNodeId(msg.nodeId || null);
  if (msg.meta) {
    project.setActiveProject(msg.meta.display_name || msg.meta.name);
    setProjectManifest?.(msg.meta);
  }
  restoreWorkspaceState(msg, deps);
  setWorkspaceFilesVersion((v) => v + 1);
  dirtyRef.current = false;
}

export function handleWorkspaceStateUpdate(msg, deps) {
  const { kf, kfMountedRef, durationLoopMountedRef, setDuration, setLoop, setFps } = deps;
  kfMountedRef.current = false;
  durationLoopMountedRef.current = false;
  if (msg.workspace_state) {
    kf.restoreKeyframes(msg.workspace_state.keyframes);
    if (typeof msg.workspace_state.duration === "number") setDuration(msg.workspace_state.duration);
    if (typeof msg.workspace_state.loop === "boolean") setLoop(msg.workspace_state.loop);
    if (typeof msg.workspace_state.fps === "number") setFps(Math.max(1, Math.min(240, Math.round(msg.workspace_state.fps))));
  }
}
