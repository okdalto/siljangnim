import { useState, useCallback, useRef } from "react";
import {
  createAssetDescriptor,
  categoryFromFilename,
  buildTechInfo,
  ASSET_CATEGORY,
} from "../engine/assetDescriptor.js";

function buildAISummaryPrompt(category, filename, techInfo, metadata) {
  const parts = [`Asset: "${filename}" (${category})`];
  if (techInfo) {
    const entries = Object.entries(techInfo).filter(([, v]) => v != null && v !== "").slice(0, 8);
    if (entries.length) parts.push(`Technical info: ${entries.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(", ")}`);
  }
  parts.push("Describe this asset briefly for a creative coding/graphics tool. What is it and how might it be used?");
  return parts.join("\n");
}

/**
 * Manages Asset Node state: descriptors, creation, updates, actions.
 *
 * Assets are stored as a Map<assetId, AssetDescriptor>.
 * Each asset corresponds to a ReactFlow node of type "assetNode".
 */
export default function useAssetNodes() {
  const [assets, setAssets] = useState(() => new Map());
  const [selectedAssetId, setSelectedAssetId] = useState(null);
  const assetsRef = useRef(assets);
  assetsRef.current = assets;

  // ---- Create asset from uploaded file ----

  const createAsset = useCallback((filename, opts = {}) => {
    const id = `asset_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const descriptor = createAssetDescriptor(id, filename, {
      mimeType: opts.mimeType || "application/octet-stream",
      fileSize: opts.fileSize || 0,
      ...opts,
    });
    setAssets((prev) => {
      const next = new Map(prev);
      next.set(id, descriptor);
      return next;
    });
    return id;
  }, []);

  // ---- Auto-process an asset after creation ----

  const autoProcessAsset = useCallback(async (assetId, filename, mimeType) => {
    try {
      const { processAsset } = await import("../engine/assetProcessor.js");
      const storageModule = await import("../engine/storage.js");

      // Read the uploaded blob
      let data;
      try {
        const entry = await storageModule.readUpload(filename);
        data = entry.data;
      } catch {
        return; // File not in blob store — skip processing
      }

      // Mark as processing
      setAssets((prev) => {
        const desc = prev.get(assetId);
        if (!desc) return prev;
        const next = new Map(prev);
        next.set(assetId, { ...desc, processingStatus: "processing" });
        return next;
      });

      const result = await processAsset(filename, data, mimeType);

      // Apply processor results
      const category = categoryFromFilename(filename);
      const techInfo = buildTechInfo(category, result.metadata || {});

      // Create preview URL from blob data for visual categories
      let previewUrl = null;
      let thumbnailUrl = null;

      if (
        category === ASSET_CATEGORY.IMAGE ||
        category === ASSET_CATEGORY.VIDEO ||
        category === ASSET_CATEGORY.AUDIO ||
        category === ASSET_CATEGORY.SVG
      ) {
        previewUrl = URL.createObjectURL(new Blob([data], { type: mimeType }));
      }

      // For video, extract captured thumbnail from processor outputs
      if (category === ASSET_CATEGORY.VIDEO) {
        const thumbOutput = (result.outputs || []).find((o) => o.type === "thumbnail");
        if (thumbOutput?.dataUrl) thumbnailUrl = thumbOutput.dataUrl;
      }

      setAssets((prev) => {
        const desc = prev.get(assetId);
        if (!desc) return prev;
        const next = new Map(prev);
        next.set(assetId, {
          ...desc,
          processingStatus: "ready",
          processorOutputs: result.outputs || [],
          processorMetadata: result.metadata || {},
          technicalInfo: techInfo,
          previewUrl: previewUrl || desc.previewUrl,
          thumbnailUrl: thumbnailUrl || desc.thumbnailUrl,
          aiSummary: result.metadata?.aiSummary || null,
          updatedAt: new Date().toISOString(),
        });
        return next;
      });

      // Generate AI summary in background (non-blocking)
      try {
        const apiKey = sessionStorage.getItem("siljangnim:apiKey") || "";
        if (apiKey && category) {
          const summaryPrompt = buildAISummaryPrompt(category, filename, techInfo, result.metadata);
          const { callAnthropic } = await import("../engine/anthropicClient.js");
          const summaryResult = await callAnthropic({
            apiKey,
            model: "claude-haiku-4-5-20251001",
            maxTokens: 100,
            system: "You describe uploaded creative assets in 1-2 concise sentences for a graphics tool. Focus on what makes this asset useful for visual creation.",
            messages: [{ role: "user", content: summaryPrompt }],
            tools: [],
          });
          const summaryText = summaryResult.contentBlocks?.find(b => b.type === "text")?.text?.trim();
          if (summaryText) {
            setAssets((prev) => {
              const desc = prev.get(assetId);
              if (!desc) return prev;
              const next = new Map(prev);
              next.set(assetId, { ...desc, aiSummary: summaryText });
              return next;
            });
          }
        }
      } catch { /* AI summary is non-critical */ }
    } catch {
      setAssets((prev) => {
        const desc = prev.get(assetId);
        if (!desc) return prev;
        const next = new Map(prev);
        next.set(assetId, { ...desc, processingStatus: "error" });
        return next;
      });
    }
  }, []);

  // ---- Batch create from upload results ----

  const createAssetsFromUpload = useCallback((savedFiles) => {
    const ids = [];
    const toProcess = [];
    setAssets((prev) => {
      const next = new Map(prev);
      for (const f of savedFiles) {
        const id = `asset_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const mime = f.mime_type || f.mimeType || "application/octet-stream";
        const descriptor = createAssetDescriptor(id, f.name, {
          mimeType: mime,
          fileSize: f.size || 0,
          processingStatus: "pending",
        });
        next.set(id, descriptor);
        ids.push(id);
        toProcess.push({ id, name: f.name, mime });
      }
      return next;
    });

    // Auto-process each uploaded asset
    for (const item of toProcess) {
      autoProcessAsset(item.id, item.name, item.mime);
    }

    return ids;
  }, [autoProcessAsset]);

  // ---- Update descriptor fields ----

  const updateAsset = useCallback((assetId, updates) => {
    setAssets((prev) => {
      const desc = prev.get(assetId);
      if (!desc) return prev;
      const next = new Map(prev);
      next.set(assetId, { ...desc, ...updates, updatedAt: new Date().toISOString() });
      return next;
    });
  }, []);

  // ---- Handle processing status broadcast ----

  const handleProcessingStatus = useCallback((filename, status) => {
    setAssets((prev) => {
      for (const [id, desc] of prev) {
        if (desc.filename === filename) {
          const next = new Map(prev);
          next.set(id, { ...desc, processingStatus: status === "error" ? "error" : "processing" });
          return next;
        }
      }
      return prev;
    });
  }, []);

  // ---- Handle processing complete broadcast ----

  const handleProcessingComplete = useCallback((filename, processor, outputs, metadata) => {
    setAssets((prev) => {
      for (const [id, desc] of prev) {
        if (desc.filename === filename) {
          const category = desc.category || categoryFromFilename(filename);
          const techInfo = buildTechInfo(category, metadata || {});
          const next = new Map(prev);
          next.set(id, {
            ...desc,
            processingStatus: "ready",
            processorOutputs: outputs || [],
            processorMetadata: metadata || {},
            technicalInfo: techInfo,
            updatedAt: new Date().toISOString(),
          });
          return next;
        }
      }
      return prev;
    });
  }, []);

  // ---- Rename ----

  const renameAsset = useCallback((assetId, newName) => {
    updateAsset(assetId, { semanticName: newName });
  }, [updateAsset]);

  // ---- Delete ----

  const deleteAsset = useCallback((assetId) => {
    setAssets((prev) => {
      const next = new Map(prev);
      next.delete(assetId);
      return next;
    });
    setSelectedAssetId((prev) => (prev === assetId ? null : prev));
  }, []);

  // ---- Duplicate ----

  const duplicateAsset = useCallback((assetId) => {
    const desc = assetsRef.current.get(assetId);
    if (!desc) return null;
    const newId = `asset_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const copy = {
      ...desc,
      id: newId,
      semanticName: `${desc.semanticName} (copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setAssets((prev) => {
      const next = new Map(prev);
      next.set(newId, copy);
      return next;
    });
    return newId;
  }, []);

  // ---- Select ----

  const selectAsset = useCallback((assetId) => {
    setSelectedAssetId(assetId);
  }, []);

  // ---- Find asset by filename ----

  const findByFilename = useCallback((filename) => {
    for (const [, desc] of assetsRef.current) {
      if (desc.filename === filename) return desc;
    }
    return null;
  }, []);

  // ---- Serialise / restore for save/load ----

  const serialize = useCallback(() => {
    const obj = {};
    for (const [id, desc] of assetsRef.current) {
      obj[id] = { ...desc };
    }
    return obj;
  }, []);

  const restore = useCallback(async (assetsObj) => {
    const map = new Map();
    if (assetsObj && typeof assetsObj === "object") {
      for (const [id, desc] of Object.entries(assetsObj)) {
        map.set(id, { ...desc, id, previewUrl: null, thumbnailUrl: null });
      }
    }
    setAssets(map);
    setSelectedAssetId(null);

    // Regenerate preview blob URLs and DATA previews from IndexedDB
    if (map.size > 0) {
      try {
        const storageModule = await import("../engine/storage.js");
        const updates = new Map();
        for (const [id, desc] of map) {
          const cat = desc.category || categoryFromFilename(desc.filename);
          if (
            cat === ASSET_CATEGORY.IMAGE ||
            cat === ASSET_CATEGORY.VIDEO ||
            cat === ASSET_CATEGORY.AUDIO ||
            cat === ASSET_CATEGORY.SVG
          ) {
            try {
              const entry = await storageModule.readUpload(desc.filename);
              const url = URL.createObjectURL(new Blob([entry.data], { type: desc.mimeType }));
              updates.set(id, { previewUrl: url });
            } catch { /* file not in store */ }
          } else if (cat === ASSET_CATEGORY.DATA && !desc.technicalInfo?.preview) {
            // Regenerate text preview for DATA files missing it
            try {
              const entry = await storageModule.readUpload(desc.filename);
              const text = new TextDecoder("utf-8").decode(entry.data);
              const ext = (desc.filename.split(".").pop() || "").toLowerCase();
              let preview = text;
              if (ext === "json") {
                try { preview = JSON.stringify(JSON.parse(text), null, 2); } catch { /* raw text */ }
              }
              if (preview.length > 2000) preview = preview.slice(0, 2000) + "\n...";
              const techInfo = { ...(desc.technicalInfo || {}), preview };
              updates.set(id, { technicalInfo: techInfo });
            } catch { /* file not in store */ }
          }
        }
        if (updates.size > 0) {
          setAssets((prev) => {
            const next = new Map(prev);
            for (const [id, upd] of updates) {
              const d = next.get(id);
              if (d) next.set(id, { ...d, ...upd });
            }
            return next;
          });
        }
      } catch { /* storage unavailable */ }
    }
  }, []);

  // ---- Get descriptors for prompt context ----

  const getPromptContext = useCallback(() => {
    const list = [];
    for (const [, desc] of assetsRef.current) {
      list.push({
        id: desc.id,
        filename: desc.filename,
        semanticName: desc.semanticName,
        category: desc.category,
        aiSummary: desc.aiSummary,
        technicalInfo: desc.technicalInfo,
        detectedFeatures: desc.detectedFeatures,
        processingStatus: desc.processingStatus,
      });
    }
    return list;
  }, []);

  // ---- Execute asset action ----
  const executeAction = useCallback((assetId, actionType) => {
    const desc = assetsRef.current.get(assetId);
    if (!desc) return null;

    switch (actionType) {
      case "use_texture":
        return { type: "prompt_suggestion", text: `Use the uploaded file "${desc.filename}" as a texture in the scene. Apply it to the main surface.` };
      case "use_audio":
        return { type: "prompt_suggestion", text: `Make the scene react to the uploaded audio "${desc.filename}". Use its bass, mid, and treble frequencies to drive visual parameters.` };
      case "insert_scene":
        return { type: "prompt_suggestion", text: `Load and display the 3D model "${desc.filename}" in the scene. Set up proper lighting and camera.` };
      case "use_reference":
        return { type: "prompt_suggestion", text: `Use "${desc.semanticName}" (${desc.filename}) as a visual reference. Match its style, colors, and mood in the current scene.` };
      case "rename":
        return { type: "rename", assetId };
      default:
        return null;
    }
  }, []);

  return {
    assets,
    selectedAssetId,
    createAsset,
    createAssetsFromUpload,
    updateAsset,
    handleProcessingStatus,
    handleProcessingComplete,
    renameAsset,
    deleteAsset,
    duplicateAsset,
    selectAsset,
    findByFilename,
    serialize,
    restore,
    getPromptContext,
    executeAction,
  };
}
