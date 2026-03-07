import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Hook that manages AI debugging state and integrates with the Debug Panel.
 *
 * Collects runtime/compile/validation logs, runs diagnosis via AIDebugger,
 * generates patches, and applies them through repair branches.
 */
export default function useAIDebugger(sendRef, sceneJSONRef, addLog, { onRepairApplied } = {}) {
  const [compileLogs, setCompileLogs] = useState([]);
  const [validationLogs, setValidationLogs] = useState([]);
  const [diagnosis, setDiagnosis] = useState(null);
  const [patches, setPatches] = useState([]);
  const [simpleExplanation, setSimpleExplanation] = useState(null);

  // Lazy import the debugger to avoid circular deps
  const debuggerRef = useRef(null);
  const getDebugger = useCallback(async () => {
    if (!debuggerRef.current) {
      const { default: AIDebugger } = await import("../engine/aiDebugger.js");
      debuggerRef.current = new AIDebugger();
    }
    return debuggerRef.current;
  }, []);

  // --- Log collection ---

  const addCompileLog = useCallback((shaderType, source, errorMsg) => {
    const entry = {
      agent: "WebGL",
      message: `[${shaderType}] ${errorMsg}`,
      level: "compile",
      timestamp: Date.now(),
      _raw: { shaderType, source, errorMsg },
    };
    setCompileLogs((prev) => [...prev.slice(-199), entry]);

    // Also feed to the debugger
    getDebugger().then((dbg) => dbg.addCompileLog(shaderType, source, errorMsg));
  }, [getDebugger]);

  const addValidationLog = useCallback((type, message) => {
    const entry = {
      agent: "WebGL",
      message: `[${type}] ${message}`,
      level: "validation",
      timestamp: Date.now(),
    };
    setValidationLogs((prev) => [...prev.slice(-199), entry]);

    getDebugger().then((dbg) => dbg.addValidationLog(type, message));
  }, [getDebugger]);

  const addRuntimeError = useCallback((error, scriptSection) => {
    getDebugger().then((dbg) => dbg.addRuntimeLog(error, scriptSection));
  }, [getDebugger]);

  const addPerformanceLog = useCallback((metric, value, threshold) => {
    getDebugger().then((dbg) => dbg.addPerformanceLog(metric, value, threshold));
  }, [getDebugger]);

  // --- Auto-forward WebGPU validation errors to the debugger ---
  useEffect(() => {
    const handler = (e) => {
      const { type, message } = e.detail || {};
      addValidationLog(type || "gpu", message || "Unknown validation error");
    };
    window.addEventListener("gpu-validation-error", handler);
    return () => window.removeEventListener("gpu-validation-error", handler);
  }, [addValidationLog]);

  // --- Diagnosis (heuristic + optional LLM) ---

  const runDiagnosis = useCallback(async (opts = {}) => {
    const dbg = await getDebugger();
    const result = dbg.diagnose();

    const generatedPatches = dbg.generatePatches(result);
    let allErrors = result.errors;
    let allPatches = generatedPatches;
    let explanation = dbg.explainSimply(result);

    // Run LLM deep diagnosis if API key provided
    if (opts.apiKey) {
      try {
        addLog?.({ agent: "Debugger", message: "Running LLM deep diagnosis...", level: "info" });
        const { llmDiagnose } = await import("../engine/aiDebugger.js");
        const currentScene = sceneJSONRef?.current;
        if (currentScene) {
          const llmResult = await llmDiagnose(currentScene, result, {
            apiKey: opts.apiKey,
            provider: opts.provider,
            model: opts.model,
          });
          allErrors = [...allErrors, ...llmResult.deepErrors];
          allPatches = [...allPatches, ...llmResult.patches];
          if (llmResult.explanation) explanation += "\n\n[LLM] " + llmResult.explanation;
        }
      } catch (e) {
        addLog?.({ agent: "Debugger", message: `LLM diagnosis failed: ${e.message}`, level: "warning" });
      }
    }

    const mergedDiagnosis = {
      errors: allErrors,
      summary: result.summary,
      healthScore: Math.max(0, 100 - allErrors.filter((e) => e.severity === "error").length * 25 - allErrors.filter((e) => e.severity === "warning").length * 5),
    };

    setDiagnosis(mergedDiagnosis);
    setPatches(allPatches);
    setSimpleExplanation(explanation);

    if (allErrors.length > 0) {
      addLog?.({
        agent: "Debugger",
        message: `Diagnosis: ${allErrors.length} issue(s) found. Health: ${mergedDiagnosis.healthScore}/100`,
        level: allErrors.some((e) => e.severity === "error") ? "error" : "warning",
      });
    } else {
      addLog?.({ agent: "Debugger", message: "Diagnosis: No issues found. Health: 100/100", level: "result" });
    }

    return mergedDiagnosis;
  }, [getDebugger, addLog, sceneJSONRef]);

  // --- Repair Branch (one-click diagnose + auto-fix) ---

  const runRepairBranch = useCallback(async (opts = {}) => {
    const currentScene = sceneJSONRef?.current;
    if (!currentScene) {
      addLog?.({ agent: "Debugger", message: "Cannot run repair: no scene loaded", level: "error" });
      return null;
    }

    addLog?.({ agent: "Debugger", message: "Creating repair branch...", level: "info" });

    try {
      const { createRepairBranch } = await import("../engine/aiDebugger.js");
      const result = await createRepairBranch(currentScene, opts);

      setDiagnosis(result.diagnosis);
      setSimpleExplanation(result.explanation);

      if (result.appliedPatches.length > 0) {
        // Apply the repaired scene
        const storageModule = await import("../engine/storage.js");
        await storageModule.writeJson("scene.json", result.repairedScene);

        sendRef.current?.({ type: "scene_update", scene_json: result.repairedScene });

        addLog?.({
          agent: "Debugger",
          message: `Repair branch applied ${result.appliedPatches.length} fix(es). Health: ${result.diagnosis.healthScore}/100`,
          level: "result",
        });

        onRepairApplied?.({
          type: "agent_repair_node",
          title: `Repair: ${result.appliedPatches.length} auto-fixes`,
          patchCount: result.appliedPatches.length,
          fixedScene: result.repairedScene,
        });
      } else {
        addLog?.({ agent: "Debugger", message: "No safe auto-fixes available.", level: "info" });
      }

      return result;
    } catch (e) {
      addLog?.({ agent: "Debugger", message: `Repair branch failed: ${e.message}`, level: "error" });
      return null;
    }
  }, [sceneJSONRef, sendRef, addLog, onRepairApplied]);

  // --- Patch application ---

  const applyPatch = useCallback(async (patch) => {
    const dbg = await getDebugger();
    const currentScene = sceneJSONRef?.current;
    if (!currentScene) {
      addLog?.({ agent: "Debugger", message: "Cannot apply patch: no scene loaded", level: "error" });
      return;
    }

    try {
      const fixedScene = dbg.applyPatch(patch, currentScene);

      // Create a repair branch entry in the debug log
      addLog?.({
        agent: "Debugger",
        message: `Applied fix: ${patch.description} (confidence: ${Math.round(patch.confidence * 100)}%)`,
        level: "result",
      });

      // Broadcast the fixed scene through the message bus
      sendRef.current?.({
        type: "console_error",
        message: "", // clear pending errors
      });

      // Write the fixed scene via the agent engine
      const { default: storageApi } = await import("../engine/storage.js");
      await storageApi.writeJson("scene.json", fixedScene);

      // Broadcast scene update
      sendRef.current?.({
        type: "scene_update",
        scene_json: fixedScene,
      });

      // Record the repair in debug logs for tree node tracking
      addLog?.({
        agent: "Debugger",
        message: `Repair branch: ${patch.type} fix for ${patch.errorId}`,
        level: "info",
      });

      // Notify parent so it can create a repair node in the project tree
      onRepairApplied?.({
        type: "agent_repair_node",
        title: `Auto-fix: ${patch.description}`,
        patchType: patch.type,
        errorId: patch.errorId,
        confidence: patch.confidence,
        fixedScene: fixedScene,
      });

    } catch (e) {
      addLog?.({
        agent: "Debugger",
        message: `Patch failed: ${e.message}`,
        level: "error",
      });
    }
  }, [getDebugger, sceneJSONRef, sendRef, addLog]);

  // --- Clear ---

  const clearDiagnosis = useCallback(() => {
    setDiagnosis(null);
    setPatches([]);
    setSimpleExplanation(null);
    getDebugger().then((dbg) => dbg.clearLogs());
  }, [getDebugger]);

  return {
    compileLogs,
    validationLogs,
    diagnosis,
    patches,
    simpleExplanation,
    addCompileLog,
    addValidationLog,
    addRuntimeError,
    addPerformanceLog,
    runDiagnosis,
    runRepairBranch,
    applyPatch,
    clearDiagnosis,
  };
}
