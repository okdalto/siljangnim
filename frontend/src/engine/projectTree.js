/**
 * Project Tree — core logic for tree-based version history.
 *
 * Manages ProjectNode CRUD, snapshot/patch storage, tree traversal,
 * and scene reconstruction from checkpoint + patch chain.
 */

import { diff, apply } from "./jsonPatch.js";
import * as storage from "./storage.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHECKPOINT_INTERVAL = 10; // full snapshot every N nodes
const MAX_PATCH_CHAIN = 15;     // force checkpoint if chain exceeds this

// ---------------------------------------------------------------------------
// Snapshot helpers
// ---------------------------------------------------------------------------

function buildSnapshot({ scene_json, ui_config, workspace_state, panels, chat_history, debug_logs, workspace_files, asset_manifest } = {}) {
  const snap = {
    version: 2,
    scene_json: scene_json || {},
    ui_config: ui_config || {},
    workspace_state: workspace_state || {},
    panels: panels || {},
    chat_history: chat_history || [],
    debug_logs: debug_logs || [],
  };
  if (workspace_files != null) snap.workspace_files = workspace_files;
  if (asset_manifest != null) snap.asset_manifest = asset_manifest;
  return snap;
}

// ---------------------------------------------------------------------------
// Workspace / asset capture helpers
// ---------------------------------------------------------------------------

async function captureWorkspaceFiles() {
  const files = await storage.listFiles(".workspace/");
  const result = {};
  for (const path of files) {
    try {
      result[path] = await storage.readTextFile(path);
    } catch { /* skip */ }
  }
  return result;
}

async function captureAssetManifest() {
  const filenames = await storage.listUploads();
  const manifest = {};
  for (const filename of filenames) {
    try {
      const { data, mimeType } = await storage.readUpload(filename);
      const hash = await storage.computeSHA256(data);
      manifest[filename] = { hash, mimeType };
      await storage.saveCASBlob(hash, data, mimeType);
    } catch { /* skip */ }
  }
  return manifest;
}

async function captureAndBuildSnapshot(currentState) {
  const workspace_files = await captureWorkspaceFiles();
  const asset_manifest = await captureAssetManifest();
  return buildSnapshot({ ...currentState, workspace_files, asset_manifest });
}

// ---------------------------------------------------------------------------
// Tree traversal
// ---------------------------------------------------------------------------

/**
 * Walk from `nodeId` toward the root, collecting the chain.
 * Returns [checkpoint, ...patches, target] in root-to-leaf order.
 */
async function walkToCheckpoint(nodeId) {
  const chain = [];
  let currentId = nodeId;
  const visited = new Set();

  while (currentId) {
    if (visited.has(currentId)) {
      console.warn(`[projectTree] Cycle detected at node ${currentId}, breaking chain`);
      break;
    }
    visited.add(currentId);

    const node = await storage.readNode(currentId);
    if (!node) {
      console.warn(`[projectTree] Missing node ${currentId} in chain, stopping walk`);
      break;
    }
    chain.unshift(node);
    if (node.isCheckpoint) break;
    currentId = node.parentId;
  }

  return chain;
}

/**
 * Count the number of patch nodes between a node and its nearest ancestor checkpoint.
 */
async function patchChainLength(parentId) {
  let count = 0;
  let currentId = parentId;
  while (currentId) {
    const node = await storage.readNode(currentId);
    if (!node || node.isCheckpoint) break;
    count++;
    currentId = node.parentId;
  }
  return count;
}

/**
 * Count total nodes in project.
 */
async function nodeCount(projectName) {
  const nodes = await storage.listProjectNodes(projectName);
  return nodes.length;
}

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

/**
 * Ensure a root node exists for the given project (lazy migration).
 * If no nodes exist, creates a root checkpoint from the current project state.
 */
