/**
 * Global registry for panel-to-panel broadcast messaging.
 * Shared between CustomPanelNode and HtmlControl without circular deps.
 */

const _activePanelIframes = new Set();

export function registerPanelIframe(iframe) {
  _activePanelIframes.add(iframe);
}

export function unregisterPanelIframe(iframe) {
  _activePanelIframes.delete(iframe);
}

export function relayBroadcast(channel, data, sourceIframe) {
  for (const iframe of _activePanelIframes) {
    if (iframe === sourceIframe || !iframe.contentWindow) continue;
    try {
      iframe.contentWindow.postMessage(
        { type: "panel:channelMessage", channel, data },
        window.location.origin
      );
    } catch { /* cross-origin or disposed iframe */ }
  }
}
