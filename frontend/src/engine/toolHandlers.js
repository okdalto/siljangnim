/**
 * Tool handlers — dispatch table.
 * Individual tool implementations are in engine/tools/*.js.
 */

import { toolWriteScene, toolEditScene, toolClearViewport, toolUseTemplate } from "./tools/sceneTools.js";
import { toolReadFile, toolWriteFile, toolListFiles, toolListUploadedFiles, toolDeleteAsset, toolSearchCode, toolUnzipAsset } from "./tools/fileTools.js";
import { toolStartRecording, toolStopRecording, toolGenerateWav, toolCaptureViewport, toolSetTimeline } from "./tools/mediaTools.js";
import { toolOpenPanel, toolClosePanel, toolAskUser } from "./tools/uiTools.js";
import { toolCheckBrowserErrors, toolDebugSubagent, toolInspectViewportState, toolRunPreprocess, toolWebFetch } from "./tools/debugTools.js";

// ---------------------------------------------------------------------------
// Dispatch table
// ---------------------------------------------------------------------------

const TOOL_HANDLERS = {
  read_file: toolReadFile,
  write_scene: toolWriteScene,
  edit_scene: toolEditScene,
  write_file: toolWriteFile,
  list_uploaded_files: toolListUploadedFiles,
  list_files: toolListFiles,
  search_code: toolSearchCode,
  open_panel: toolOpenPanel,
  close_panel: toolClosePanel,
  start_recording: toolStartRecording,
  stop_recording: toolStopRecording,
  generate_wav: toolGenerateWav,
  check_browser_errors: toolCheckBrowserErrors,
  inspect_viewport_state: toolInspectViewportState,
  ask_user: toolAskUser,
  delete_asset: toolDeleteAsset,
  set_timeline: toolSetTimeline,
  run_preprocess: toolRunPreprocess,
  web_fetch: toolWebFetch,
  unzip_asset: toolUnzipAsset,
  capture_viewport: toolCaptureViewport,
  clear_viewport: toolClearViewport,
  debug_with_subagent: toolDebugSubagent,
  use_template: toolUseTemplate,
};

/**
 * Execute a tool call and return the result string.
 *
 * @param {string} name - Tool name
 * @param {Object} inputData - Tool input parameters
 * @param {Function} broadcast - Message dispatch function
 * @param {Object} [context] - Additional context (errorCollector, userAnswerPromise)
 * @returns {Promise<string>} Tool result
 */
export async function handleTool(name, inputData, broadcast, context = {}) {
  const handler = TOOL_HANDLERS[name];
  if (!handler) return `Unknown tool: ${name}`;

  // Mark pending scene load so check_browser_errors waits for it
  if ((name === "write_scene" || name === "edit_scene" || name === "use_template" || (name === "write_file" && (inputData.path === "scene.json"))) && context.errorCollector) {
    // Skip scene load expectation for dry_run — no scene is actually loaded
    if (!(name === "write_scene" && inputData.dry_run)) {
      context.errorCollector.expectSceneLoad();
    }
  }

  return handler(inputData, broadcast, context);
}