export async function ensureRootNode(projectName, currentState) {
  const nodes = await storage.listProjectNodes(projectName);
  if (nodes.length > 0) {
    const root = nodes.find((n) => n.parentId === null);
    if (root) return root;
    // No root node found — orphaned tree. Pick a checkpoint if available,
    // otherwise fall back to the oldest node and promote it to root.
    const checkpoint = nodes.find((n) => n.isCheckpoint);
    const fallback = checkpoint || [...nodes].sort((a, b) => a.createdAt - b.createdAt)[0];
    console.warn(`[projectTree] No root node in project "${projectName}", promoting node ${fallback.id}`);
    fallback.parentId = null;
    fallback.isCheckpoint = true;
    if (!fallback.snapshotRef) {
      // Generate a snapshot for the promoted node
      try {
        const state = await reconstructFromChain([fallback]);
        const snapshotRef = `_snapshots/${fallback.id}.json`;
        await storage.writeFile(snapshotRef, state);
        fallback.snapshotRef = snapshotRef;
      } catch {
        // If reconstruction fails, create empty snapshot
        const snapshotRef = `_snapshots/${fallback.id}.json`;
        await storage.writeFile(snapshotRef, buildSnapshot({}));
        fallback.snapshotRef = snapshotRef;
      }
    }
    await storage.writeNode(fallback);
    return fallback;
  }

  // Create root checkpoint
  const nodeId = crypto.randomUUID();
  const snapshot = await captureAndBuildSnapshot(currentState);

  const snapshotKey = `_snapshots/${nodeId}.json`;
  await storage.writeFile(snapshotKey, snapshot);

  const node = {
    id: nodeId,
    projectName,
    parentId: null,
    type: "prompt_node",
    title: "Initial State",
    prompt: null,
    summary: null,
    createdAt: Date.now(),
    isCheckpoint: true,
    snapshotRef: snapshotKey,
    patchRef: null,
    thumbnailRef: null,
    tags: [],
    metadata: {},
  };

  await storage.writeNode(node);
  return node;
}

/**
 * Create a new node after a prompt is completed.
 *
 * @param {string} projectName
 * @param {string} parentNodeId - current active node
 * @param {object} currentState - { scene_json, ui_config, workspace_state, panels, chat_history, debug_logs }
 * @param {object} opts - { title, prompt, type, thumbnailDataUrl }
 * @returns {object} the created ProjectNode
 */
export async function createNodeAfterPrompt(projectName, parentNodeId, currentState, opts = {}) {
  const nodeId = crypto.randomUUID();
  const {
    title = "Untitled",
    prompt = null,
    type = "prompt_node",
    thumbnailDataUrl = null,
  } = opts;

  const currentSnapshot = await captureAndBuildSnapshot(currentState);

  // Determine if this should be a checkpoint
  const count = await nodeCount(projectName);
  const chainLen = parentNodeId ? await patchChainLength(parentNodeId) : 0;
  const shouldCheckpoint =
    !parentNodeId ||
    count % CHECKPOINT_INTERVAL === 0 ||
    chainLen >= MAX_PATCH_CHAIN;

  let snapshotRef = null;
  let patchRef = null;

  if (shouldCheckpoint) {
    // Store full snapshot
    snapshotRef = `_snapshots/${nodeId}.json`;
    await storage.writeFile(snapshotRef, currentSnapshot);
  } else {
    // Store patch relative to parent
    const parentChain = await walkToCheckpoint(parentNodeId);
    const parentSnapshot = await reconstructFromChain(parentChain);
    const ops = diff(parentSnapshot, currentSnapshot);

    if (ops.length === 0) {
      // No changes — still create node but as checkpoint for simplicity
      snapshotRef = `_snapshots/${nodeId}.json`;
      await storage.writeFile(snapshotRef, currentSnapshot);
    } else {
      patchRef = `_patches/${nodeId}.json`;
      await storage.writeFile(patchRef, {
        version: 1,
        parentNodeId,
        ops,
      });
    }
  }

  // Save thumbnail
  if (thumbnailDataUrl) {
    await storage.writeNodeThumbnail(projectName, nodeId, thumbnailDataUrl);
  }

  const node = {
    id: nodeId,
    projectName,
    parentId: parentNodeId,
    type,
    title,
    prompt,
    summary: null,
    createdAt: Date.now(),
    isCheckpoint: shouldCheckpoint || !patchRef,
    snapshotRef: snapshotRef,
    patchRef: patchRef,
    thumbnailRef: thumbnailDataUrl ? `_thumbs/${nodeId}.jpg` : null,
    tags: [],
    metadata: {},
  };

  await storage.writeNode(node);
  return node;
}

