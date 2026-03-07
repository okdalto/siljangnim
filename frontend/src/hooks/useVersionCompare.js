import { useCallback, useRef, useState } from "react";
import * as storage from "../engine/storage.js";
import { reconstructScene } from "../engine/projectTree.js";
import { compareStates, generateDiffSummary, generateAIDiffSummary } from "../engine/versionCompare.js";

/**
 * React hook for managing version comparison between two tree nodes.
 */
export default function useVersionCompare(apiKeyRef) {
  const [isComparing, setIsComparing] = useState(false);
  const [compareResult, setCompareResult] = useState(null);
  const [compareLoading, setCompareLoading] = useState(false);
  // For multi-select compare flow in sidebar
  const [compareSourceId, setCompareSourceId] = useState(null);
  // Track comparison generation to discard stale AI summaries
  const compareGenRef = useRef(0);

  /**
   * Start compare mode — user selects first node, then picks second.
   */
  const startCompare = useCallback((sourceNodeId) => {
    setCompareSourceId(sourceNodeId);
  }, []);

  /**
   * Cancel compare mode.
   */
  const cancelCompare = useCallback(() => {
    setCompareSourceId(null);
    setCompareResult(null);
    setIsComparing(false);
  }, []);

  /**
   * Execute comparison between two nodes.
   */
  const executeCompare = useCallback(async (nodeIdA, nodeIdB, projectName) => {
    const gen = ++compareGenRef.current;
    setCompareLoading(true);
    setIsComparing(true);
    try {
      const [stateA, stateB] = await Promise.all([
        reconstructScene(nodeIdA, projectName),
        reconstructScene(nodeIdB, projectName),
      ]);
      const [nodeA, nodeB] = await Promise.all([
        storage.readNode(nodeIdA),
        storage.readNode(nodeIdB),
      ]);

      // Load thumbnails
      const [thumbA, thumbB] = await Promise.all([
        storage.readNodeThumbnailUrl(projectName, nodeIdA),
        storage.readNodeThumbnailUrl(projectName, nodeIdB),
      ]);

      const result = compareStates(stateA, stateB, nodeA, nodeB);
      result.thumbnailA = thumbA;
      result.thumbnailB = thumbB;
      result.diffSummary = generateDiffSummary(result);

      // Discard if a newer comparison was started while we were loading
      if (gen !== compareGenRef.current) return;

      setCompareResult(result);
      setCompareSourceId(null);

      // Kick off AI summary in background
      const apiKey = apiKeyRef?.current?.key || "";
      if (apiKey) {
        generateAIDiffSummary(result, apiKey).then(aiSummary => {
          // Only apply if this is still the active comparison
          if (gen !== compareGenRef.current) return;
          setCompareResult(prev => prev ? { ...prev, diffSummary: aiSummary } : prev);
        }).catch(() => {});
      }
    } catch (err) {
      if (gen !== compareGenRef.current) return;
      console.error("Compare failed:", err);
      setCompareResult(null);
    } finally {
      if (gen === compareGenRef.current) setCompareLoading(false);
    }
  }, []);

  /**
   * Handle second node selection in compare flow.
   */
  const selectCompareTarget = useCallback((targetNodeId, projectName) => {
    if (!compareSourceId || compareSourceId === targetNodeId) return;
    executeCompare(compareSourceId, targetNodeId, projectName);
  }, [compareSourceId, executeCompare]);

  return {
    isComparing,
    compareResult,
    compareLoading,
    compareSourceId,
    startCompare,
    cancelCompare,
    executeCompare,
    selectCompareTarget,
  };
}
