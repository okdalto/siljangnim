import { useCallback, useState } from "react";
import {
  buildModeSystemPrompt,
  generateArtMetadata,
  interpretPrompt as interpretPromptMode,
} from "../engine/promptMode.js";

/**
 * Hook managing prompt mode state (Technical / Hybrid / Art).
 * Integrates with the prompt pipeline to add art direction metadata.
 */
export default function usePromptMode() {
  const [promptMode, setPromptMode] = useState(() => {
    return localStorage.getItem("siljangnim:promptMode") || "hybrid";
  });
  const [lastMetadata, setLastMetadata] = useState(null);

  const changeMode = useCallback((mode) => {
    setPromptMode(mode);
    localStorage.setItem("siljangnim:promptMode", mode);
  }, []);

  /**
   * Interpret a user prompt according to the current mode.
   * Returns interpretation object with technical + art direction layers.
   */
  const interpretPrompt = useCallback(async (userPrompt) => {
    const interpretation = interpretPromptMode(userPrompt, promptMode);
    const metadata = generateArtMetadata(interpretation);
    setLastMetadata(metadata);
    return interpretation;
  }, [promptMode]);

  /**
   * Build additional system prompt text based on interpretation.
   */
  const buildModePrompt = useCallback(async (interpretation) => {
    return buildModeSystemPrompt(interpretation);
  }, []);

  return {
    promptMode,
    setPromptMode: changeMode,
    lastMetadata,
    interpretPrompt,
    buildModePrompt,
  };
}
