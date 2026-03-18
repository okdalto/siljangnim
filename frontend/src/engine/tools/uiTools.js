/**
 * UI-related tool handlers: panels, user interaction.
 */

import * as storage from "../storage.js";

// ---------------------------------------------------------------------------
// Panel persist helper (internal)
// ---------------------------------------------------------------------------

async function updatePanelStorage(panelId, data) {
  let panels = {};
  try { panels = await storage.readJson("panels.json"); } catch { /* empty */ }
  if (data === null) {
    delete panels[panelId];
  } else {
    panels[panelId] = data;
  }
  await storage.writeJson("panels.json", panels);
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

export async function toolOpenPanel(input, broadcast) {
  const panelId = input.id || "";
  const title = input.title || "Panel";
  const html = input.html || "";
  const template = input.template || "";
  const configObj = input.config || {};
  const width = input.width || 320;
  const height = input.height || 300;

  if (!panelId) return "Error: 'id' is required.";

  // Native controls mode
  if (template === "controls") {
    const controls = configObj.controls || [];
    if (!controls.length) return "Error: config.controls array is required for template='controls'.";

    const panelData = {
      type: "open_panel",
      id: panelId,
      title,
      controls,
      width,
      height,
    };
    broadcast(panelData);

    await updatePanelStorage(panelId, { title, controls, width, height });
    return `ok — native controls panel '${panelId}' opened.`;
  }

  const url = input.url || "";

  if (!html && !url && !template) return "Error: 'html', 'url', or 'template' is required.";

  // URL panel mode
  if (url) {
    // Validate URL scheme — only allow http(s)
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        return `Error: only http/https URLs are allowed (got '${parsed.protocol}').`;
      }
    } catch {
      return `Error: invalid URL '${url}'.`;
    }
    const panelMsg = {
      type: "open_panel",
      id: panelId,
      title,
      url,
      width,
      height,
    };
    broadcast(panelMsg);

    await updatePanelStorage(panelId, { title, url, width, height });
    return `ok — URL panel '${panelId}' opened.`;
  }

  // HTML panel mode
  const panelMsg = {
    type: "open_panel",
    id: panelId,
    title,
    html: html || "",
    width,
    height,
  };
  broadcast(panelMsg);

  await updatePanelStorage(panelId, { title, html: html || "", width, height });
  return `ok — panel '${panelId}' opened.`;
}

export async function toolClosePanel(input, broadcast) {
  const panelId = input.id || "";
  if (!panelId) return "Error: 'id' is required.";
  broadcast({ type: "close_panel", id: panelId });
  try { await updatePanelStorage(panelId, null); } catch { /* ignore */ }
  return `ok — panel '${panelId}' closed.`;
}

/**
 * Ask user tool — returns a promise that resolves when the user answers.
 */
export async function toolAskUser(input, broadcast, ctx) {
  const question = input.question || "";
  const options = input.options || [];

  broadcast({
    type: "agent_question",
    question,
    options,
  });

  // Wait for user response
  const answer = await ctx.userAnswerPromise();
  return `The user answered: ${answer}`;
}
