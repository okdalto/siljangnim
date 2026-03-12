import { useEffect, useRef, useState } from "react";
import GLEngine from "../../engine/GLEngine.js";

/**
 * Creates & starts a GLEngine on mount, disposes on unmount.
 * Returns { engineRef, fps, backendName, error, setError, missingAssets, setMissingAssets }.
 */
export default function useEngineInit(canvasRef, { backendTarget, onError }) {
  const engineRef = useRef(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const [fps, setFps] = useState(0);
  const [backendName, setBackendName] = useState("WebGL2");
  const [error, setError] = useState(null);
  const [missingAssets, setMissingAssets] = useState([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      const prefer = (backendTarget === "webgpu" || backendTarget === "hybrid") ? "webgpu" : "webgl2";
      const engine = new GLEngine(canvas, { preferBackend: prefer });
      engine.onError = (err) => {
        console.error("[ViewportNode] GLEngine error:", err);
        setError(err.message || String(err));
        onErrorRef.current?.(err);
      };
      engine.onFPS = setFps;
      engine.onBackendReady = (type) => {
        setBackendName(
          backendTarget === "hybrid" ? "Hybrid (WebGL2+WebGPU)" :
          type === "webgpu" ? "WebGPU" : "WebGL2"
        );
      };
      engine.onMissingAssets = (list) => {
        setMissingAssets(list);
      };
      engineRef.current = engine;

      engine.initBackend().catch((err) => {
        console.warn("[ViewportNode] Backend init warning:", err.message);
      });

      engine.start();
      console.log("[ViewportNode] Engine started");

      return () => {
        engine.dispose();
        engineRef.current = null;
      };
    } catch (err) {
      console.error("[ViewportNode] Failed to create engine:", err);
      setError(err.message || "WebGL2 not supported");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { engineRef, fps, backendName, error, setError, missingAssets, setMissingAssets };
}
