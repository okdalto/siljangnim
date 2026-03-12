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
    engine.switchBackend(prefer).catch((err) => {
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
    const switchPromise = engine.switchBackend(wantBackend).catch((err) => {
      console.warn("[ViewportNode] Backend switch warning:", err?.message);
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
        window.dispatchEvent(new CustomEvent("siljangnim:scene_loaded", {
          detail: { setupReady: engine._setupReady },
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
