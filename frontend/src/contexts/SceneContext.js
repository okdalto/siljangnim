import { createContext } from "react";

/**
 * React Context for sharing scene-related state.
 * Reduces prop drilling for commonly needed values.
 */
const SceneContext = createContext(null);

export default SceneContext;
