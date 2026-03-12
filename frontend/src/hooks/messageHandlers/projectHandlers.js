export function handleProjectList(msg, deps) {
  deps.project.setProjectList(msg.projects || []);
}

export function handleProjectSaved(msg, deps) {
  if (msg.meta) deps.project.setActiveProject(msg.meta.display_name || msg.meta.name);
  deps.dirtyRef.current = false;
}

export function handleProjectTrusted(msg, deps) {
  if (msg.meta) deps.setProjectManifest?.(msg.meta);
}

export function handleProjectError(msg, deps) {
  deps.chat.addErrorLog(msg.error);
}
