import { useCallback, useEffect, useRef, useState } from "react";
import KeyframeManager from "../engine/KeyframeManager.js";

export default function useKeyframes(engineRef) {
  // Lazy-init keyframe manager (restore from localStorage)
  const keyframeManagerRef = useRef(() => {
    const km = new KeyframeManager();
    try {
      const raw = localStorage.getItem("siljangnim:keyframes");
      if (raw) {
        const tracks = JSON.parse(raw);
        for (const [uniform, kfs] of Object.entries(tracks)) {
          km.setTrack(uniform, kfs);
        }
      }
    } catch {}
    return km;
  });
  if (typeof keyframeManagerRef.current === "function") {
    keyframeManagerRef.current = keyframeManagerRef.current();
  }

  const [keyframeVersion, setKeyframeVersion] = useState(0);
  const [keyframeEditorTarget, setKeyframeEditorTarget] = useState(null);

  // Undo/redo history
  const kfHistoryRef = useRef({ past: [], future: [] });
  const kfEditorOpenRef = useRef(false);
  kfEditorOpenRef.current = keyframeEditorTarget != null;

  // Connect keyframe manager to engine
  useEffect(() => {
    const engine = engineRef.current;
    if (engine) engine.setKeyframeManager(keyframeManagerRef.current);
  });

  // Persist keyframes to localStorage
  useEffect(() => {
    if (keyframeVersion > 0) {
      localStorage.setItem(
        "siljangnim:keyframes",
        JSON.stringify(keyframeManagerRef.current.tracks)
      );
    }
  }, [keyframeVersion]);

  const undoKeyframes = useCallback(() => {
    const h = kfHistoryRef.current;
    if (h.past.length === 0) return;
    const entry = h.past.pop();
    const km = keyframeManagerRef.current;
    const currentKfs = km.getTrack(entry.uniform);
    h.future.push({ uniform: entry.uniform, keyframes: [...currentKfs] });
    if (entry.keyframes.length === 0) {
      km.clearTrack(entry.uniform);
    } else {
      km.setTrack(entry.uniform, entry.keyframes);
    }
    setKeyframeVersion((v) => v + 1);
  }, []);

  const redoKeyframes = useCallback(() => {
    const h = kfHistoryRef.current;
    if (h.future.length === 0) return;
    const entry = h.future.pop();
    const km = keyframeManagerRef.current;
    const currentKfs = km.getTrack(entry.uniform);
    h.past.push({ uniform: entry.uniform, keyframes: [...currentKfs] });
    if (entry.keyframes.length === 0) {
      km.clearTrack(entry.uniform);
    } else {
      km.setTrack(entry.uniform, entry.keyframes);
    }
    setKeyframeVersion((v) => v + 1);
  }, []);

  const handleOpenKeyframeEditor = useCallback((ctrl) => {
    setKeyframeEditorTarget({
      uniform: ctrl.uniform,
      label: ctrl.label,
      min: ctrl.min ?? 0,
      max: ctrl.max ?? 1,
    });
  }, []);

  const handleKeyframesChange = useCallback(
    (newKeyframes) => {
      if (!keyframeEditorTarget) return;
      const km = keyframeManagerRef.current;
      const uniform = keyframeEditorTarget.uniform;
      const prevKfs = km.getTrack(uniform);
      kfHistoryRef.current.past.push({ uniform, keyframes: [...prevKfs] });
      if (kfHistoryRef.current.past.length > 50) kfHistoryRef.current.past.shift();
      kfHistoryRef.current.future.length = 0;

      if (newKeyframes.length === 0) {
        km.clearTrack(uniform);
      } else {
        km.setTrack(uniform, newKeyframes);
      }
      setKeyframeVersion((v) => v + 1);
    },
    [keyframeEditorTarget]
  );

  const handlePanelKeyframesChange = useCallback((uniform, keyframes) => {
    const km = keyframeManagerRef.current;
    const prevKfs = km.getTrack(uniform);
    kfHistoryRef.current.past.push({ uniform, keyframes: [...prevKfs] });
    if (kfHistoryRef.current.past.length > 50) kfHistoryRef.current.past.shift();
    kfHistoryRef.current.future.length = 0;

    if (!keyframes || keyframes.length === 0) {
      km.clearTrack(uniform);
    } else {
      km.setTrack(uniform, keyframes);
    }
    setKeyframeVersion((v) => v + 1);
  }, []);

  // Unified restore: clears existing tracks and sets new ones
  const restoreKeyframes = useCallback((wsKeyframes) => {
    const km = keyframeManagerRef.current;
    for (const u of Object.keys(km.tracks)) km.clearTrack(u);
    if (wsKeyframes && typeof wsKeyframes === "object") {
      for (const [u, kfs] of Object.entries(wsKeyframes)) {
        km.setTrack(u, kfs);
      }
    }
    setKeyframeVersion((v) => v + 1);
  }, []);

  const resetKeyframes = useCallback(() => {
    const km = keyframeManagerRef.current;
    for (const u of Object.keys(km.tracks)) km.clearTrack(u);
    setKeyframeVersion((v) => v + 1);
  }, []);

  const getKeyframeTracks = useCallback(() => {
    return keyframeManagerRef.current.tracks;
  }, []);

  const closeEditor = useCallback(() => {
    setKeyframeEditorTarget(null);
  }, []);

  return {
    keyframeManagerRef,
    keyframeVersion,
    keyframeEditorTarget,
    isEditorOpen: kfEditorOpenRef,
    undoKeyframes,
    redoKeyframes,
    handleOpenKeyframeEditor,
    handleKeyframesChange,
    handlePanelKeyframesChange,
    restoreKeyframes,
    resetKeyframes,
    getKeyframeTracks,
    closeEditor,
  };
}
