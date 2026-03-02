import { createContext } from "react";

/**
 * React Context for sharing the GLEngine instance.
 * The primary ViewportNode creates the engine and provides it.
 * Other nodes (CustomPanelNode, etc.) consume it.
 */
const EngineContext = createContext(null);

export default EngineContext;
