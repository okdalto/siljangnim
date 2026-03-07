import { useCallback, useEffect, useRef } from "react";

/**
 * @param {React.RefObject} engineRef - Reference to the WebGL engine
 * @param {React.RefObject} sendRef - Reference to the WebSocket send function
 * @param {Object|null} sceneJSON - Current scene JSON with uniform definitions
 * @param {{ controls: Array }} uiConfig - UI configuration with control definitions
 * @returns {{ uniformHistoryRef: React.RefObject, uniformCoalesceRef: React.RefObject, uniformValuesRef: React.RefObject, resetUniformHistory: Function, undoUniform: Function, redoUniform: Function }}
 */
export default function useUniformHistory(engineRef, sendRef, sceneJSON, uiConfig) {
  const uniformHistoryRef = useRef({ past: [], future: [] });
  const uniformCoalesceRef = useRef({ uniform: null, timer: null });
  const uniformValuesRef = useRef({});

  // Sync uniform tracking from sceneJSON.
  // When the agent modifies uniforms via write_scene / write_file,
  // detect changed values and dispatch external-change events so
  // control components update their local state.
  useEffect(() => {
    if (!sceneJSON?.uniforms) return;
    const vals = uniformValuesRef.current;
    for (const [name, def] of Object.entries(sceneJSON.uniforms)) {
      if (def.value === undefined) continue;
      const prev = vals[name];
      const next = def.value;
      // Check if the value actually changed (deep compare for arrays)
      const changed = prev === undefined
        ? false // first init — no event needed, just track
        : Array.isArray(next) && Array.isArray(prev)
          ? next.length !== prev.length || next.some((v, i) => v !== prev[i])
          : prev !== next;
      vals[name] = next;
      if (changed) {
        window.dispatchEvent(new CustomEvent("uniform-external-change", { detail: { uniform: name, value: next } }));
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
