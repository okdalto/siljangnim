import ChatNode from "../nodes/ChatNode.jsx";
import CustomPanelNode from "../nodes/CustomPanelNode.jsx";
import ViewportNode from "../nodes/ViewportNode.jsx";
import DebugLogNode from "../nodes/DebugLogNode.jsx";
import AssetBrowserNode from "../nodes/AssetBrowserNode.jsx";

export const nodeTypes = {
  chat: ChatNode,
  viewport: ViewportNode,
  debugLog: DebugLogNode,
  customPanel: CustomPanelNode,
  assetBrowser: AssetBrowserNode,
};

export const initialNodes = [
  {
    id: "chat",
    type: "chat",
    position: { x: 50, y: 550 },
    style: { width: 670, height: 380 },
    data: { messages: [], onSend: () => { } },
  },
  {
    id: "viewport",
    type: "viewport",
    position: { x: 50, y: 50 },
    style: { width: 670, height: 480 },
    data: { sceneJSON: null, engineRef: null, paused: false },
  },
  {
    id: "debugLog",
    type: "debugLog",
    position: { x: 750, y: 50 },
    style: { width: 320, height: 480 },
    data: { logs: [] },
  },
  {
    id: "assetBrowser",
    type: "assetBrowser",
    position: { x: 750, y: 550 },
    style: { width: 320, height: 380 },
    data: { assets: new Map(), onDelete: () => {}, onSelect: () => {}, onUpload: () => {} },
  },
];
