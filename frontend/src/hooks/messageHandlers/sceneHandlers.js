export function handleSceneUpdate(msg, deps) {
  const { setSceneJSON, setUiConfig, setWorkspaceFilesVersion, dirtyRef, autoSave } = deps;
  if (msg.scene_json) setSceneJSON(msg.scene_json);
  if (msg.ui_config) setUiConfig(msg.ui_config);
  setWorkspaceFilesVersion((v) => v + 1);
  dirtyRef.current = true;
  autoSave?.triggerAutoSave?.();
}

export function handleViewportCleared(msg, deps) {
  deps.setSceneJSON(null);
  deps.dirtyRef.current = true;
  deps.autoSave?.triggerAutoSave?.();
}

export function handleSetTimeline(msg, deps) {
  const { setDuration, setLoop, dirtyRef, autoSave } = deps;
  if (typeof msg.duration === "number") setDuration(msg.duration);
  if (typeof msg.loop === "boolean") setLoop(msg.loop);
  dirtyRef.current = true;
  autoSave?.triggerAutoSave?.();
}

export function handleSceneUpdated(msg, deps) {
  if (msg.scene_json) deps.setSceneJSON(msg.scene_json);
  if (msg.ui_config) deps.setUiConfig(msg.ui_config);
}
