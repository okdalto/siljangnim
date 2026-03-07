import { useCallback, useState, useRef } from "react";

/**
 * Hook managing prompt mode state (Technical / Hybrid / Art).
 * Integrates with the prompt pipeline to add art direction metadata.
 */
export default function usePromptMode() {
  const [promptMode, setPromptMode] = useState(() => {
    return localStorage.getItem("siljangnim:promptMode") || "hybrid";
  });
  const [lastMetadata, setLastMetadata] = useState(null);
  const interpreterRef = useRef(null);

  // Lazy load the prompt mode engine
  const getInterpreter = useCallback(async () => {
    if (!interpreterRef.current) {
      const mod = await import("../engine/promptMode.js");
      interpreterRef.current = mod;
    }
    return interpreterRef.current;
  }, []);

  const changeMode = useCallback((mode) => {
    setPromptMode(mode);
    localStorage.setItem("siljangnim:promptMode", mode);
  }, []);

  /**
   * Interpret a user prompt according to the current mode.
   * Returns interpretation object with technical + art direction layers.
   */
  const interpretPrompt = useCallback(async (userPrompt) => {
    const mod = await getInterpreter();
    const interpretation = mod.interpretPrompt(userPrompt, promptMode);
    const metadata = mod.generateArtMetadata(interpretation);
    setLastMetadata(metadata);
    return interpretation;
  }, [promptMode, getInterpreter]);

  /**
   * Build additional system prompt text based on interpretation.
   */
  const buildModePrompt = useCallback(async (interpretation) => {
    const mod = await getInterpreter();
    return mod.buildModeSystemPrompt(interpretation);
  }, [getInterpreter]);

  return {
    promptMode,
    setPromptMode: changeMode,
    lastMetadata,
    interpretPrompt,
    buildModePrompt,
  };
}
