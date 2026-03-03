import { useCallback, useEffect, useRef } from "react";

let _undoSeq = 0;
export function getUndoSeq() { return ++_undoSeq; }
export function setUndoSeqSource(fn) { _undoSeq = 0; /* shared via getUndoSeq */ }

export default function useUniformHistory(engineRef, sendRef, sceneJSON, uiConfig) {
  const uniformHistoryRef = useRef({ past: [], future: [] });
  const uniformCoalesceRef = useRef({ uniform: null, timer: null });
  const uniformValuesRef = useRef({});

  // Initialize uniform tracking from sceneJSON (live engine values = ground truth).
  useEffect(() => {
    if (sceneJSON?.uniforms) {
      const vals = uniformValuesRef.current;
      for (const [name, def] of Object.entries(sceneJSON.uniforms)) {
        if (def.value !== undefined && !(name in vals)) {
          vals[name] = def.value;
        }
      }
    }
  }, [sceneJSON]);

  // Fallback: controls whose uniform isn't in sceneJSON
  useEffect(() => {
    const vals = uniformValuesRef.current;
    for (const ctrl of uiConfig.controls || []) {
      if (ctrl.uniform && ctrl.default !== undefined && !(ctrl.uniform in vals)) {
        vals[ctrl.uniform] = ctrl.default;
      }
    }
  }, [uiConfig]);

  const resetUniformHistory = useCallback(() => {
    uniformHistoryRef.current = { past: [], future: [] };
    uniformValuesRef.current = {};
    if (uniformCoalesceRef.current.timer) clearTimeout(uniformCoalesceRef.current.timer);
    uniformCoalesceRef.current = { uniform: null, timer: null };
  }, []);

  const _applyUniformExternal = useCallback((uniform, value) => {
    uniformValuesRef.current[uniform] = value;
    if (engineRef.current) engineRef.current.updateUniform(uniform, value);
    sendRef.current?.({ type: "set_uniform", uniform, value });
    window.dispatchEvent(new CustomEvent("uniform-external-change", { detail: { uniform, value } }));
  }, [engineRef, sendRef]);

  const undoUniform = useCallback(() => {
    const h = uniformHistoryRef.current;
    if (h.past.length === 0) return false;
    const entry = h.past.pop();
    h.future.push(entry);
    _applyUniformExternal(entry.uniform, entry.oldValue);
    return true;
  }, [_applyUniformExternal]);

  const redoUniform = useCallback(() => {
    const h = uniformHistoryRef.current;
    if (h.future.length === 0) return false;
    const entry = h.future.pop();
    h.past.push(entry);
    _applyUniformExternal(entry.uniform, entry.newValue);
    return true;
  }, [_applyUniformExternal]);

  return {
    uniformHistoryRef,
    uniformCoalesceRef,
    uniformValuesRef,
    resetUniformHistory,
    undoUniform,
    redoUniform,
  };
}
