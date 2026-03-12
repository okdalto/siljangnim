export function handleOpenPanel(msg, deps) {
  deps.panels.openPanel(msg.id, msg);
}

export function handleClosePanel(msg, deps) {
  deps.panels.closePanel(msg.id);
}
