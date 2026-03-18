import { useEffect } from "react";

/**
 * Loads sceneJSON into engine, handling backend switching + scene_loaded events.
 * Also syncs pause state, backend target, and the parent engineRef.
 */
export default function useSceneLoader(engineRef, { sceneJSON, paused, backendTarget, parentEngineRef, setError }) {
  // Switch backend when backendTarget changes at runtime
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !backendTarget) return;
    const prefer = (backendTarget === "webgpu" || backendTarget === "hybrid") ? "webgpu" : "webgl2";
    const hybrid = backendTarget === "hybrid";
    engine.switchBackend(prefer, { hybrid }).catch((err) => {
      console.warn("[ViewportNode] Backend switch warning:", err.message);
    });
  }, [backendTarget]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep App's engineRef in sync
  useEffect(() => {
    if (parentEngineRef && engineRef.current) {
      parentEngineRef.current = engineRef.current;
    }
    return () => {
      if (parentEngineRef) parentEngineRef.current = null;
    };
  }, [parentEngineRef]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load scene when sceneJSON changes
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (!sceneJSON) {
      const gl = engine.gl;
      if (gl && !gl.isContextLost()) {
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      }
      engine.loadScene({ mode: "shader", script: {} });
      return;
    }
    console.log("[ViewportNode] Loading scene:", sceneJSON.mode || "unknown");
    setError(null);

    const wantBackend = (sceneJSON.backendTarget === "webgpu" || sceneJSON.backendTarget === "hybrid") ? "webgpu" : "webgl2";
    const isHybrid = sceneJSON.backendTarget === "hybrid";

    // Dispose the old scene BEFORE switching backend to free GPU memory.
    // Without this, old WebGL2 resources (FBOs, textures, shaders) coexist
    // with the new WebGPU context during init, causing context loss.
    const currentBackend = engine._backendOptions?.preferBackend || "webgl2";
    const currentHybrid = !!engine._backendOptions?.hybrid;
    const needsSwitch = currentBackend !== wantBackend || currentHybrid !== isHybrid;
    if (needsSwitch) {
      engine._disposeScene();
    }

    let switchFailed = false;
    const switchPromise = engine.switchBackend(wantBackend, { hybrid: isHybrid }).catch((err) => {
      console.warn("[ViewportNode] Backend switch failed:", err?.message);
      switchFailed = true;
      // Don't swallow — propagate error so loadScene is skipped
      throw err;
    });

    const readyPromise = switchPromise.then(() => {
      if (engine._backendPromise) return engine._backendPromise.catch(() => {});
    });

    readyPromise.then(() => {
        engine.loadScene(sceneJSON);
        return Promise.race([
          engine._setupPromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error("Scene setup timed out (10s)")), 10000)),
        ]);
      })
      .then(() => {
        // Ensure at least one frame renders even when paused,
        // so the canvas isn't black after a page refresh.
        if (engine._paused) engine._needsPausedRender = true;

        window.dispatchEvent(new CustomEvent("siljangnim:scene_loaded", {
          detail: {
            setupReady: engine._setupReady,
            // Pass last error so ackSceneLoad can include it even if
            // console error collection missed it due to timing
            error: engine._setupReady ? undefined : (engine._lastSetupError || undefined),
          },
        }));
      })
      .catch((err) => {
        console.error("[ViewportNode] loadScene error:", err);
        setError(err.message || String(err));
        window.dispatchEvent(new CustomEvent("siljangnim:scene_loaded", {
          detail: { setupReady: false, error: err.message },
        }));
      });
  }, [sceneJSON]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle pause/resume
  useEffect(() => {
    const engine = engineRef.current;
    if (engine) engine.setPaused(!!paused);
  }, [paused]); // eslint-disable-line react-hooks/exhaustive-deps
}