/**
 * Overwrite an existing node's state (update in-place instead of creating child).
 */
export async function overwriteNode(nodeId, projectName, currentState, opts = {}) {
  const node = await storage.readNode(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);

  const snapshot = await captureAndBuildSnapshot(currentState);

  // Always store as checkpoint when overwriting
  const snapshotRef = `_snapshots/${nodeId}.json`;
  await storage.writeFile(snapshotRef, snapshot);

  // Update thumbnail if provided
  if (opts.thumbnailDataUrl) {
    await storage.writeNodeThumbnail(projectName, nodeId, opts.thumbnailDataUrl);
    node.thumbnailRef = `_thumbs/${nodeId}.jpg`;
  }

  node.isCheckpoint = true;
  node.snapshotRef = snapshotRef;
  node.patchRef = null;
  if (opts.prompt) node.prompt = opts.prompt;
  if (opts.title) node.title = opts.title;

  await storage.writeNode(node);
  return node;
}

/**
 * Create a branch from an existing node (fork point).
 * Returns the branch node (same state as source but new ID).
 */
export async function createBranch(projectName, sourceNodeId, title = "Branch") {
  const sourceState = await reconstructScene(sourceNodeId, projectName);
  const node = await createNodeAfterPrompt(projectName, sourceNodeId, sourceState, {
    title,
    type: "prompt_node",
  });
  return node;
}

/**
 * Duplicate a node as a new checkpoint (for pinning).
 */
export async function duplicateAsCheckpoint(projectName, sourceNodeId) {
  const state = await reconstructScene(sourceNodeId, projectName);
  const nodeId = crypto.randomUUID();
  const snapshotRef = `_snapshots/${nodeId}.json`;
  await storage.writeFile(snapshotRef, state);

  const sourceNode = await storage.readNode(sourceNodeId);
  const node = {
    ...sourceNode,
    id: nodeId,
    parentId: sourceNodeId,
    isCheckpoint: true,
    snapshotRef,
    patchRef: null,
    createdAt: Date.now(),
    tags: [...(sourceNode.tags || [])],
  };
  await storage.writeNode(node);
  return node;
}

/**
 * Rename a node.
 */
export async function renameNode(nodeId, newTitle) {
  const node = await storage.readNode(nodeId);
  node.title = newTitle;
  await storage.writeNode(node);
  return node;
}

/**
 * Toggle a tag on a node.
 */
export async function toggleNodeTag(nodeId, tag) {
  const node = await storage.readNode(nodeId);
  const idx = node.tags.indexOf(tag);
  if (idx >= 0) {
    node.tags.splice(idx, 1);
  } else {
    node.tags.push(tag);
  }
  await storage.writeNode(node);
  return node;
}

// ---------------------------------------------------------------------------
// Scene reconstruction
// ---------------------------------------------------------------------------

/**
 * Reconstruct the full scene state at a given chain of nodes
 * (first node must be a checkpoint).
 */
async function reconstructFromChain(chain) {
  if (chain.length === 0) {
    return buildSnapshot({});
  }

  const checkpoint = chain[0];
  if (!checkpoint.isCheckpoint || !checkpoint.snapshotRef) {
    console.warn(`[projectTree] Chain root is not a checkpoint: ${checkpoint.id}, returning empty state`);
    return buildSnapshot({});
  }

  let state;
  try {
    state = await storage.readFile(checkpoint.snapshotRef);
  } catch (err) {
    console.warn(`[projectTree] Failed to read snapshot for ${checkpoint.id}: ${err.message}`);
    return buildSnapshot({});
  }
  if (!state) {
    console.warn(`[projectTree] Snapshot is null for ${checkpoint.id}`);
    return buildSnapshot({});
  }

  // Apply patches in order
  for (let i = 1; i < chain.length; i++) {
    const node = chain[i];
    if (node.isCheckpoint && node.snapshotRef) {
      try {
        state = await storage.readFile(node.snapshotRef);
      } catch {
        console.warn(`[projectTree] Failed to read snapshot for chain node ${node.id}, skipping`);
      }
    } else if (node.patchRef) {
      try {
        const patch = await storage.readFile(node.patchRef);
        if (patch?.ops) {
          state = apply(structuredClone(state), patch.ops);
        }
      } catch {
        console.warn(`[projectTree] Failed to read/apply patch for node ${node.id}, skipping`);
      }
    }
  }

  return state;
}

/**
 * Reconstruct the full scene state at a given node.
 *
 * Algorithm:
 * 1. Walk from target to nearest ancestor checkpoint
 * 2. Load checkpoint snapshot
 * 3. Apply each patch in order
 * 4. Return final state
 */
export async function reconstructScene(nodeId, projectName) {
  const chain = await walkToCheckpoint(nodeId);
  return reconstructFromChain(chain);
}

// ---------------------------------------------------------------------------
// Workspace / asset sync (restore-time)
// ---------------------------------------------------------------------------

export async function syncWorkspaceFiles(snapshotFiles) {
  if (!snapshotFiles) return; // v1 snapshot — backwards compat
  const currentFiles = await storage.listFiles(".workspace/");
  // Delete files not in snapshot
  for (const path of currentFiles) {
    if (!(path in snapshotFiles)) await storage.deleteFile(path);
  }
  // Add/update files from snapshot
  for (const [path, content] of Object.entries(snapshotFiles)) {
    await storage.writeTextFile(path, content);
  }
}

export async function syncAssetManifest(snapshotManifest) {
  if (!snapshotManifest) return; // v1 snapshot — backwards compat
  const currentUploads = await storage.listUploads();
  // Delete uploads not in manifest
  for (const filename of currentUploads) {
    if (!(filename in snapshotManifest)) await storage.deleteUpload(filename);
  }
  // Restore uploads from CAS
  for (const [filename, { hash, mimeType }] of Object.entries(snapshotManifest)) {
    const blob = await storage.readCASBlob(hash);
    if (blob) {
      await storage.saveUpload(filename, blob.data, mimeType);
    } else {
      console.warn(`[projectTree] CAS blob missing for ${filename} (hash: ${hash})`);
    }
  }
}

// ---------------------------------------------------------------------------
// Auto-summary and metadata extraction
// ---------------------------------------------------------------------------

/**
 * Extract metadata from a scene state snapshot.
 */
export function extractMetadata(state) {
  const scene = state.scene_json || {};
  const ws = state.workspace_state || {};
  const ui = state.ui_config || {};

  const uniforms = scene.uniforms || {};
  const uniformKeys = Object.keys(uniforms);

  // Count shaders (script sections)
  let shaderCount = 0;
  if (scene.script) {
    if (scene.script.setup) shaderCount++;
    if (scene.script.render) shaderCount++;
    if (scene.script.cleanup) shaderCount++;
  }

  // Check for assets (uploads referenced in code)
  const code = [scene.script?.setup, scene.script?.render, scene.script?.cleanup].filter(Boolean).join("\n");
  const assetCount = (code.match(/uploads\//g) || []).length;

  // Check features
  const hasTimeline = !!(ws.keyframes && Object.keys(ws.keyframes).length > 0);
  const hasAudioReactive = uniformKeys.some((k) => k.includes("audio") || k.includes("fft") || k.includes("beat"));
  const hasTracking = uniformKeys.some((k) => k.includes("face") || k.includes("hand") || k.includes("pose") || k.includes("track"));
  const has3D = code.includes("mat4") || code.includes("perspective") || code.includes("gl_Position") || code.includes("DEPTH_BUFFER_BIT");

  return {
    shaderCount,
    assetCount,
    hasTimeline,
    hasAudioReactive,
    hasTracking,
    has3D,
    uniformCount: uniformKeys.length,
    controlCount: (ui.controls || []).length,
    backendTarget: scene.backendTarget || "auto",
  };
}

/**
 * Generate a summary from the last assistant message in chat history.
 */
export function extractSummary(chatHistory) {
  if (!chatHistory || chatHistory.length === 0) return null;

  // Find the last assistant message
  for (let i = chatHistory.length - 1; i >= 0; i--) {
    const msg = chatHistory[i];
    if (msg.role === "assistant") {
      const text = msg.text || msg.content || "";
      // Take first 200 chars as summary
      return text.slice(0, 200).replace(/\n/g, " ").trim() || null;
    }
  }
  return null;
}

/**
 * Auto-generate tags from metadata.
 */
export function autoTags(metadata) {
  const tags = [];
  if (metadata.has3D) tags.push("3D");
  if (metadata.hasAudioReactive) tags.push("audio-reactive");
  if (metadata.hasTimeline) tags.push("animated");
  if (metadata.hasTracking) tags.push("tracking");
  if (metadata.shaderCount > 3) tags.push("multi-shader");
  if (metadata.assetCount > 0) tags.push("assets");
  return tags;
}

/**
 * Update a node's summary, metadata, and auto-tags.
 */
export async function updateNodeMetadata(nodeId, state, opts = {}) {
  try {
    const node = await storage.readNode(nodeId);
    const metadata = extractMetadata(state);
    const summary = extractSummary(state.chat_history);
    const tags = autoTags(metadata);

    node.metadata = metadata;
    if (summary) node.summary = summary;
    // Merge auto-tags with existing user tags (like "favorite")
    const AUTO_TAG_SET = new Set(["3D", "audio-reactive", "animated", "tracking", "multi-shader", "assets"]);
    const existingUserTags = (node.tags || []).filter((t) => !AUTO_TAG_SET.has(t));
    node.tags = [...new Set([...existingUserTags, ...tags])];

    await storage.writeNode(node);

    // Generate AI title in background (non-blocking)
    if (opts.generateTitle !== false) {
      generateAITitle(node, state.chat_history).then(() => {
        opts.onTitleUpdated?.();
      }).catch(() => {});
    }

    return node;
  } catch {
    return null;
  }
}

function extractLastExchange(chatHistory) {
  let userPrompt = null, assistantResponse = null;
  for (let i = chatHistory.length - 1; i >= 0; i--) {
    if (!assistantResponse && chatHistory[i]?.role === "assistant")
      assistantResponse = (chatHistory[i].text || chatHistory[i].content || "").slice(0, 300);
    if (!userPrompt && chatHistory[i]?.role === "user")
      userPrompt = (chatHistory[i].text || chatHistory[i].content || "").slice(0, 300);
    if (userPrompt && assistantResponse) break;
  }
  return { userPrompt, assistantResponse };
}

async function callSmallLLM({ system, userContent, maxTokens }) {
  const apiKey = sessionStorage.getItem("siljangnim:apiKey") || "";
  if (!apiKey) return null;
  const provider = sessionStorage.getItem("siljangnim:provider") || "anthropic";
  let providerConfig = {};
  try { providerConfig = JSON.parse(sessionStorage.getItem("siljangnim:providerConfig") || "{}"); } catch {}
  const { callLLM, getSmallModel } = await import("./llmClient.js");
  const model = getSmallModel(provider) || providerConfig.model || "claude-haiku-4-5-20251001";
  const result = await callLLM({
    provider, apiKey, baseUrl: providerConfig.base_url, model, maxTokens, system,
    messages: [{ role: "user", content: userContent }], tools: [],
  });
  return result.contentBlocks?.find(b => b.type === "text")?.text?.trim() || null;
}

/**
 * Use AI to generate a concise title summarizing the prompt interaction.
 */
async function generateAITitle(node, chatHistory) {
  try {
    const { userPrompt, assistantResponse } = extractLastExchange(chatHistory);
    if (!userPrompt && !assistantResponse) return;

    const titleText = await callSmallLLM({
      system: "Generate a very short title (under 40 chars, no quotes) summarizing what was done in this creative coding interaction. Write in the same language as the user prompt. Be specific about the visual/technical change, not generic.",
      userContent: `User asked: ${userPrompt || "(no prompt)"}\nAssistant did: ${assistantResponse || "(no response)"}`,
      maxTokens: 40,
    });

    if (titleText && titleText.length > 0) {
      const cleanTitle = titleText.replace(/^["']|["']$/g, "").slice(0, 60);
      node.title = cleanTitle;
      await storage.writeNode(node);
    }
  } catch {
    // AI title generation is non-critical
  }
}

/**
 * Generate a concise AI project name from chat history.
 * Returns null on failure so callers can fall back to their own naming.
 */
export async function generateProjectName(chatHistory) {
  try {
    const { userPrompt, assistantResponse } = extractLastExchange(chatHistory);
    if (!userPrompt && !assistantResponse) return null;

    const text = await callSmallLLM({
      system: "Extract the core topic from the user's request as a 2-5 word label. No quotes, no explanation. Same language as user.",
      userContent: userPrompt || "(no prompt)",
      maxTokens: 12,
    });

    if (text && text.length > 0) {
      return text.replace(/^["']|["']$/g, "").slice(0, 20);
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Tree utilities
// ---------------------------------------------------------------------------

/**
 * Build a tree structure from flat node list.
 * Returns { roots: [...], childrenMap: Map<parentId, children[]> }
 */
export function buildTree(nodes) {
  const childrenMap = new Map();
  const roots = [];

  // Sort by createdAt for consistent ordering
  const sorted = [...nodes].sort((a, b) => a.createdAt - b.createdAt);

  for (const node of sorted) {
    if (!childrenMap.has(node.id)) {
      childrenMap.set(node.id, []);
    }
    if (node.parentId === null) {
      roots.push(node);
    } else {
      if (!childrenMap.has(node.parentId)) {
        childrenMap.set(node.parentId, []);
      }
      childrenMap.get(node.parentId).push(node);
    }
  }

  return { roots, childrenMap };
}

/**
 * Get all ancestor IDs from a node to root.
 */
export function getAncestorIds(nodeId, nodesMap) {
  const ancestors = [];
  let currentId = nodeId;
  while (currentId) {
    const node = nodesMap.get(currentId);
    if (!node) break;
    ancestors.push(currentId);
    currentId = node.parentId;
  }
  return ancestors;
}

/**
 * Get all descendant IDs of a node (for deletion).
 */
export function getDescendantIds(nodeId, childrenMap) {
  const descendants = [];
  const stack = [nodeId];
  while (stack.length > 0) {
    const id = stack.pop();
    const children = childrenMap.get(id) || [];
    for (const child of children) {
      descendants.push(child.id);
      stack.push(child.id);
    }
  }
  return descendants;
}

/**
 * Delete a node and all its descendants.
 */
export async function deleteNodeTree(nodeId, projectName) {
  const allNodes = await storage.listProjectNodes(projectName);
  const { childrenMap } = buildTree(allNodes);
  const idsToDelete = [nodeId, ...getDescendantIds(nodeId, childrenMap)];

  for (const id of idsToDelete) {
    try {
      const node = await storage.readNode(id);
      // Clean up snapshot/patch files
      if (node.snapshotRef) {
        try { await storage.deleteFile(node.snapshotRef); } catch { /* ok */ }
      }
      if (node.patchRef) {
        try { await storage.deleteFile(node.patchRef); } catch { /* ok */ }
      }
      await storage.deleteNode(id);
    } catch { /* node might already be deleted */ }
  }

  return idsToDelete;
}
